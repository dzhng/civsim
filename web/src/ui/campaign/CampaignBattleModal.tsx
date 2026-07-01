// S7: the campaign battle-decision modal (Fight / Auto-resolve) as React —
// ported 1:1 from showBattleModal. Rendered into #cmp-modal-root; the scene
// tracks an open flag (was the this.modal null-gate) to pause the world draw.

export interface EncounterSideView {
  label: string;
  garrison: boolean;
  factionName: string;
  soldiers: number;
  noRetreat: boolean;
}

export interface CampaignBattleModalProps {
  ambush: boolean;
  attacker: EncounterSideView;
  defender: EncounterSideView;
  reinforcements: number;
  mineInvolved: boolean;
  onFight(): void;
  onAuto(): void;
}

function Side({ s }: { s: EncounterSideView }) {
  return (
    <div className="cmp-side">
      <h3>
        {s.label}
        {s.garrison ? " (garrison)" : ""}
      </h3>
      <div>{s.factionName}</div>
      <div>{s.soldiers} soldiers</div>
      {s.noRetreat ? <div className="cmp-warn">NO RETREAT — destroyed if defeated</div> : null}
    </div>
  );
}

export function CampaignBattleModal(p: CampaignBattleModalProps) {
  return (
    <div className="cmp-modal">
      <div className="cmp-box">
        <h2>{p.ambush ? "AMBUSH!" : "Battle"}</h2>
        <div className="cmp-sides">
          <Side s={p.attacker} />
          <Side s={p.defender} />
        </div>
        {p.reinforcements > 0 ? (
          <div>{p.reinforcements} nearby armies will join with delay</div>
        ) : null}
        <div className="cmp-actions">
          {p.mineInvolved ? (
            <button id="cmp-fight" onClick={p.onFight}>
              Fight
            </button>
          ) : null}
          <button id="cmp-auto" onClick={p.onAuto}>
            Auto-resolve
          </button>
        </div>
      </div>
    </div>
  );
}
