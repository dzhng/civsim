import { tgpu, d, std } from "typegpu";
import type { ImpostorAtlasLayout } from "../../../soldier-assets/src/impostorAtlas";
import type { CrowdInstance } from "../../../crowd-runtime/src/instanceData";
import { corpsePresentationStrength } from "../../../crowd-runtime/src/instanceData";
import type { ImpostorView } from "../impostorData";

/** The billboard record derived from camera-independent soldier state, as typed TypeGPU
 * functions rather than shader text. `packImpostors` stays the independent CPU oracle and
 * is never routed through here; these bodies mirror it step for step, expression for
 * expression, so the only difference a GPU run can introduce is f32 evaluation.
 *
 * Nothing in this module reads a binding: the view arrives as an argument and the atlas
 * is closure state, so the same function runs in the vertex stage, in a diagnostic compute
 * stage, and directly in JavaScript where a test can pin it against the oracle. */

/** Per-soldier vertex state. Every field survives a camera move untouched. */
export const ImpostorState = d.struct({
  position: d.vec2f,
  facing: d.f32,
  faction: d.f32,
  elevation: d.f32,
  living: d.f32,
});
/** The whole camera dependency, for any population: 48 bytes. */
export const ImpostorViewBlock = d.struct({
  right: d.vec3f,
  /** `tan(fovY / 2)`, or zero when the projection has no positive vertical field. */
  tanHalfFov: d.f32,
  up: d.vec3f,
  eye: d.vec3f,
});
/** What `packImpostors` writes per soldier, named. The CPU record repeats `span` as the
 * quad's width and height; one value owns both. */
export const ImpostorRecord = d.struct({
  anchor: d.vec3f,
  faction: d.f32,
  tile: d.f32,
  span: d.f32,
  angle: d.f32,
  living: d.f32,
});
export type ImpostorRecordValue = d.Infer<typeof ImpostorRecord>;
/** One derived record as the nine floats a billboard actually carries, in the order
 * `packImpostors` writes them and Three's instance attributes hold them. The single span
 * becomes the quad's width and height here, which is exactly what the vertex stage does
 * with it; every consumer of a derived record — the hardware fixture check and the lab's
 * numerical control — expands it through this one owner. */
export const impostorRecordFloats = (record: ImpostorRecordValue): number[] => [
  record.anchor.x,
  record.anchor.y,
  record.anchor.z,
  record.faction,
  record.tile,
  record.span,
  record.span,
  record.angle,
  record.living,
];
const TileHit = d.struct({ index: d.i32, dot: d.f32 });

export const IMPOSTOR_STATE_FLOATS = 6;
/** Below every attainable dot product, standing in for the reference's `-Infinity` seed:
 * the first tile still wins a tie, and a scan that finds nothing still keeps tile 0. */
const NO_TILE_DOT = -1e30;
const HALF_PI = Math.PI / 2;
/** The authored screen-size floor: below this fraction of the viewport the quad grows. */
const MIN_SCREEN_FRACTION = 0.008;

/** `tan(fovY / 2)` under the oracle's guard, so the uniform carries the same zero. */
export const tanHalfFov = (fovY: number) => (fovY > 0 ? Math.tan(fovY / 2) : 0);

/** The camera-independent state of one soldier, in the order the vertex layout expects. */
export function writeImpostorState(
  instance: CrowdInstance,
  out: Float32Array,
  offset: number,
): void {
  out[offset] = instance.x;
  out[offset + 1] = instance.y;
  out[offset + 2] = instance.facing;
  out[offset + 3] = instance.faction;
  out[offset + 4] = instance.elevation ?? 0;
  out[offset + 5] = 1 - corpsePresentationStrength(instance);
}

/** The view block a camera publishes, with no per-soldier term in it. */
export function impostorViewBlock(view: ImpostorView) {
  return {
    right: d.vec3f(...view.right),
    tanHalfFov: tanHalfFov(view.fovY),
    up: d.vec3f(...view.up),
    eye: d.vec3f(...view.eye),
  };
}

/** The derivation for one atlas. Columns, rows, anchor and span are baked: an atlas change
 * is already a new layer and a new pipeline. */
export function impostorDerivation(atlas: ImpostorAtlasLayout) {
  const { columns, rows } = atlas;
  const [centerX, centerY, centerZ] = atlas.center;
  const { worldSpan } = atlas;

  /** `Math.sign(value || 1)`: the reference folds a zero coordinate to the positive side. */
  const foldSign = tgpu.fn(
    [d.f32],
    d.f32,
  )((value) => {
    "use gpu";
    return std.select(std.sign(value), 1, value === 0);
  });
  /** One baked tile direction, evaluated rather than stored — the closed form of
   * `hemiOctTileDirections` for a single cell, including the corner fold. */
  const tileDirection = tgpu.fn(
    [d.i32, d.i32],
    d.vec3f,
  )((tx, ty) => {
    "use gpu";
    const ox = ((d.f32(tx) + 0.5) / columns) * 2 - 1;
    const oy = ((d.f32(ty) + 0.5) / rows) * 2 - 1;
    let dx = ox;
    let dy = oy;
    let dz = 1 - std.abs(ox) - std.abs(oy);
    if (dz < 0) {
      dx = (1 - std.abs(oy)) * foldSign(ox);
      dy = (1 - std.abs(ox)) * foldSign(oy);
      dz = -dz;
    }
    const direction = d.vec3f(dx, dy, dz);
    const length = std.length(direction);
    return std.div(direction, std.select(1, length, length > 0));
  });
  /** Exhaustive nearest-by-dot: the reference, and the fallback below the horizon.
   * Row-major, strictly-greater — the reference's tie-break, tile for tile. */
  const exhaustiveTile = tgpu.fn(
    [d.vec3f],
    d.i32,
  )((direction) => {
    "use gpu";
    let index = 0;
    let best = NO_TILE_DOT;
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < columns; tx++) {
        const value = std.dot(direction, tileDirection(tx, ty));
        if (value > best) {
          best = value;
          index = ty * columns + tx;
        }
      }
    }
    return index;
  });
  /** The 3x3 refinement around one projected cell, carrying the best hit so far. */
  const scanNeighbourhood = tgpu.fn(
    [d.vec3f, d.f32, d.f32, TileHit],
    TileHit,
  )((direction, u, v, incoming) => {
    "use gpu";
    let index = incoming.index;
    let best = incoming.dot;
    const originX = std.clamp(d.i32(std.floor((u + 1) * 0.5 * columns)), 0, columns - 1);
    const originY = std.clamp(d.i32(std.floor((v + 1) * 0.5 * rows)), 0, rows - 1);
    for (let ty = originY - 1; ty <= originY + 1; ty++) {
      for (let tx = originX - 1; tx <= originX + 1; tx++) {
        if (ty >= 0 && ty < rows && tx >= 0 && tx < columns) {
          const value = std.dot(direction, tileDirection(tx, ty));
          if (value > best) {
            best = value;
            index = ty * columns + tx;
          }
        }
      }
    }
    return TileHit({ index, dot: best });
  });
  /** Nearest tile for a unit direction: the closed-form hit refined by its neighbourhood
   * and by the corner cell that folds onto it, with the exhaustive scan below the horizon. */
  const impostorTile = tgpu.fn(
    [d.vec3f],
    d.i32,
  )((direction) => {
    "use gpu";
    if (direction.z >= 0) {
      const sum = std.abs(direction.x) + std.abs(direction.y) + direction.z;
      if (sum > 0) {
        const u = direction.x / sum;
        const v = direction.y / sum;
        const near = scanNeighbourhood(direction, u, v, TileHit({ index: 0, dot: NO_TILE_DOT }));
        // The corner cell that folds onto (u, v) can hold the nearest centre.
        const folded = scanNeighbourhood(
          direction,
          std.select(d.f32(1), d.f32(-1), u < 0) * (1 - std.abs(v)),
          std.select(d.f32(1), d.f32(-1), v < 0) * (1 - std.abs(u)),
          near,
        );
        return folded.index;
      }
      return 0;
    }
    return exhaustiveTile(direction);
  });
  /** One soldier's billboard record for one view. */
  const deriveImpostorRecord = tgpu.fn(
    [ImpostorState, ImpostorViewBlock],
    ImpostorRecord,
  )((state, view) => {
    "use gpu";
    const angle = state.facing - HALF_PI;
    const c = std.cos(angle);
    const s = std.sin(angle);
    const delta = std.sub(view.eye, d.vec3f(state.position, state.elevation));
    const distance = std.length(delta);
    const unit = std.div(delta, std.select(1, distance, distance > 0));
    const local = d.vec3f(unit.x * c + unit.y * s, -unit.x * s + unit.y * c, unit.z);
    const localLength = std.length(local);
    const tile = impostorTile(std.div(local, std.select(1, localLength, localLength > 0)));
    let span = worldSpan;
    if (view.tanHalfFov > 0 && distance > 0) {
      const screenFraction = worldSpan / (2 * distance * view.tanHalfFov);
      if (screenFraction < MIN_SCREEN_FRACTION)
        span = span * (MIN_SCREEN_FRACTION / screenFraction);
    }
    return ImpostorRecord({
      anchor: d.vec3f(
        state.position.x + centerX * c - centerY * s,
        state.position.y + centerX * s + centerY * c,
        state.elevation + centerZ,
      ),
      faction: state.faction,
      tile: d.f32(tile),
      span,
      angle,
      living: state.living,
    });
  });
  return { deriveImpostorRecord, impostorTile, tileDirection };
}
