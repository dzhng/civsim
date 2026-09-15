import { SELECTION_RING_PROFILE } from "../selectionRing";

export interface CampaignSelectionInstance {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: [number, number, number];
  kind: "city" | "army" | "garrisoned-army";
}

/** Shared campaign ring dimensions and shading, in normalized radius coordinates. */
export const CAMPAIGN_SELECTION_STYLE = {
  city: { axisScale: 0.76, innerCut: 0.884, innerFade: 0.912, tint: 0.2, brightness: 0.99 },
  army: {
    axisScale: 0.64,
    innerCut: SELECTION_RING_PROFILE.innerCut,
    innerFade: SELECTION_RING_PROFILE.innerFade,
    tint: 0,
    brightness: 1.08,
  },
  "garrisoned-army": {
    axisScale: 0.64,
    innerCut: 0.856,
    innerFade: 0.89,
    tint: 0,
    brightness: 1.08,
  },
} as const;
export const CAMPAIGN_SELECTION_SURFACE_LIFT = 0.42;
export const CAMPAIGN_SELECTION_VERTEX_FLOATS = 9;

/** The same draped annulus feeds raw and physical campaign renderers. */
export function campaignSelectionVertices(
  instances: readonly CampaignSelectionInstance[],
  heightAt?: (x: number, y: number) => number | undefined,
) {
  const segments = 48;
  const data = new Float32Array(instances.length * segments * 6 * CAMPAIGN_SELECTION_VERTEX_FLOATS);
  let o = 0;
  for (const inst of instances) {
    const kind = inst.kind === "city" ? 0 : inst.kind === "garrisoned-army" ? 2 : 1;
    const axisScale = CAMPAIGN_SELECTION_STYLE[inst.kind].axisScale;
    const vertex = (seg: number, fraction: number) => {
      const angle = (seg / segments) * Math.PI * 2;
      const lx = Math.cos(angle) * fraction,
        ly = Math.sin(angle) * fraction;
      const x = inst.x + lx * inst.radius,
        y = inst.y + ly * inst.radius * axisScale;
      data.set(
        [
          x,
          y,
          (heightAt?.(x, y) ?? inst.z) + CAMPAIGN_SELECTION_SURFACE_LIFT,
          lx,
          ly,
          ...inst.color,
          kind,
        ],
        o,
      );
      o += CAMPAIGN_SELECTION_VERTEX_FLOATS;
    };
    for (let seg = 0; seg < segments; seg++) {
      vertex(seg, 0.8);
      vertex(seg, 1);
      vertex(seg + 1, 1);
      vertex(seg, 0.8);
      vertex(seg + 1, 1);
      vertex(seg + 1, 0.8);
    }
  }
  return data;
}
