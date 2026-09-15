import * as THREE from "three/webgpu";
import { attribute, texture, vec4 } from "three/tsl";
import {
  CampaignLabelFrame,
  type CampaignLabel,
} from "../../../game-renderer/src/campaign/labelFrame";
import type {
  CampaignLabelPlacementStyle,
  CampaignLabelProjection,
} from "../../../game-renderer/src/campaign/labelLayout";
import type { CameraSnapshot } from "../../../renderer-core/src/cameraUniform";
import { RENDER_ORDER } from "../renderOrder";

/** Screen glyphs share the world's canvas, but deliberately do not test terrain depth. */
export class CampaignLabelLayer {
  private readonly frame = new CampaignLabelFrame();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.MeshBasicNodeMaterial();
  private readonly mesh = new THREE.Mesh(this.geometry, this.material);
  private atlas = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  private readonly sample = texture(this.atlas);

  constructor(private readonly scene: THREE.Scene) {
    this.material.vertexNode = vec4(attribute<"vec3">("position", "vec3"), 1);
    this.material.fragmentNode = this.sample;
    this.material.side = THREE.DoubleSide;
    this.material.forceSinglePass = true;
    this.material.transparent = true;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.toneMapped = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.readout;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(
    labels: CampaignLabel[],
    camera: CameraSnapshot,
    dpr: number,
    placement: CampaignLabelPlacementStyle | undefined,
    project: CampaignLabelProjection,
  ) {
    const previous = this.frame.atlas;
    this.frame.update(labels, camera, dpr, placement, project);
    const atlas = this.frame.atlas;
    this.mesh.visible = !!atlas && this.frame.vertices.length > 0;
    if (!atlas || atlas === previous) return;
    this.atlas.dispose();
    this.atlas = new THREE.DataTexture(atlas.pixels, atlas.width, atlas.height);
    this.atlas.colorSpace = THREE.SRGBColorSpace;
    this.atlas.minFilter = THREE.LinearFilter;
    this.atlas.magFilter = THREE.LinearFilter;
    this.atlas.needsUpdate = true;
    this.sample.value = this.atlas;
    const vertices = this.frame.vertices;
    const positions = new Float32Array(vertices.length / 2);
    const uvs = new Float32Array(vertices.length / 3);
    for (let i = 0, v = 0; i < vertices.length; i += 6, v++) {
      positions[v * 3] = ((vertices[i] + vertices[i + 2]) / camera.width) * 2 - 1;
      positions[v * 3 + 1] = 1 - ((vertices[i + 1] + vertices[i + 3]) / camera.height) * 2;
      uvs[v * 2] = vertices[i + 4];
      uvs[v * 2 + 1] = vertices[i + 5];
    }
    this.geometry.dispose();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    this.geometry.setDrawRange(0, positions.length / 3);
  }

  stats() {
    return { ...this.frame.stats(), layer: "physical-gpu-glyph-atlas" as const };
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}
