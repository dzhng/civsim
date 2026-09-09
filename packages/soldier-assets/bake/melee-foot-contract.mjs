import { heavyMotionBake } from "./heavy-motion-contract.mjs";
import { pikeMotionBake, pikeFamilyPresentation } from "./pike-motion-contract.mjs";

export function meleeFootMotionBake(name) {
  if (name !== "longsword") return heavyMotionBake;
  return {
    ...pikeMotionBake,
    loopClips: pikeMotionBake.loopClips.map((clip) =>
      clip === "pike-ready" ? "twohand-ready" : clip === "pike-carry" ? "twohand-carry" : clip,
    ),
  };
}

export function meleeFootPresentation(name) {
  const sword = name === "longsword";
  const presentation = pikeFamilyPresentation(sword ? "primary" : "sidearm");
  presentation.actions.ready.clip = sword ? "twohand-ready" : "ready";
  presentation.actions.melee.clip = sword ? "sword-effort" : "spear-effort";
  presentation.actions.pikeReady = null;
  return presentation;
}
