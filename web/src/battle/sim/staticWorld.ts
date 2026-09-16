/** Everything about a battle that never changes with a tick, read once where the
 * `Game` lives. The frame coordinator needs terrain, vista and the generated-map
 * descriptors before it can build a renderer, so these travel with the authority's
 * ready reply instead of being re-read per frame across the transport. */
import { readBattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainGrid";
import type { BattleVistaGrid } from "@packages/game-renderer/src/battle/vistaSurface";
import type { Game } from "../../wasm/game_wasm.js";
import type { GeneratedBattleMapDescriptor } from "../battleWorld";
import type { BattleSimIdentity } from "./protocol";

export function readGeneratedVistaGrid(
  game: Game,
  memory: WebAssembly.Memory,
  descriptor: Pick<GeneratedBattleMapDescriptor, "vista">,
): BattleVistaGrid | null {
  const vista = descriptor.vista;
  if (!vista?.bands?.length) return null;
  const count = Math.min(game.generated_vista_band_count(), vista.bands.length);
  const bands: BattleVistaGrid["bands"] = [];
  for (let index = 0; index < count; index++) {
    const meta = vista.bands[index];
    const width = game.generated_vista_band_width(index);
    const height = game.generated_vista_band_height(index);
    const cell = game.generated_vista_band_cell(index);
    const originX = game.generated_vista_band_origin_x(index);
    const originY = game.generated_vista_band_origin_y(index);
    const pointer = game.generated_vista_band_height_ptr(index);
    if (!meta || width <= 0 || height <= 0 || pointer === 0) continue;
    const heights = new Float32Array(new Float32Array(memory.buffer, pointer, width * height));
    bands.push({
      name: meta.name,
      w: width,
      h: height,
      cell,
      ox: originX,
      oy: originY,
      innerHalfW: meta.innerHalfW,
      innerHalfH: meta.innerHalfH,
      outerHalfW: meta.outerHalfW,
      outerHalfH: meta.outerHalfH,
      height: heights,
      water: new Float32Array(
        new Float32Array(memory.buffer, game.generated_vista_band_water_ptr(index), width * height),
      ),
    });
  }
  return bands.length > 0 ? { shape: vista.shape, bands } : null;
}

/** Collect the immutable identity of one battle, plus every transferable array in
 * it so the reply moves its storage instead of cloning it. */
export function readStaticWorld(
  game: Game,
  memory: WebAssembly.Memory,
  publicationCapacityBytes: number,
): { identity: BattleSimIdentity; transfers: Transferable[] } {
  const terrain = readBattleTerrainGrid(game, memory);
  // The constructed battle owns its terrain identity, including campaign handoffs.
  const generated = game.generated_vista_band_count() > 0;
  const generatedMap = generated
    ? (JSON.parse(game.generated_map_descriptor()) as GeneratedBattleMapDescriptor)
    : null;
  const vista = generatedMap ? readGeneratedVistaGrid(game, memory, generatedMap) : null;
  const identity: BattleSimIdentity = {
    classSpecs: game.class_specs(),
    releaseDuration: game.loosing_duration(),
    unitInfoStride: game.unit_info_stride(),
    soldiers: game.soldier_count(),
    units: game.unit_count(),
    terrain,
    vista,
    generatedMap,
    generatedMapManifest: generated ? game.generated_map_manifest() : null,
    generatedMapCertificates: generated ? game.generated_map_certificates() : null,
    initialStateHash: game.state_hash().toString(),
    publicationCapacityBytes,
  };
  const transfers: Transferable[] = [
    terrain.tint.buffer,
    terrain.height!.buffer,
    terrain.rough!.buffer,
    terrain.speed!.buffer,
    ...(vista?.bands.flatMap((band) => [band.height.buffer, band.water.buffer]) ?? []),
  ];
  return { identity, transfers };
}
