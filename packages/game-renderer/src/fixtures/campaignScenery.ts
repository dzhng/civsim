import type { CampaignRenderData } from "../campaign/entityFrame";
import type { CampaignSceneryInstance } from "../campaign/sceneryPass";
import { hash2 } from "../math";

export function testStageScenery(data: CampaignRenderData): CampaignSceneryInstance[] {
  const [x0, y0] = data.bgRect.min;
  const [x1, y1] = data.bgRect.max;
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const items: CampaignSceneryInstance[] = [
    { x: cx - 34, y: y1 - 5, size: 13.2, kind: "mountain" },
    { x: cx - 26, y: y1 - 2, size: 11.6, kind: "mountain" },
    { x: cx - 16, y: y1 - 6, size: 12.4, kind: "mountain" },
    { x: cx - 5, y: y1 - 3, size: 13.8, kind: "mountain" },
    { x: cx + 18, y: y1 - 7, size: 11.8, kind: "mountain" },
    { x: cx + 32, y: y1 - 5, size: 12.8, kind: "mountain" },
    { x: cx - 10, y: cy + 7, size: 9.8, kind: "mountain" },
    { x: cx + 10, y: cy + 7, size: 9.1, kind: "mountain" },
    { x: cx - 5, y: cy - 1, size: 10.6, kind: "mountain" },
    { x: cx + 21, y: cy - 1, size: 9.2, kind: "mountain" },
    { x: cx + 33, y: cy - 4, size: 9.8, kind: "mountain" },
    { x: x0 + 31, y: y0 + 9, size: 9.8, kind: "rock" },
    { x: x0 + 43, y: y0 + 7, size: 10.8, kind: "rock" },
    { x: x1 - 30, y: y0 + 8, size: 10.2, kind: "rock" },
    { x: x1 - 15, y: y0 + 13, size: 8.6, kind: "rock" },
    { x: x1 - 5, y: y0 + 6, size: 12.2, kind: "rock" },
    { x: cx - 17, y: cy - 15, size: 7.4, kind: "rock" },
    { x: cx - 4, y: cy - 18, size: 7.9, kind: "rock" },
    { x: cx + 18, y: cy - 16, size: 7.1, kind: "rock" },
    { x: cx + 32, y: cy - 10, size: 8.1, kind: "rock" },
    { x: cx - 18, y: cy + 2, size: 6.6, kind: "conifer" },
    { x: cx + 24, y: cy + 2, size: 6.2, kind: "broadleaf" },
    { x: cx + 12, y: cy - 6, size: 5.8, kind: "broadleaf" },
    { x: cx + 28, y: cy - 7, size: 5.4, kind: "conifer" },
    { x: cx - 30, y: cy - 9, size: 5.8, kind: "conifer" },
  ];
  for (let i = 0; i < 32; i++) {
    const x = x0 + 6 + hash2(i * 13, 4) * (x1 - x0 - 12);
    const y = y0 + 5 + hash2(5, i * 17) * (y1 - y0 - 10);
    if (Math.abs(y - cy) < 5 && Math.abs(x - cx) < 34) continue;
    const near = y < cy - 8 ? 1.18 : 1.0;
    items.push({
      x,
      y,
      size: (3.2 + hash2(i, i + 9) * 2.8) * near,
      kind: hash2(i, i + 31) > 0.45 ? "broadleaf" : "conifer",
    });
  }
  // The controlled test stage is intentionally flat ground (isControlledStage
  // skips relief grading), so every prop seats on its single z=0 datum rather
  // than carrying a per-prop seating literal. A relief-bearing stage would seat
  // these through the terrain height sampler, as the real-map scenery path does.
  const flatStageZ = 0;
  return items.map((item) => {
    const seated = { ...item, z: flatStageZ };
    if (item.kind === "mountain")
      return { ...seated, size: item.size / 3.8, height: item.size / 1.8 };
    return { ...seated, size: item.size / 3.0, height: item.size / 3.0 };
  });
}
