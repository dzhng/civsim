import { toolbarIcon } from "../../battle/toolbarIcons";
import { Tooltip } from "./Tooltip";

// S6b: the battle order toolbar (#toolbar) as React. Icon-only buttons, so the
// Phosphor glyph goes in via dangerouslySetInnerHTML of the same toolbarIcon()
// string (byte-identical to the old `b.innerHTML = icon`). The scene feeds
// per-command {on, disabled} state (computed ≤5Hz) and dispatches the command.

export interface ToolButtonState {
  on: boolean;
  disabled: boolean;
}

interface ToolDef {
  cmd: string;
  ariaLabel: string;
  title: string;
}

// Verbatim from the old index.html #toolbar markup (&#10; → \n in the title).
const LAYOUT: (ToolDef | "sep")[] = [
  {
    cmd: "pace",
    ariaLabel: "Walk / Run",
    title:
      "Hotkey: R\nToggle walk/run. Running is ~2x speed but burns stamina in ~90s and the formation frays the longer it runs — walk to arrive in order.",
  },
  {
    cmd: "reform",
    ariaLabel: "Reform",
    title:
      "Hotkey: G\nHalt and re-dress the ranks at double recovery speed (the sergeants shout). Use after a scramble, a defile, or a melee.",
  },
  {
    cmd: "pursue",
    ariaLabel: "Pursue",
    title:
      "Hotkey: H\nON: an advance auto-attacks any enemy within a 5s run and chases routers — the chase gives up once it is measurably losing ground. OFF: fight whatever is in reach but keep marching to your destination.",
  },
  {
    cmd: "fire",
    ariaLabel: "Fire at will",
    title:
      "Hotkey: V\nMissile troops loose on judgment (captains still hold fire into melees involving OTHER friendly units). OFF: hold every shot. Missile units only.",
  },
  {
    cmd: "kite",
    ariaLabel: "Kite",
    title:
      "Hotkey: K\nSkirmish reflex: automatically hop away from approaching enemies and keep shooting — the fighting retreat. Skirmishers and horse archers only.",
  },
  "sep",
  { cmd: "pause", ariaLabel: "Pause", title: "Pause (P)" },
  { cmd: "x1", ariaLabel: "Normal speed", title: "Normal speed (1)" },
  { cmd: "x3", ariaLabel: "Fast forward", title: "Fast forward (3)" },
  "sep",
  {
    cmd: "paths",
    ariaLabel: "Show paths",
    title: "Show paths and destination ghosts (hold Space)",
  },
];

// Keep static SVG nodes across the toolbar's state refreshes.
const ICON_HTML = Object.fromEntries(
  LAYOUT.flatMap((item) => (item === "sep" ? [] : [[item.cmd, { __html: toolbarIcon(item.cmd) }]])),
);

export interface ToolbarProps {
  state: Record<string, ToolButtonState>;
  onCmd(cmd: string): void;
}

export function Toolbar({ state, onCmd }: ToolbarProps) {
  return (
    <>
      {LAYOUT.map((item, i) =>
        item === "sep" ? (
          <span className="sep" key={`sep${i}`} />
        ) : (
          // Bronze chip on hover/focus (Radix) replaces the native title bubble;
          // aria-label stays for screen readers.
          <Tooltip key={item.cmd} label={item.title}>
            <button
              data-cmd={item.cmd}
              aria-label={item.ariaLabel}
              className={state[item.cmd]?.on ? "on" : undefined}
              disabled={state[item.cmd]?.disabled ?? false}
              onClick={() => onCmd(item.cmd)}
              dangerouslySetInnerHTML={ICON_HTML[item.cmd]}
            />
          </Tooltip>
        ),
      )}
    </>
  );
}
