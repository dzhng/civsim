// Descope the sea-route feature: the campaign keeps only TWO sea lanes — the
// Strait of Gibraltar (Spain <-> Africa) and the Hellespont (Greece <-> Asia
// Minor). Every other sea edge is deleted. Island factions (all cities cut off
// from the road network) are already neutral leagues with no armies, so once
// their sea lanes are gone they are simply isolated, passive holdings.
//
// Deleting the sea edges orphans the junction waypoints that only existed to
// route sea lanes (and leaves the road tails that ran out to a coastal sea
// handoff). So after the cut we iteratively prune junction nodes down to a
// clean road network: a junction with <=1 edge is a dead-end and is removed
// with its edge, repeating until stable. Cities are never removed — an island
// city simply ends up with no edges (isolated), which is the intent.
//
// Runs as the last graph post-step (after prune + dequalify, before landroute):
// landroute only reasons about road edges, so the surviving graph is clean.
import { readFile, writeFile } from 'node:fs/promises';

const PATH = new URL('../../web/public/data/campaign-map.json', import.meta.url).pathname;
const map = JSON.parse(await readFile(PATH, 'utf8'));

// The two lanes to keep, by city-name pair (order-independent).
const KEEP = [
  ['Gades', 'Tingi'], // Gibraltar: Iberia <-> Africa
  ['Constantinopolis', 'Nicomedia'], // Bosphorus: Europe/Greece <-> Asia Minor
];
const nameOf = new Map(map.nodes.map((n) => [n.id, n.name]));
const keyOf = (a, b) => [a, b].sort().join(' ');
const keepKeys = new Set(KEEP.map(([a, b]) => keyOf(a, b)));

// Road ferries that a kept SEA lane replaces: drop the road so the crossing is
// purely the (visible) sea lane, not a road ferry hidden under it. Must also be
// removed from landroute::ROAD_FERRY_CROSSINGS.
const dropRoadKeys = new Set([['Constantinopolis', 'Nicomedia']].map(([a, b]) => keyOf(a, b)));

// Tag each edge with its original index so ambush spots (which index the edge
// array) can be remapped after the filtering below.
map.edges.forEach((e, i) => {
  e._oi = i;
});

// 1. Drop every sea edge except the two named lanes, and drop the road ferries
//    that a kept sea lane replaces.
const keptSea = [];
map.edges = map.edges.filter((e) => {
  const k = keyOf(nameOf.get(e.a), nameOf.get(e.b));
  if (e.kind === 'sea') {
    if (keepKeys.has(k)) {
      keptSea.push(`${nameOf.get(e.a)} <-> ${nameOf.get(e.b)}`);
      return true;
    }
    return false;
  }
  return !dropRoadKeys.has(k); // drop the replaced ferry road
});

// 2. Iteratively prune junction dead-ends (<=1 edge) left by the sea cut.
const kindOf = new Map(map.nodes.map((n) => [n.id, n.kind]));
for (;;) {
  const deg = new Map();
  for (const e of map.edges) {
    deg.set(e.a, (deg.get(e.a) ?? 0) + 1);
    deg.set(e.b, (deg.get(e.b) ?? 0) + 1);
  }
  const drop = new Set(
    map.nodes
      .filter((n) => n.kind === 'junction' && (deg.get(n.id) ?? 0) <= 1)
      .map((n) => n.id),
  );
  if (drop.size === 0) break;
  map.nodes = map.nodes.filter((n) => !drop.has(n.id));
  map.edges = map.edges.filter((e) => !drop.has(e.a) && !drop.has(e.b));
}

// 3. Remap ambush spots (they index the edge array) onto the surviving edges
//    via the original-index tags, dropping any whose road edge was removed.
const oldToNew = new Map();
map.edges.forEach((e, newIdx) => oldToNew.set(e._oi, newIdx));
map.ambush_spots = (map.ambush_spots ?? [])
  .map((s) => ({ ...s, edge: oldToNew.get(s.edge) ?? -1 }))
  .filter((s) => s.edge >= 0);
for (const e of map.edges) delete e._oi;

console.log(`descope-sea-lanes: kept ${keptSea.length} sea lanes -> ${keptSea.join('; ')}`);
console.log(`descope-sea-lanes: ${map.nodes.filter((n) => n.kind === 'junction').length} junctions, ${map.edges.length} edges remain`);

await writeFile(PATH, JSON.stringify(map));
