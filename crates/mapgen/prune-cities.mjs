// Final mapgen post-step: thin out cities that sit too close together so the 3D
// town models stop overlapping on the map. Runs AFTER leagues.mjs, in place on
// web/public/data/campaign-map.json. The mapgen binary runs this for you (see
// crates/mapgen/src/main.rs); `cargo run -p mapgen --release` does the whole
// pipeline. Standalone, idempotent-enough to re-run by hand if needed.
//
// For each cluster of cities within MIN_DIST_KM, only the most significant
// survives (highest tier, then best-connected); the rest are removed and every
// reference to them — edges, ambush spots, faction rosters, army starts — is
// rewired onto the survivor so nothing dangles.
import { readFile, writeFile } from 'node:fs/promises';

const MIN_DIST_KM = 26; // centre spacing below which town models overlap
const PATH = new URL('../../web/public/data/campaign-map.json', import.meta.url).pathname;

const map = JSON.parse(await readFile(PATH, 'utf8'));
const { nodes, edges } = map;

// Degree (edge count) per node id — the connectivity tie-breaker.
const degree = new Map();
for (const e of edges) {
  degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
  degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
}
const portIds = new Set();
for (const e of map.edges) {
  if (e.kind !== 'sea') continue;
  portIds.add(e.a);
  portIds.add(e.b);
}
const isPort = (n) => portIds.has(n.id);

// Sea-lane endpoints must never be pruned or merged — the lane connects these
// exact cities, and the Sicily pair (Rhegium/Messana) sits ~16km apart, inside
// MIN_DIST_KM. Kept in sync with descope-sea-lanes.mjs KEEP + raster STRAIT_CARVES.
const LANE_ENDPOINTS = new Set([
  'Gades', 'Tingi', 'Constantinopolis', 'Nicomedia', 'Rhegium', 'Messana',
]);
const isLaneEndpoint = (n) => LANE_ENDPOINTS.has(n.name);

const cities = nodes.filter((n) => n.kind === 'city');
// Most significant first: tier, then port, then connectivity, then id (stable).
cities.sort((p, q) =>
  q.tier - p.tier ||
  (q.port ? 1 : 0) - (p.port ? 1 : 0) ||
  (degree.get(q.id) ?? 0) - (degree.get(p.id) ?? 0) ||
  p.id - q.id);

// Greedy spacing: keep a city unless a kept one is already too near; a pruned
// city maps to the nearest survivor (which absorbs its roads/garrison).
const kept = [];
const remap = new Map(); // pruned id -> surviving id
const prunePos = (n) => n.srcPos ?? n.pos;
for (const c of cities) {
  let near = null;
  let nearD = MIN_DIST_KM;
  const cp = prunePos(c);
  for (const k of kept) {
    const kp = prunePos(k);
    const d = Math.hypot(cp[0] - kp[0], cp[1] - kp[1]);
    if (d < nearD) { nearD = d; near = k; }
  }
  if (near && !isLaneEndpoint(c) && !(isPort(c) && !isPort(near))) remap.set(c.id, near.id);
  else kept.push(c);
}
const resolve = (id) => remap.get(id) ?? id;
const posOf = new Map(nodes.map((n) => [n.id, n.pos]));

// Drop pruned city nodes.
const prunedIds = new Set(remap.keys());
map.nodes = nodes.filter((n) => !prunedIds.has(n.id));
for (const n of map.nodes) delete n.srcPos;

// Rewire edges onto survivors; snap the via endpoint to the new node so the
// road still reaches it, drop self-loops, and dedupe collapsed duplicates.
const seen = new Map(); // dedupe key -> new edge index
const newEdges = [];
const edgeRemap = new Int32Array(edges.length).fill(-1);
edges.forEach((e, oi) => {
  const a = resolve(e.a);
  const b = resolve(e.b);
  if (a === b) return; // collapsed into a single town
  const via = e.via.slice();
  if (a !== e.a) via[0] = posOf.get(a);
  if (b !== e.b) via[via.length - 1] = posOf.get(b);
  const key = `${Math.min(a, b)}-${Math.max(a, b)}-${e.kind}`;
  const dup = seen.get(key);
  if (dup !== undefined) { edgeRemap[oi] = dup; return; }
  seen.set(key, newEdges.length);
  edgeRemap[oi] = newEdges.length;
  newEdges.push({ ...e, a, b, via });
});
map.edges = newEdges;

// Ambush spots index the edge array — remap onto the surviving edge, drop any
// whose edge collapsed away.
map.ambush_spots = map.ambush_spots
  .map((s) => ({ ...s, edge: edgeRemap[s.edge] }))
  .filter((s) => s.edge >= 0);

// Faction rosters and army starts reference node ids.
for (const f of map.factions) {
  if (f.capital != null) f.capital = resolve(f.capital);
  if (Array.isArray(f.cities)) f.cities = [...new Set(f.cities.map(resolve))];
}
for (const a of map.start_armies) a.at = resolve(a.at);

await writeFile(PATH, JSON.stringify(map));
const cityCount = map.nodes.filter((n) => n.kind === 'city').length;
console.log(`pruned ${prunedIds.size} cities (min spacing ${MIN_DIST_KM}km); `
  + `${cityCount} cities, ${map.edges.length} edges, ${map.ambush_spots.length} ambush spots remain`);
