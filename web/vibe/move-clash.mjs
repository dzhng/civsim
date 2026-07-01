// THE INVARIANT, on screen: two units given MOVE orders to each other's
// starting spot — a point BEYOND the contact, exactly like the attack latch's
// chase point. This should look the SAME as both-attack (duel-posture
// POSTURE=both), minus the charge. If the move walks clean THROUGH the enemy to
// reach the destination while the attack holds at contact, the two paths
// disagree about "you can't walk through a body" — the bug the Rust test
// `attack_latch_behaves_like_a_move_order` pins.
//   ATK=0 DEF=0 node vibe/move-clash.mjs    # heavy v heavy, both move
import {
  openBattle,
  vibeCapture,
  fitDuel,
  duelSample,
  duelLabel,
  UNIT_CENTER_X,
  UNIT_CENTER_Y,
} from "./_lib.mjs";

const ATK = Number(process.env.ATK ?? 0);
const DEF = Number(process.env.DEF ?? 0);
const NAME = process.env.NAME ?? `move-clash-${ATK}v${DEF}`;

const { browser, page, errs } = await openBattle(`battle=duel&a=${ATK}&b=${DEF}&ai=off`);
await page.evaluate(
  ([centerX, centerY]) => {
    const a = window.__game.unitInfo(0);
    const b = window.__game.unitInfo(1);
    window.__game.setPace(0, 1);
    window.__game.setPace(1, 1);
    window.__game.setOrder(0, b[centerX], b[centerY]);
    window.__game.setOrder(1, a[centerX], a[centerY]);
  },
  [UNIT_CENTER_X, UNIT_CENTER_Y],
);

const { frames, resolved, fails } = await vibeCapture(page, NAME, {
  stepSecs: 20,
  maxSteps: 18,
  frame: () => fitDuel(page),
  sample: () => duelSample(page),
  label: duelLabel,
  done: (s) => s.victor >= 0,
});
console.log(`${NAME}: ${resolved ? `resolved in ${frames} frames` : "UNRESOLVED"}`);
if (errs.length) console.log("  page errors:", errs.slice(0, 3));
await browser.close();
process.exit(fails);
