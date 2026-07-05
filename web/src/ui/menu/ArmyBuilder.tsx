import { useReducer } from "react";
import {
  BATTLE_FACTIONS,
  type BattleFactionId,
} from "../../../../packages/game-renderer/src/battle/factionColors";
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
  type Army,
  type ArmyBuilderState,
} from "./armyBuilderState";

/** Both sides default to the Balanced Host so launching is one click away —
 * same default as the old vanilla builder. (Catalog-bound, so it lives here
 * rather than in the node-tested pure state module.) */
function initialState(): ArmyBuilderState {
  const balanced = QUICK_BATTLE_TEMPLATES[0];
  const make = (): Army => new Map(balanced.units.map((u) => [u.classId, u.count] as const));
  return {
    mapId: QUICK_BATTLE_MAPS[0]?.wasmMapId ?? 0,
    generatedSeed: "7",
    armies: [make(), make()],
    factions: [DEFAULT_BATTLE_FACTIONS[0], DEFAULT_BATTLE_FACTIONS[1]],
  };
}

interface ArmyBuilderProps {
  open: boolean;
  classes: QuickBattleClassSpec[];
  onLaunch: (cfg: QuickBattleConfig) => void;
  onClose: () => void;
}

/** Custom-battle setup. The #quick-battle-modal bronze CSS in index.html still
 * styles this React DOM; state stays in the pure reducer so army picks and
 * faction choices remain testable without the browser. */
export function ArmyBuilder({ open, classes, onLaunch, onClose }: ArmyBuilderProps) {
  const [state, dispatch] = useReducer(armyBuilderReducer, undefined, initialState);
  const costOf: ClassCost = (classId) => classes.find((c) => c.id === classId)?.cost ?? 0;
  const validations = state.armies.map((army) =>
    validateQuickBattleArmy(pickArmy(army), costOf),
  ) as [QuickBattleValidation, QuickBattleValidation];
  const allValid = validations[0].valid && validations[1].valid;

  const launch = () => {
    if (!allValid) return;
    onClose();
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
        <div className="qb-maps" id="qb-maps">
          {QUICK_BATTLE_MAPS.map((m) => (
            <button
              key={m.wasmMapId}
              className={"qb-map" + (m.wasmMapId === state.mapId ? " selected" : "")}
              data-map={m.wasmMapId}
              onClick={() => dispatch({ kind: "map", mapId: m.wasmMapId })}
            >
              <strong>{m.label}</strong>
              <small>{m.description}</small>
            </button>
          ))}
          <div
            className={
              "qb-map qb-generated" +
              (state.mapId === QUICK_BATTLE_GENERATED_MAP_ID ? " selected" : "")
            }
            data-map="gen"
            onClick={() => dispatch({ kind: "map", mapId: QUICK_BATTLE_GENERATED_MAP_ID })}
          >
            <strong>Generated</strong>
            <div className="qb-generated-controls">
              <input
                id="qb-generated-seed"
                aria-label="Generated battle seed"
                value={state.generatedSeed}
                inputMode="numeric"
                onChange={(e) => dispatch({ kind: "generatedSeed", seed: e.currentTarget.value })}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                id="qb-generated-reroll"
                className="qb-step"
                title="Reroll generated seed"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ kind: "map", mapId: QUICK_BATTLE_GENERATED_MAP_ID });
                  dispatch({ kind: "rerollGeneratedSeed" });
                }}
              >
                Roll
              </button>
              <button
                type="button"
                id="qb-generated-play"
                className="qb-template"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.search = `?map=gen&seed=${encodeURIComponent(state.generatedSeed)}`;
                }}
              >
                Play
              </button>
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

function ArmyPanel(props: {
  team: 0 | 1;
  classes: QuickBattleClassSpec[];
  army: Army;
  factionId: BattleFactionId;
  validation: QuickBattleValidation;
  dispatch: (a: import("./armyBuilderState").ArmyBuilderAction) => void;
}) {
  const { team, classes, army, factionId, validation: v, dispatch } = props;
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
      <div className="qb-rows">
        {classes.map((c) => (
          <div className="qb-row" key={c.id}>
            <span className="qb-label">
              {c.name} · {c.cost}g
            </span>
            <button
              className="qb-step"
              onClick={() => dispatch({ kind: "count", team, classId: c.id, delta: -1 })}
            >
              −
            </button>
            <span className="qb-count">{army.get(c.id) ?? 0}</span>
            <button
              className="qb-step"
              onClick={() => dispatch({ kind: "count", team, classId: c.id, delta: 1 })}
            >
              +
            </button>
          </div>
        ))}
      </div>
      <div className={footerCls}>
        {v.goldSpent} / {QUICK_BATTLE_GOLD}g · {v.slotsUsed} / {QUICK_BATTLE_MAX_UNITS} units
      </div>
    </div>
  );
}
