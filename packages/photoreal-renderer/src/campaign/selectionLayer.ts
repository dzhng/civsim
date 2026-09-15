import * as THREE from "three/webgpu";
import {
  attribute,
  varying,
  vec3,
  vec4,
  mix,
  float,
  smoothstep,
  length,
  max,
  Fn,
  Discard,
} from "three/tsl";
import {
  campaignSelectionVertices,
  CAMPAIGN_SELECTION_STYLE,
  CAMPAIGN_SELECTION_VERTEX_FLOATS,
  type CampaignSelectionInstance,
} from "../../../game-renderer/src/campaign/selection";
import { SELECTION_RING_PROFILE as P } from "../../../game-renderer/src/selectionRing";
import { linearAlbedo } from "../landscape/shaderNodes";
import { RENDER_ORDER } from "../renderOrder";
import type { RenderedSurface } from "../../../game-renderer/src/terrain/surface";

/** The established campaign ring, shaded from the shared normalized profile. */
export class CampaignSelectionLayer {
  private readonly mesh: THREE.Mesh;
  private instances: readonly CampaignSelectionInstance[] = [];
  constructor(scene: THREE.Scene) {
    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const local = varying(attribute<"vec2">("selectionLocal", "vec2"));
    const color = varying(attribute<"vec3">("selectionColor", "vec3"));
    const kind = varying(attribute<"float">("selectionKind", "float"));
    const city = CAMPAIGN_SELECTION_STYLE.city,
      army = CAMPAIGN_SELECTION_STYLE.army,
      garrison = CAMPAIGN_SELECTION_STYLE["garrisoned-army"];
    material.colorNode = Fn(() => {
      const d = length(local);
      const innerCut = kind
        .greaterThan(1.5)
        .select(
          float(garrison.innerCut),
          kind.greaterThan(0.5).select(float(army.innerCut), float(city.innerCut)),
        );
      const innerFade = kind
        .greaterThan(1.5)
        .select(
          float(garrison.innerFade),
          kind.greaterThan(0.5).select(float(army.innerFade), float(city.innerFade)),
        );
      Discard(d.greaterThan(1).or(d.lessThan(innerCut)));
      const ring = smoothstep(1, P.outerEdge, d).mul(smoothstep(innerCut, innerFade, d));
      const fill = smoothstep(P.fillOuterStart, P.fillOuterEnd, d)
        .mul(smoothstep(innerCut.sub(P.fillInnerBelowCut), innerCut.add(P.fillInnerAboveCut), d))
        .mul(P.fillAlpha);
      const tint = kind.greaterThan(0.5).select(float(army.tint), float(city.tint));
      const brightness = kind
        .greaterThan(0.5)
        .select(float(army.brightness), float(city.brightness));
      return vec4(
        linearAlbedo(mix(color, vec3(0.74, 0.66, 0.36), tint).mul(brightness)),
        max(ring.mul(P.ringAlpha), fill),
      );
    })();
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.renderOrder = RENDER_ORDER.groundCues + 1;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  upload(
    instances: readonly CampaignSelectionInstance[],
    surface: Pick<RenderedSurface, "sampleRendered">,
  ) {
    this.instances = instances.flatMap((instance) => {
      const center = surface.sampleRendered(instance.x, instance.y);
      return center ? [{ ...instance, z: center.position[2] }] : [];
    });
    const data = campaignSelectionVertices(
      this.instances,
      (x, y) => surface.sampleRendered(x, y)?.position[2],
    );
    const geometry = new THREE.BufferGeometry();
    const buffer = new THREE.InterleavedBuffer(data, CAMPAIGN_SELECTION_VERTEX_FLOATS);
    for (const [name, size, offset] of [
      ["position", 3, 0],
      ["selectionLocal", 2, 3],
      ["selectionColor", 3, 5],
      ["selectionKind", 1, 8],
    ] as const)
      geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, size, offset));
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.mesh.visible = this.instances.length > 0;
  }
  stats() {
    return {
      selections: this.instances.length,
      garrisonedArmySelections: this.instances.filter((item) => item.kind === "garrisoned-army")
        .length,
    };
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
