import * as THREE from "three/webgpu";
import { attribute, normalize, step, texture, uniform, varying, vec2, vec3, vec4 } from "three/tsl";
import { RENDER_ORDER } from "./terrainLayer";

import {
  QUAD,
  QUAD_INDEX,
  READOUT_CAMERA_BIAS,
  layoutReadout,
  buildChipAtlas,
  packReadoutChips,
  type BattleReadoutInstance,
  type ChipInstance,
  type AtlasEntry,
} from "../../../game-renderer/src/battle/readoutData";

export class PhotorealReadoutLayer {
  private readonly chipMesh: THREE.Mesh;
  private readonly chipGeometry: THREE.InstancedBufferGeometry;
  private readonly camRight = uniform(new THREE.Vector3(1, 0, 0));
  private readonly camUp = uniform(new THREE.Vector3(0, 0, 1));
  private readonly camPos = uniform(new THREE.Vector3(0, 0, 0));
  private readonly camFwd = uniform(new THREE.Vector3(0, 1, 0));
  private atlasTexture: THREE.CanvasTexture;
  private readonly chipAtlasNode: ReturnType<typeof texture>;
  private chipCapacity = 0;
  private chip0 = new Float32Array(0);
  private chip1 = new Float32Array(0);
  private chipUv = new Float32Array(0);
  private chipCount = 0;
  private readoutCount = 0;
  private atlasKey = "";
  private atlasEntries = new Map<string, AtlasEntry>();
  private sampleAnchors: { unitId: number; x: number; y: number; z: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.chipGeometry = makeBillboardGeometry();

    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    this.atlasTexture = new THREE.CanvasTexture(canvas);
    this.atlasTexture.name = "battle-readout-chip-glyph-atlas";
    // Canvas-space UVs: the default flipY mirrors the multi-row atlas at
    // upload, so every cell samples the wrong row.
    this.atlasTexture.flipY = false;
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    // No mipmaps: chips render as constant-size billboards, and mip levels
    // average the dark plates into the
    // transparent padding — a washed-out grey smear.
    this.atlasTexture.minFilter = THREE.LinearFilter;
    this.atlasTexture.magFilter = THREE.LinearFilter;
    this.atlasTexture.generateMipmaps = false;
    this.atlasTexture.needsUpdate = true;

    // OPAQUE + alphaTest cutout — the
    // ONE recipe proven to keep UI quads unwashed in this world (a
    // `transparent: true` quad ends up veiled by the transparent-pass
    // ordering against the sky backdrop). UI also opts out of the scene
    // tone-map (AgX desaturates chip colors) and of aerial fog.
    const chipMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    chipMaterial.depthTest = false;
    chipMaterial.depthWrite = false;
    chipMaterial.toneMapped = false;
    chipMaterial.fog = false;
    chipMaterial.alphaTest = 0.5;
    const chipQuad = attribute<"vec3">("position", "vec3");
    const chip0 = attribute<"vec4">("readoutChip0", "vec4");
    const chip1 = attribute<"vec4">("readoutChip1", "vec4");
    const chipUv = attribute<"vec4">("readoutChipUv", "vec4");
    // Anchors behind the camera would rasterize mirrored garbage quads —
    // collapse them to a point instead. Anchors in front are biased toward
    // the camera so the standard's own pole/finial/cloth at the same point
    // cannot depth-punch torn fragments through the readout plane. Depth is
    // disabled for these chips, including terrain occlusion.
    const chipAnchor0 = vec3(chip0.x, chip0.y, chip0.z);
    const chipToCam = vec3(this.camPos).sub(chipAnchor0);
    const chipInFront = step(0.0, chipToCam.dot(vec3(this.camFwd)).negate());
    const chipAnchor = chipAnchor0.add(normalize(chipToCam).mul(READOUT_CAMERA_BIAS));
    chipMaterial.positionNode = chipAnchor
      .add(
        vec3(this.camRight)
          .mul(chip1.x.add(chipQuad.x.mul(chip1.z)).mul(chip0.w))
          .mul(chipInFront),
      )
      .add(
        vec3(this.camUp)
          .mul(chip1.y.add(chipQuad.y.mul(chip1.w)).mul(chip0.w))
          .mul(chipInFront),
      );
    const localUv = varying(chipQuad.xy.add(vec2(0.5))).toVar();
    // Quad-local +y is screen-up but atlas v grows downward: v1 at the
    // quad bottom, v0 at the top.
    const uv = vec2(
      chipUv.x.add(chipUv.z.sub(chipUv.x).mul(localUv.x)),
      chipUv.w.add(chipUv.y.sub(chipUv.w).mul(localUv.y)),
    );
    this.chipAtlasNode = texture(this.atlasTexture, uv);
    chipMaterial.colorNode = this.chipAtlasNode;

    this.chipMesh = new THREE.Mesh(this.chipGeometry, chipMaterial);
    this.chipMesh.name = "battle-unit-readout-chip-glyphs";
    this.chipMesh.frustumCulled = false;
    this.chipMesh.renderOrder = RENDER_ORDER.readout;
    this.chipMesh.visible = false;
    scene.add(this.chipMesh);
  }

  setCameraBasis(camera: THREE.Camera): void {
    const m = camera.matrixWorld.elements;
    this.camRight.value.set(m[0], m[1], m[2]).normalize();
    this.camUp.value.set(m[4], m[5], m[6]).normalize();
    this.camPos.value.set(m[12], m[13], m[14]);
    // Column 2 is the camera's +z (backward); forward is its negation.
    this.camFwd.value.set(-m[8], -m[9], -m[10]).normalize();
  }

  upload(readouts: readonly BattleReadoutInstance[]): void {
    this.readoutCount = readouts.length;
    this.sampleAnchors = readouts
      .slice(0, 64)
      .map((r) => ({ unitId: r.unitId, x: r.x, y: r.y, z: r.z }));
    const chips: ChipInstance[] = [];
    for (const readout of readouts) layoutReadout(readout, chips);
    this.ensureAtlas(chips);
    this.uploadChips(chips);
  }

  stats() {
    return {
      readouts: this.readoutCount,
      chips: this.chipCount,
      anchors: this.sampleAnchors,
      atlasWidth: this.atlasTexture.image.width,
      atlasHeight: this.atlasTexture.image.height,
      layer: "photoreal-battle-readout-glyph-atlas" as const,
      depthPolicy:
        "depth-disabled in-scene billboard; toneMapped=false (UI, ungraded); renderOrder after soldiers" as const,
      orientation: "camera-facing basis from the active three camera" as const,
    };
  }

  dispose(): void {
    this.chipMesh.removeFromParent();
    this.chipGeometry.dispose();
    (this.chipMesh.material as THREE.Material).dispose();
    this.atlasTexture.dispose();
  }

  private uploadChips(chips: readonly ChipInstance[]): void {
    this.chipCount = chips.length;
    this.chipMesh.visible = chips.length > 0;
    if (chips.length === 0) {
      this.chipGeometry.instanceCount = 0;
      return;
    }
    if (chips.length > this.chipCapacity) {
      this.chipCapacity = Math.max(chips.length, this.chipCapacity * 2, 128);
      this.chip0 = new Float32Array(this.chipCapacity * 4);
      this.chip1 = new Float32Array(this.chipCapacity * 4);
      this.chipUv = new Float32Array(this.chipCapacity * 4);
      this.chipGeometry.setAttribute(
        "readoutChip0",
        new THREE.InstancedBufferAttribute(this.chip0, 4),
      );
      this.chipGeometry.setAttribute(
        "readoutChip1",
        new THREE.InstancedBufferAttribute(this.chip1, 4),
      );
      this.chipGeometry.setAttribute(
        "readoutChipUv",
        new THREE.InstancedBufferAttribute(this.chipUv, 4),
      );
    }
    packReadoutChips(chips, this.atlasEntries, this.chip0, this.chip1, this.chipUv);
    for (const name of ["readoutChip0", "readoutChip1", "readoutChipUv"] as const) {
      (this.chipGeometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.chipGeometry.instanceCount = chips.length;
  }

  private ensureAtlas(chips: readonly ChipInstance[]): void {
    const keys = [...new Set(chips.map((chip) => chip.key))].sort();
    const key = keys.join("|");
    if (key === this.atlasKey) return;
    this.atlasKey = key;
    const canvas = this.atlasTexture.image as HTMLCanvasElement;
    const width = canvas.width,
      height = canvas.height;
    this.atlasEntries = buildChipAtlas(keys, canvas);
    if (canvas.width !== width || canvas.height !== height) {
      // A Three texture's GPU dimensions are immutable after its first upload.
      // Keep the authored canvas/policy, but replace the resource when its atlas grows or shrinks.
      const previous = this.atlasTexture;
      this.atlasTexture = previous.clone();
      this.chipAtlasNode.value = this.atlasTexture;
      previous.dispose();
    }
    this.atlasTexture.needsUpdate = true;
  }
}

function makeBillboardGeometry(): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(QUAD, 3));
  geometry.setIndex(QUAD_INDEX);
  geometry.instanceCount = 0;
  return geometry;
}
