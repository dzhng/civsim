import { useReducer } from "react";
import {
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
  return { mapId: QUICK_BATTLE_MAPS[0]?.wasmMapId ?? 0, armies: [make(), make()] };
}

interface ArmyBuilderProps {
  open: boolean;
  classes: QuickBattleClassSpec[];
  onLaunch: (cfg: QuickBattleConfig) => void;
  onClose: () => void;
}

/** Custom-battle setup, ported 1:1 from the vanilla mountQuickBattleSetup so the
 * #quick-battle-modal bronze CSS in index.html still applies and the
 * menu-quick-battle-modal baseline stays pixel-identical. State is a useReducer
 * over the byte-identical-tested armyBuilderState; the launched config is exactly
 * what the old builder emitted. */
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
        </div>
        <div className="qb-armies">
          {([0, 1] as const).map((team) => (
            <ArmyPanel
              key={team}
              team={team}
              classes={classes}
              army={state.armies[team]}
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
  validation: QuickBattleValidation;
  dispatch: (a: import("./armyBuilderState").ArmyBuilderAction) => void;
}) {
  const { team, classes, army, validation: v, dispatch } = props;
  const footerCls =
    "qb-footer" + (v.overBudget || v.overSlots ? " over" : "") + (v.empty ? " empty" : "");
  return (
    <div className="qb-army" id={`qb-army-${team}`}>
      <h3>{team === 0 ? "Your Army" : "Enemy Army"}</h3>
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
