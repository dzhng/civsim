import { useEffect, useReducer, useRef, type CSSProperties } from "react";
import {
  BATTLE_FACTIONS,
  factionPrimaryCss,
  type BattleFactionId,
} from "@packages/game-renderer/src/battle/factionColors";
import { readBattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainGrid";
import { Portrait } from "../hud/UnitCardsView";
import {
  BATTLE_ENVIRONMENT_OPTIONS,
  DEFAULT_BATTLE_ENVIRONMENT,
  type BattleEnvironmentId,
} from "@packages/game-renderer/src/environment/environment";
import {
  QUICK_BATTLE_GENERATED_MAP_ID,
  QUICK_BATTLE_GOLD,
  QUICK_BATTLE_MAPS,
  QUICK_BATTLE_MAX_UNITS,
  QUICK_BATTLE_TEMPLATES,
  validateQuickBattleArmy,
  type ClassCost,
  type QuickBattleClassSpec,
  type QuickBattleConfig,
  type QuickBattleValidation,
} from "../../battle/quickBattleCatalog";
import {
  armyBuilderReducer,
  armyConfig,
  DEFAULT_BATTLE_FACTIONS,
  pickArmy,
  rerollSeed,
  type Army,
  type ArmyBuilderState,
} from "./armyBuilderState";

/** Both sides default to the Balanced Host so launching is one click away —
 * same default as the old vanilla builder. (Catalog-bound, so it lives here
 * rather than in the node-tested pure state module.) */
function initialState(config?: QuickBattleConfig): ArmyBuilderState {
  if (config)
    return {
      mapId: config.mapId,
      generatedSeed: config.generatedSeed ?? "0",
      environment: config.environment,
      armies: config.teams.map((picks) => new Map(picks.map((p) => [p.classId, p.count]))) as [
        Army,
        Army,
      ],
      factions: config.factions ?? [...DEFAULT_BATTLE_FACTIONS],
    };
  const balanced = QUICK_BATTLE_TEMPLATES[0];
  const make = (): Army => new Map(balanced.units.map((u) => [u.classId, u.count] as const));
  return {
    mapId: QUICK_BATTLE_GENERATED_MAP_ID,
    generatedSeed: rerollSeed("7"),
    environment: DEFAULT_BATTLE_ENVIRONMENT,
    armies: [make(), make()],
    factions: [DEFAULT_BATTLE_FACTIONS[0], DEFAULT_BATTLE_FACTIONS[1]],
  };
}

interface ArmyBuilderProps {
  open: boolean;
  initialConfig?: QuickBattleConfig;
  classes: QuickBattleClassSpec[];
  onLaunch: (cfg: QuickBattleConfig) => void;
  onClose: () => void;
}

/** Custom-battle setup. The #quick-battle-modal bronze CSS in index.html still
 * styles this React DOM; state stays in the pure reducer so army picks and
 * faction choices remain testable without the browser. */
export function ArmyBuilder({ open, initialConfig, classes, onLaunch, onClose }: ArmyBuilderProps) {
  const [state, dispatch] = useReducer(armyBuilderReducer, initialConfig, initialState);
  const costOf: ClassCost = (classId) => classes.find((c) => c.id === classId)?.cost ?? 0;
  const validations = state.armies.map((army) =>
    validateQuickBattleArmy(pickArmy(army), costOf),
  ) as [QuickBattleValidation, QuickBattleValidation];
  const allValid = validations[0].valid && validations[1].valid;

  const launch = () => {
    if (!allValid) return;
    onLaunch(armyConfig(state));
  };

  return (
    <div
      id="quick-battle-modal"
      className={open ? "open" : ""}
      style={{ pointerEvents: "auto" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel quick-battle-panel">
        <h2>CUSTOM BATTLE</h2>
        <label className="qb-weather" htmlFor="qb-weather">
          <span>Weather</span>
          <select
            id="qb-weather"
            value={state.environment}
            onChange={(e) =>
              dispatch({
                kind: "environment",
                environment: e.currentTarget.value as BattleEnvironmentId,
              })
            }
          >
            {BATTLE_ENVIRONMENT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="qb-maps" id="qb-maps">
          {QUICK_BATTLE_MAPS.map((m) => {
            const generated = m.generatedSeed !== undefined;
            const selected = generated
              ? state.mapId === QUICK_BATTLE_GENERATED_MAP_ID && state.generatedMapId === m.id
              : m.wasmMapId === state.mapId;
            return (
              <button
                key={m.id}
                className={"qb-map" + (selected ? " selected" : "")}
                data-map={m.generatedSeed === undefined ? m.wasmMapId : m.id}
                onClick={() =>
                  dispatch({
                    kind: "map",
                    mapId: m.wasmMapId,
                    generatedSeed: m.generatedSeed,
                    generatedMapId: m.generatedSeed === undefined ? undefined : m.id,
                  })
                }
              >
                <strong>{m.label}</strong>
                <small>{m.description}</small>
              </button>
            );
          })}
          <div
            className={
              "qb-map qb-generated" +
              (state.mapId === QUICK_BATTLE_GENERATED_MAP_ID && state.generatedMapId === undefined
                ? " selected"
                : "")
            }
            data-map="gen"
            onClick={() => dispatch({ kind: "map", mapId: QUICK_BATTLE_GENERATED_MAP_ID })}
          >
            <div className="qb-generated-main">
              <GeneratedMapPreview seed={state.generatedSeed} />
              <div className="qb-generated-copy">
                <strong>Generated</strong>
                <div className="qb-generated-controls">
                  <input
                    id="qb-generated-seed"
                    aria-label="Generated battle seed"
                    value={state.generatedSeed}
                    inputMode="numeric"
                    onChange={(e) =>
                      dispatch({ kind: "generatedSeed", seed: e.currentTarget.value })
                    }
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    id="qb-generated-reroll"
                    className="qb-step"
                    title="Generate random map"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ kind: "map", mapId: QUICK_BATTLE_GENERATED_MAP_ID });
                      dispatch({ kind: "rerollGeneratedSeed" });
                    }}
                  >
                    Random Map
                  </button>
                  <button
                    type="button"
                    id="qb-generated-play"
                    className="qb-template"
                    onClick={(e) => {
                      e.stopPropagation();
                      const params = new URLSearchParams({
                        map: "gen",
                        seed: state.generatedSeed,
                        env: state.environment,
                      });
                      window.location.search = `?${params}`;
                    }}
                  >
                    Play
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="qb-armies">
          {([0, 1] as const).map((team) => (
            <ArmyPanel
              key={team}
              team={team}
              classes={classes}
              army={state.armies[team]}
              factionId={state.factions[team]}
              validation={validations[team]}
              dispatch={dispatch}
            />
          ))}
        </div>
        <div className="qb-actions">
          <button id="qb-launch" disabled={!allValid} onClick={launch}>
            Launch
          </button>
          <button className="cancel" id="qb-back" onClick={onClose}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function GeneratedMapPreview({ seed }: { seed: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let disposed = false;
    let game: { free: () => void } | null = null;
    drawPreviewLoading(ctx, canvas);
    const timer = window.setTimeout(() => {
      void (async () => {
        const wasmModule = await import("../../wasm/game_wasm.js");
        const wasm = await wasmModule.default();
        if (disposed) return;
        const probe = new wasmModule.Game(0x5eed_c0de);
        game = probe;
        try {
          probe.start_battle_generated(parseSeedForWasm(seed));
          const { w, h, speed, rough, tint } = readBattleTerrainGrid(probe, wasm.memory);
          if (!disposed) drawPreviewMask(ctx, canvas, { w, h, speed: speed!, rough: rough!, tint });
        } finally {
          probe.free();
          if (game === probe) game = null;
        }
      })().catch(() => {
        if (!disposed) drawPreviewLoading(ctx, canvas);
      });
    }, 180);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      game?.free();
    };
  }, [seed]);

  return (
    <canvas
      ref={ref}
      id="qb-generated-preview"
      className="qb-generated-preview"
      width={132}
      height={88}
      aria-label="Generated map preview"
    />
  );
}

function drawPreviewLoading(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  ctx.fillStyle = "#10120f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPreviewMask(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  grid: {
    w: number;
    h: number;
    speed: Float32Array;
    rough: Float32Array;
    tint: Uint8Array;
  },
) {
  const image = ctx.createImageData(canvas.width, canvas.height);
  const scale = Math.min(canvas.width / grid.w, canvas.height / grid.h);
  const mapW = grid.w * scale;
  const mapH = grid.h * scale;
  const offX = (canvas.width - mapW) / 2;
  const offY = (canvas.height - mapH) / 2;
  for (let py = 0; py < image.height; py++) {
    for (let px = 0; px < image.width; px++) {
      const gx = Math.floor((px - offX) / scale);
      const gy = grid.h - 1 - Math.floor((py - offY) / scale);
      let color: [number, number, number] = [16, 18, 15];
      if (gx >= 0 && gy >= 0 && gx < grid.w && gy < grid.h) {
        const i = gy * grid.w + gx;
        if (grid.tint[i] === 1) color = [39, 96, 148];
        else if (grid.tint[i] === 4) color = [36, 91, 43];
        else if (grid.tint[i] === 5) color = [168, 105, 42];
        else if (grid.tint[i] === 6) color = [156, 145, 104];
        else if (grid.speed[i] <= 0) color = [18, 18, 17];
        else if (grid.rough[i] >= 0.18) color = [126, 137, 84];
        else if (grid.speed[i] < 0.9) color = [142, 129, 76];
        else color = [78, 139, 76];
      }
      const o = (py * image.width + px) * 4;
      image.data[o] = color[0];
      image.data[o + 1] = color[1];
      image.data[o + 2] = color[2];
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function parseSeedForWasm(seed: string): bigint {
  try {
    const parsed = BigInt(seed);
    return parsed >= 0n ? BigInt.asUintN(64, parsed) : 0n;
  } catch {
    return 0n;
  }
}

function ArmyPanel(props: {
  team: 0 | 1;
  classes: QuickBattleClassSpec[];
  army: Army;
  factionId: BattleFactionId;
  validation: QuickBattleValidation;
  dispatch: (a: import("./armyBuilderState").ArmyBuilderAction) => void;
}) {
  const { team, classes, army, factionId, validation: v, dispatch } = props;
  const faction = BATTLE_FACTIONS.find((f) => f.id === factionId) ?? BATTLE_FACTIONS[team];
  const factionCss = factionPrimaryCss(faction);
  const footerCls =
    "qb-footer" + (v.overBudget || v.overSlots ? " over" : "") + (v.empty ? " empty" : "");
  const title = team === 0 ? "Your Army" : "Enemy Army";
  return (
    <div className="qb-army" id={`qb-army-${team}`}>
      <div
        className="qb-army-header"
        style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}
      >
        <h3 style={{ margin: 0, flex: 1 }}>{title}</h3>
        <select
          aria-label={`${title} faction`}
          value={factionId}
          onChange={(e) =>
            dispatch({ kind: "faction", team, factionId: e.target.value as BattleFactionId })
          }
          style={{
            minWidth: "112px",
            background: "var(--well-bg)",
            color: "var(--bronze-ink)",
            border: "1px solid #3a2c18",
            borderRadius: "2px",
            padding: "4px 6px",
            font: "inherit",
            boxShadow: "var(--well-shadow)",
          }}
        >
          {BATTLE_FACTIONS.filter((faction) => faction.id !== "neutral").map((faction) => (
            <option key={faction.id} value={faction.id}>
              {faction.name}
            </option>
          ))}
        </select>
      </div>
      <div className="qb-templates">
        {QUICK_BATTLE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            className="qb-template"
            onClick={() => dispatch({ kind: "template", team, units: t.units })}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div className="qb-cards">
        {classes.map((c) => {
          const count = army.get(c.id) ?? 0;
          return (
            <div
              className={"ucard qb-card" + (count > 0 ? " sel" : "")}
              key={c.id}
              style={{ ["--fac"]: factionCss } as CSSProperties}
              onClick={() => dispatch({ kind: "count", team, classId: c.id, delta: 1 })}
            >
              <div className="qb-card-cost">{c.cost}g</div>
              <Portrait u={{ unit: -1, cls: c.id, team, name: c.name }} />
              <div className="ucard-name">{c.name}</div>
              <div className="qb-card-steps">
                <button
                  className="qb-step"
                  aria-label={`Remove ${c.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ kind: "count", team, classId: c.id, delta: -1 });
                  }}
                >
                  −
                </button>
                <span className="qb-count">{count}</span>
                <button
                  className="qb-step"
                  aria-label={`Add ${c.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ kind: "count", team, classId: c.id, delta: 1 });
                  }}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className={footerCls}>
        {v.goldSpent} / {QUICK_BATTLE_GOLD}g · {v.slotsUsed} / {QUICK_BATTLE_MAX_UNITS} units
      </div>
    </div>
  );
}
