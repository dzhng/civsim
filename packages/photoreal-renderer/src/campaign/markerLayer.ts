import * as THREE from "three/webgpu";
import { attribute, vec4, wgslFn } from "three/tsl";
import {
  CAMPAIGN_MARKER_COLOR_WGSL,
  type CampaignMarker,
} from "../../../game-renderer/src/campaign/marker";
import { linearAlbedo } from "../landscape/shaderNodes";
import { RENDER_ORDER } from "../renderOrder";

/** Existing overview flags stay screen-sized while their anchors follow terrain. */
export class CampaignMarkerLayer {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.MeshBasicNodeMaterial();
  private readonly mesh = new THREE.Mesh(this.geometry, this.material);
  private count = 0;
  private key = "";

  constructor(private readonly scene: THREE.Scene) {
    const color = wgslFn(CAMPAIGN_MARKER_COLOR_WGSL)(
      attribute<"vec2">("markerLocal", "vec2"),
      attribute<"vec3">("faction", "vec3"),
      attribute<"float">("selected", "float"),
    ) as THREE.Node<"vec4">;
    this.material.vertexNode = vec4(attribute<"vec3">("position", "vec3"), 1);
    this.material.fragmentNode = vec4(linearAlbedo(color.rgb), color.a);
    this.material.transparent = true;
    this.material.side = THREE.DoubleSide;
    this.material.forceSinglePass = true;
    this.material.depthTest = this.material.depthWrite = false;
    this.material.toneMapped = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.readout - 1;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(
    markers: readonly CampaignMarker[],
    width: number,
    height: number,
    project: (marker: CampaignMarker) => { x: number; y: number; visible: boolean } | null,
  ) {
    const visible = markers.flatMap((marker) => {
      const anchor = project(marker);
      return marker.kind === "army" && anchor?.visible ? [{ marker, anchor }] : [];
    });
    const key = JSON.stringify([width, height, visible]);
    if (key === this.key) return;
    this.key = key;
    this.count = visible.length;
    this.mesh.visible = this.count > 0;
    const positions: number[] = [],
      local: number[] = [],
      faction: number[] = [],
      selected: number[] = [];
    for (const { marker, anchor } of visible)
      for (const [x, y] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        positions.push(
          ((anchor.x + x * marker.radius) / width) * 2 - 1,
          1 - ((anchor.y - (y + 1) * marker.radius) / height) * 2,
          0,
        );
        local.push(x, -y);
        faction.push(...marker.faction);
        selected.push(marker.selected ? 1 : 0);
      }
    this.geometry.dispose();
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute("markerLocal", new THREE.Float32BufferAttribute(local, 2));
    this.geometry.setAttribute("faction", new THREE.Float32BufferAttribute(faction, 3));
    this.geometry.setAttribute("selected", new THREE.Float32BufferAttribute(selected, 1));
    this.geometry.setDrawRange(0, this.count * 6);
  }
  stats() {
    return { markers: this.count };
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
