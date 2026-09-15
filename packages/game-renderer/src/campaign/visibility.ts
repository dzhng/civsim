import { smoothstep } from "../../../renderer-core/src/math";

export interface CampaignFogSource {
  x: number;
  y: number;
  radius: number;
}

export function fogVisibility(sources: CampaignFogSource[], x: number, y: number) {
  let visible = 0;
  for (const source of sources) {
    const d = Math.hypot(x - source.x, y - source.y);
    const sourceVisible = 1 - smoothstep(source.radius * 0.72, source.radius * 1.08, d);
    visible = Math.max(visible, sourceVisible);
  }
  return visible;
}
