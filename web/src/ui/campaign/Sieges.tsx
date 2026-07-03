import { UiIcon } from "./UiIcon";

// Siege notifications. A click centers the camera and opens the besieged city.
export interface SiegeRow {
  node: number;
  x: number;
  y: number;
  name: string;
  attackerName: string;
}

export interface SiegesProps {
  sieges: SiegeRow[];
  onSelect(node: number, x: number, y: number): void;
}

export function Sieges({ sieges, onSelect }: SiegesProps) {
  return (
    <>
      {sieges.map((s) => (
        <div
          className="cmp-siege hud-chassis"
          key={s.node}
          data-node={s.node}
          data-x={s.x}
          data-y={s.y}
          onClick={() => onSelect(s.node, s.x, s.y)}
        >
          <div className="cmp-siege-title">
            <UiIcon name="sword" />
            <b>{s.name} under siege</b>
          </div>
          <div className="cmp-siege-sub">{s.attackerName} at the walls — click to view</div>
        </div>
      ))}
    </>
  );
}
