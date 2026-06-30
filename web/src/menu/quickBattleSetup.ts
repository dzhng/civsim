import {
  QUICK_BATTLE_GOLD,
  QUICK_BATTLE_MAPS,
  QUICK_BATTLE_MAX_UNITS,
  QUICK_BATTLE_TEMPLATES,
  validateQuickBattleArmy,
  type QuickBattleUnitPick,
} from '../battle/quickBattleCatalog';

// The Custom Battle setup panel: a map picker plus two army builders, both
// driven by the shared quick-battle catalog. Pure presentation over that data —
// it owns no map metadata and no cost table; class rows and costs come from the
// caller (Game.class_specs()), maps from QUICK_BATTLE_MAPS.

export interface QuickBattleClassSpec {
  id: number;
  name: string;
  cost: number;
}

export interface QuickBattleConfig {
  mapId: number;
  teams: [QuickBattleUnitPick[], QuickBattleUnitPick[]];
}

export interface QuickBattleSetup {
  open(): void;
  close(): void;
}

export function mountQuickBattleSetup(
  root: HTMLElement,
  classes: QuickBattleClassSpec[],
  onLaunch: (cfg: QuickBattleConfig) => void,
): QuickBattleSetup {
  const modal = root.querySelector<HTMLElement>('#quick-battle-modal')!;
  const costOf = (classId: number) => classes.find((c) => c.id === classId)?.cost ?? 0;

  let mapId = QUICK_BATTLE_MAPS[0]?.wasmMapId ?? 0;
  const armies: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];

  // Default both sides to the Balanced Host so launching is one click away.
  const balanced = QUICK_BATTLE_TEMPLATES[0];
  for (const army of armies) for (const u of balanced.units) army.set(u.classId, u.count);

  const mapsEl = root.querySelector<HTMLElement>('#qb-maps')!;
  mapsEl.replaceChildren(...QUICK_BATTLE_MAPS.map((m) => {
    const b = document.createElement('button');
    b.className = 'qb-map';
    b.dataset.map = String(m.wasmMapId);
    b.innerHTML = `<strong>${m.label}</strong><small>${m.description}</small>`;
    b.addEventListener('click', () => { mapId = m.wasmMapId; render(); });
    return b;
  }));

  const sides = [0, 1].map((team) => buildArmyPanel(root, team, classes, armies[team], render));

  function pick(team: number): QuickBattleUnitPick[] {
    return [...armies[team]].filter(([, n]) => n > 0).map(([classId, count]) => ({ classId, count }));
  }

  const launch = root.querySelector<HTMLButtonElement>('#qb-launch')!;
  launch.addEventListener('click', () => {
    const t0 = pick(0);
    const t1 = pick(1);
    if (!validateQuickBattleArmy(t0, costOf).valid || !validateQuickBattleArmy(t1, costOf).valid) return;
    close();
    onLaunch({ mapId, teams: [t0, t1] });
  });
  root.querySelector<HTMLButtonElement>('#qb-back')!.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  function render() {
    mapsEl.querySelectorAll<HTMLElement>('.qb-map').forEach((b) => {
      b.classList.toggle('selected', Number(b.dataset.map) === mapId);
    });
    let allValid = true;
    for (let team = 0; team < 2; team++) {
      const v = validateQuickBattleArmy(pick(team), costOf);
      allValid = allValid && v.valid;
      sides[team].update(v);
    }
    launch.disabled = !allValid;
  }

  function open() { modal.classList.add('open'); render(); }
  function close() { modal.classList.remove('open'); }

  return { open, close };
}

function buildArmyPanel(
  root: HTMLElement,
  team: number,
  classes: QuickBattleClassSpec[],
  army: Map<number, number>,
  onChange: () => void,
) {
  const panel = root.querySelector<HTMLElement>(`#qb-army-${team}`)!;
  panel.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = team === 0 ? 'Your Army' : 'Enemy Army';
  panel.appendChild(title);

  const templates = document.createElement('div');
  templates.className = 'qb-templates';
  for (const t of QUICK_BATTLE_TEMPLATES) {
    const b = document.createElement('button');
    b.className = 'qb-template';
    b.textContent = t.name;
    b.addEventListener('click', () => {
      army.clear();
      for (const u of t.units) army.set(u.classId, u.count);
      syncRows();
      onChange();
    });
    templates.appendChild(b);
  }
  panel.appendChild(templates);

  const rows = document.createElement('div');
  rows.className = 'qb-rows';
  const countEls = new Map<number, HTMLElement>();
  for (const c of classes) {
    const row = document.createElement('div');
    row.className = 'qb-row';
    const count = document.createElement('span');
    count.className = 'qb-count';
    const set = (delta: number) => {
      const next = Math.max(0, (army.get(c.id) ?? 0) + delta);
      army.set(c.id, next);
      count.textContent = String(next);
      onChange();
    };
    const minus = button('−', () => set(-1));
    const plus = button('+', () => set(1));
    count.textContent = String(army.get(c.id) ?? 0);
    countEls.set(c.id, count);
    row.append(label(`${c.name} · ${c.cost}g`), minus, count, plus);
    rows.appendChild(row);
  }
  panel.appendChild(rows);

  const footer = document.createElement('div');
  footer.className = 'qb-footer';
  panel.appendChild(footer);

  function syncRows() {
    for (const c of classes) countEls.get(c.id)!.textContent = String(army.get(c.id) ?? 0);
  }

  return {
    update(v: ReturnType<typeof validateQuickBattleArmy>) {
      footer.textContent = `${v.goldSpent} / ${QUICK_BATTLE_GOLD}g · ${v.slotsUsed} / ${QUICK_BATTLE_MAX_UNITS} units`;
      footer.classList.toggle('over', v.overBudget || v.overSlots);
      footer.classList.toggle('empty', v.empty);
    },
  };
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'qb-step';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function label(text: string): HTMLElement {
  const s = document.createElement('span');
  s.className = 'qb-label';
  s.textContent = text;
  return s;
}
