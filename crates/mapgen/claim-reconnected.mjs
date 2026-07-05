// Claim only reconnected city regions whose group contains a playable faction's
// hand-authored override city. This deliberately does not flood over the full
// mainland graph: islands and pre-existing neutral mainland leagues stay neutral.
import { readFileSync, writeFileSync } from 'node:fs';

const MAP_PATH = new URL('../../web/public/data/campaign-map.json', import.meta.url).pathname;
const OVERRIDES_PATH = new URL('./overrides.json', import.meta.url).pathname;
const MAX_CLAIMED_CITIES = 10;

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const overrides = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8'));

const cityById = new Map(
  map.nodes
    .filter((node) => node.kind === 'city')
    .map((node) => [node.id, node])
    .sort((a, b) => a[0] - b[0]),
);
const idByName = new Map([...cityById.values()].map((node) => [node.name, node.id]));

const playableOverrides = overrides.factions
  .filter((faction) => faction.playable)
  .slice()
  .sort((a, b) => a.id.localeCompare(b.id));
const overrideOwnerByCityName = new Map();
for (const faction of playableOverrides) {
  for (const city of faction.cities ?? []) {
    const existing = overrideOwnerByCityName.get(city);
    if (existing && existing !== faction.id) {
      throw new Error(`override city ${city} belongs to both ${existing} and ${faction.id}`);
    }
    overrideOwnerByCityName.set(city, faction.id);
  }
}

const sortedSetValues = (set) => [...set].sort((a, b) => a - b);
const addAdj = (adj, a, b) => {
  if (!adj.has(a)) adj.set(a, new Set());
  adj.get(a).add(b);
};

const roadAdj = new Map();
const allAdj = new Map();
for (const edge of map.edges) {
  addAdj(allAdj, edge.a, edge.b);
  addAdj(allAdj, edge.b, edge.a);
  if (edge.kind === 'road') {
    addAdj(roadAdj, edge.a, edge.b);
    addAdj(roadAdj, edge.b, edge.a);
  }
}

const mainSeeds = map.factions
  .filter((faction) => faction.playable)
  .map((faction) => idByName.get(faction.capital))
  .filter((id) => id !== undefined)
  .sort((a, b) => a - b);
const main = new Set();
const q = [...mainSeeds];
for (const id of q) main.add(id);
for (let i = 0; i < q.length; i++) {
  for (const next of sortedSetValues(allAdj.get(q[i]) ?? new Set())) {
    if (!main.has(next)) {
      main.add(next);
      q.push(next);
    }
  }
}

const reconnected = new Set(
  [...cityById.values()]
    .filter((node) => node.reconnected === true)
    .map((node) => node.id)
    .sort((a, b) => a - b),
);

const groups = [];
const seen = new Set();
for (const start of sortedSetValues(reconnected)) {
  if (seen.has(start)) continue;
  const group = [];
  const queue = [start];
  seen.add(start);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    group.push(id);
    for (const next of sortedSetValues(roadAdj.get(id) ?? new Set())) {
      if (!reconnected.has(next) || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  groups.push(group.sort((a, b) => a - b));
}

const claims = new Map();
for (const group of groups) {
  const matchingPowers = new Set();
  for (const id of group) {
    const power = overrideOwnerByCityName.get(cityById.get(id).name);
    if (power) matchingPowers.add(power);
  }
  if (matchingPowers.size === 0) continue;
  if (matchingPowers.size > 1) {
    const names = group.map((id) => cityById.get(id).name).sort().join(', ');
    throw new Error(`reconnected group matches multiple powers (${[...matchingPowers].join(', ')}): ${names}`);
  }

  const power = [...matchingPowers][0];
  const offMain = group.filter((id) => !main.has(id));
  if (offMain.length > 0) {
    const names = offMain.map((id) => cityById.get(id).name).sort().join(', ');
    throw new Error(`refusing to claim off-main reconnected cities for ${power}: ${names}`);
  }

  const claimIds = new Set(group);
  for (const id of group) {
    for (const next of sortedSetValues(roadAdj.get(id) ?? new Set())) {
      const node = cityById.get(next);
      if (!node || !main.has(next)) continue;
      if (typeof node.owner === 'string' && node.owner.startsWith('league_')) {
        claimIds.add(next);
      }
    }
  }

  for (const id of sortedSetValues(claimIds)) {
    const existing = claims.get(id);
    if (existing && existing !== power) {
      throw new Error(`city ${cityById.get(id).name} claimed by both ${existing} and ${power}`);
    }
    claims.set(id, power);
  }
}

const changed = [];
for (const [id, owner] of [...claims.entries()].sort((a, b) => a[0] - b[0])) {
  const node = cityById.get(id);
  if (!node || node.owner === owner) continue;
  changed.push({ id, name: node.name, before: node.owner, after: owner });
}

if (changed.length > MAX_CLAIMED_CITIES) {
  const names = changed.map((city) => city.name).sort().join(', ');
  throw new Error(`claim-reconnected over-claimed ${changed.length} cities: ${names}`);
}

for (const city of changed) {
  cityById.get(city.id).owner = city.after;
}

const citiesByOwner = new Map();
for (const node of [...cityById.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  if (!citiesByOwner.has(node.owner)) citiesByOwner.set(node.owner, []);
  citiesByOwner.get(node.owner).push(node.name);
}

let dropped = 0;
const factions = [];
for (const faction of map.factions) {
  const roster = citiesByOwner.get(faction.id) ?? [];
  if (faction.id.startsWith('league_') && roster.length === 0) {
    dropped += 1;
    continue;
  }
  faction.cities = roster;
  factions.push(faction);
}
map.factions = factions;

writeFileSync(MAP_PATH, JSON.stringify(map));

const claimedNames = changed.map((city) => city.name).sort();
const powers = [...new Set(changed.map((city) => city.after))].sort();
const powerLabel = powers.length === 1 ? powers[0] : powers.join(',');
console.log(`claim-reconnected: claimed ${claimedNames.join(', ') || '(none)'} for ${powerLabel || '(none)'}; dropped ${dropped} empty leagues`);
