import { CLASS_NAMES } from "../../../../web/src/battle/classData";
import { type UnitCardInit, type UnitCardState } from "../../../../web/src/battle/unitCard";
import { UnitCardsReact } from "../../../../web/src/ui/hud/UnitCardsReact";
import { installViewportGate } from "../../../../web/src/battle/viewportGate";
import { type LabContext, el, publish, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  const count = Math.max(1, Math.min(60, Number(ctx.params.get("count") ?? 20)));
  const band = el("div", "renderer-unitcards");
  band.id = "unitcards";
  ctx.root.appendChild(band);

  // Reuse the live "window too small" gate (index.html's CSS survives the lab
  // mount, but its element doesn't — recreate it) so the scene can exercise the
  // min-window placeholder headlessly.
  const tooSmall = el("div", "");
  tooSmall.id = "viewport-too-small";
  tooSmall.innerHTML =
    '<div class="vts-panel"><h2>Window too small</h2><p>The battle needs a window of at least 1180 &times; 640. Please enlarge the window to play.</p></div>';
  ctx.root.appendChild(tooSmall);
  installViewportGate(tooSmall);

  let lastSelect: { unit: number; additive: boolean } | null = null;
  const onSelect = (unit: number, additive: boolean) => {
    lastSelect = { unit, additive };
    (window as unknown as { __cardBarLastSelect?: unknown }).__cardBarLastSelect = lastSelect;
  };
  // No minimap in this harness, so reserve only a bare side margin (not the live
  // game's minimap clearance) — the demo shows the bar at its full width.
  const cards = new UnitCardsReact(band, onSelect, 12);

  // Synthetic roster: cycle every class so portraits, names, and faction accent
  // all vary; live-ish bar values so the strip reads like a real fight.
  const inits: UnitCardInit[] = Array.from({ length: count }, (_, i) => ({
    unit: i,
    cls: i % CLASS_NAMES.length,
    team: 0,
    name: CLASS_NAMES[i % CLASS_NAMES.length],
  }));
  const states: UnitCardState[] = inits.map((_, i) => ({
    alive: 180 - ((i * 13) % 170),
    total: 180,
    cohesion: 0.55 + ((i * 7) % 45) / 100,
    morale: 0.5 + ((i * 11) % 50) / 100,
    stamina: 0.6 + ((i * 5) % 40) / 100,
    routing: i % 9 === 4,
    selected: i === 0,
  }));
  cards.build(inits);
  cards.update(states);

  const grid = (window as unknown as { __cardGrid?: Record<string, number> }).__cardGrid ?? {};
  ctx.status.innerHTML = reportTable({
    route: "card-bar",
    count,
    rows: grid.rows,
    cols: grid.cols,
    cardW: grid.cardW,
    degenerate: grid.degenerate,
    bandWidth: band.clientWidth,
  });
  publish("card-bar", true, { count, grid, lastSelect, bandWidth: band.clientWidth });
}
