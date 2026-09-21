import { expect, test, vi } from "vitest";
vi.hoisted(() => {
  globalThis.Path2D = class {} as typeof Path2D;
});
import { CampaignScene } from "../src/campaign/scene";

test("a commander request can finish while campaign rendering is suspended for battle", () => {
  const terminate = vi.fn();
  let reported: ((result: string | null) => boolean) | undefined;
  const campaign = {
    begin_campaign_battle: () => "encounter",
    report_campaign_battle: () => true,
  };
  const scene = Object.create(CampaignScene.prototype) as any;
  Object.assign(scene, {
    cfg: {
      campaign,
      onBattle: (_: string, report: typeof reported) => {
        reported = report;
      },
    },
    aiWorker: { terminate },
    canvas: { style: {} },
    ui: { style: {} },
    closeModal: vi.fn(),
    refreshViews: vi.fn(),
    clock: { paused: false },
  });
  scene.fight(1);
  scene.exit();
  expect(terminate).not.toHaveBeenCalled();
  expect(scene.aiWorker).not.toBeNull();
  expect(reported!("outcome")).toBe(true);
  // An ordinary departure after the battle releases the retained worker.
  scene.exit();
  expect(terminate).toHaveBeenCalledOnce();
  expect(scene.aiWorker).toBeNull();
});
