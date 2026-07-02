// Vibe check: a charge into a HELD line. The defender braces — no order — while
// the attacker charges in at a run. This is the test bed for "points stop horse"
// and "a held braced line beats a frontal charge": does the charge crash in and
// shove (not launch men), does the pike wall halt a horse, does the braced line
// hold?
//   Default: cavalry charges a held phalanx. A narrower pike front can stop the
//   head-on contacts while still letting a wider cavalry line wrap/trample the
//   exposed flanks; use WALL=1 for the no-flank frontal control.
//   Override: ATK=6 DEF=0 node vibe/charge.mjs  (cav into a held heavy line)
//   Flank:    FLANK=1 ATK=6 DEF=3 node vibe/charge.mjs  (pikes face north, cav rides east)
//   Wall:     WALL=1 ATK=6 DEF=3 node vibe/charge.mjs   (wide pike front, no flank wrap)
import {
  openBattle,
  closeBattle,
  vibeCapture,
  fitBattleUnits,
  fitDuel,
  duelSample,
  duelLabel,
  CLS,
} from "./_lib.mjs";

const ATK = Number(process.env.ATK ?? CLS.cavalry); // unit 0, charges
const DEF = Number(process.env.DEF ?? CLS.phalanx); // unit 1, holds (braced)
const FLANK = process.env.FLANK === "1";
const WALL = process.env.WALL === "1";

const customStage = FLANK || WALL;
const query = customStage ? "battle=duel&a=0&b=0&ai=off" : `battle=duel&a=${ATK}&b=${DEF}&ai=off`;
const { browser, page, errs } = await openBattle(query);

let ids = [0, 1];
if (WALL) {
  ids = await page.evaluate(
    ({ atkClass, defClass }) => {
      const HP = Math.PI / 2;
      const X = 200; // keep the idle duel pair off-frame
      // Defender faces south, so its phalanx points cover the cavalry's frontal
      // approach. The pike line is wider than the horse line: unlike cav-v-pike,
      // there are no exposed ends for the cavalry to wrap around.
      const def = window.__game.spawnClass(X, 0, -HP, 360, 45, defClass, 1);
      const atk = window.__game.spawnClass(X, -80, HP, 96, 24, atkClass, 0);
      window.__game.setPace(atk, 1);
      window.__game.attackOrder(atk, def);
      return [atk, def];
    },
    { atkClass: ATK, defClass: DEF },
  );
} else if (FLANK) {
  ids = await page.evaluate(
    ({ atkClass, defClass }) => {
      const HP = Math.PI / 2;
      const X = 200; // keep the idle duel pair off-frame
      // Defender faces north: phalanx pikes cover only the north face. A west→east
      // charge crosses the shafts from the side and should ride deeper than the
      // frontal hedge case (mechanically pinned in mechanics_charge.rs).
      const def = window.__game.spawnClass(X, 0, HP, 160, 8, defClass, 1);
      const atk = window.__game.spawnClass(X - 70, 0, 0, 96, 24, atkClass, 0);
      window.__game.setPace(atk, 1);
      window.__game.attackMove(atk, X + 70, 0);
      return [atk, def];
    },
    { atkClass: ATK, defClass: DEF },
  );
} else {
  // Attacker charges at a run; defender holds its ground (no order = braced).
  await page.evaluate(() => {
    window.__game.setPace(0, 1);
    window.__game.attackOrder(0, 1);
  });
}

const fitUnits = () => fitBattleUnits(page, ids);

const sampleUnits = () =>
  page.evaluate((ids) => {
    const a = window.__game.unitInfo(ids[0]),
      b = window.__game.unitInfo(ids[1]);
    return {
      victor: window.__game.stats().victor,
      aAlive: a[15],
      aTotal: a[7],
      aCoh: a[4],
      aFight: a[16],
      aAmmo: a[19],
      bAlive: b[15],
      bTotal: b[7],
      bCoh: b[4],
      bFight: b[16],
      bAmmo: b[19],
    };
  }, ids);

const { frames, resolved, fails } = await vibeCapture(page, process.env.NAME ?? "charge", {
  frame: () => (customStage ? fitUnits() : fitDuel(page)),
  sample: () => (customStage ? sampleUnits() : duelSample(page)),
  label: duelLabel,
  done: (s) =>
    s.victor >= 0 ||
    (FLANK && s.bAlive <= s.bTotal * 0.35) ||
    (FLANK && s.aAlive <= s.aTotal * 0.12 && s.aFight === 0 && s.bFight === 0) ||
    (WALL && s.aAlive <= s.aTotal * 0.35) ||
    (WALL && s.aFight === 0 && s.bFight === 0 && s.aCoh <= 0.12),
  maxSteps: WALL ? 12 : 20,
  requireResolved: true,
});

const defenderNote = FLANK ? ", side-on" : WALL ? ", wide wall" : "";
console.log(resolved ? `\nresolved in ${frames} frames` : `\nUNRESOLVED`);
console.log(`A = attacker (charging), B = defender (held${defenderNote})`);
if (errs.length) console.log("page errors:", errs.slice(0, 3));
await closeBattle(browser, page);
process.exit(fails);
