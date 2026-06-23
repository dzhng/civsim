// Post-process step for the campaign map: group the leftover "independent"
// cities (everything the playable powers didn't flood-fill) into a handful of
// coherent regional neutral factions — minor leagues with a passive AI persona
// — so the political map has no ownerless grey patchwork, only factions.
//
// Runs on the mapgen artifact (web/public/data/campaign-map.json) and rewrites
// it in place. Deterministic (k-means with farthest-point init), so the
// committed map is reproducible. Run from the repo root:
//   node crates/mapgen/leagues.mjs
//
// TODO: fold this into crates/mapgen/build.rs once the pipeline is rerun here.
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'web/public/data/campaign-map.json';
const K = Number(process.env.LEAGUES ?? 56); // number of regional leagues
const map = JSON.parse(readFileSync(PATH, 'utf8'));

const cities = map.nodes.map((n, i) => ({ n, i })).filter((c) => c.n.kind === 'city');
const ind = cities.filter((c) => c.n.owner === 'independents');
if (ind.length === 0) {
  console.log('no independent cities — nothing to do');
  process.exit(0);
}
const P = ind.map((c) => c.n.pos);

// k-means, deterministic farthest-point init then Lloyd iterations.
function kmeans(k) {
  const seeds = [0];
  while (seeds.length < k) {
    let bi = 0;
    let bd = -1;
    for (let i = 0; i < P.length; i++) {
      let dm = Infinity;
      for (const s of seeds) {
        const dx = P[i][0] - P[s][0];
        const dy = P[i][1] - P[s][1];
        dm = Math.min(dm, dx * dx + dy * dy);
      }
      if (dm > bd) { bd = dm; bi = i; }
    }
    seeds.push(bi);
  }
  let cen = seeds.map((s) => [...P[s]]);
  const asn = new Array(P.length).fill(0);
  for (let it = 0; it < 30; it++) {
    for (let i = 0; i < P.length; i++) {
      let bj = 0;
      let bd = Infinity;
      for (let j = 0; j < k; j++) {
        const dx = P[i][0] - cen[j][0];
        const dy = P[i][1] - cen[j][1];
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bj = j; }
      }
      asn[i] = bj;
    }
    const sx = new Array(k).fill(0);
    const sy = new Array(k).fill(0);
    const ct = new Array(k).fill(0);
    for (let i = 0; i < P.length; i++) {
      sx[asn[i]] += P[i][0];
      sy[asn[i]] += P[i][1];
      ct[asn[i]]++;
    }
    for (let j = 0; j < k; j++) if (ct[j]) cen[j] = [sx[j] / ct[j], sy[j] / ct[j]];
  }
  return asn;
}

// Muted HSL→RGB so the leagues read as quiet neutral regions and never compete
// with the six vivid powers. Golden-angle hue + alternating lightness keeps
// even many adjacent leagues distinguishable without turning vivid.
function leagueColor(j) {
  const h = (j * 137.508 + 23) % 360;
  const s = 0.26 + (j % 3) * 0.05;
  const l = 0.50 + (j % 2) * 0.12;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mAdd = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + mAdd) * 255));
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const asn = kmeans(K);
const groups = Array.from({ length: K }, () => []);
ind.forEach((c, i) => groups[asn[i]].push(c));

// Build a faction per non-empty group, named after its leading (largest) city.
const leagues = [];
groups.forEach((g, j) => {
  if (!g.length) return;
  const lead = g.slice().sort((a, b) => (b.n.tier - a.n.tier) || a.n.name.localeCompare(b.n.name))[0];
  const id = `league_${slug(lead.n.name)}`;
  const name = g.length > 1 ? `${lead.n.name} League` : lead.n.name;
  const color = leagueColor(leagues.length);
  for (const c of g) c.n.owner = id;
  leagues.push({ id, name, color, playable: false, ai_persona: 'neutral' });
});

// Powers keep their cities; tag them as expansionist (explicit, configurable).
// Keep an empty "independents" sentinel so ownerless junctions still resolve.
const powers = map.factions.filter((f) => f.id !== 'independents');
for (const f of powers) if (!f.ai_persona) f.ai_persona = f.playable ? 'expansionist' : 'neutral';
const sentinel = map.factions.find((f) => f.id === 'independents') ?? {
  id: 'independents', name: 'Independent', color: [120, 120, 120], playable: false,
};
sentinel.ai_persona = 'neutral';
sentinel.cities = [];

map.factions = [...powers, ...leagues, sentinel];

writeFileSync(PATH, JSON.stringify(map));
console.log(`wrote ${leagues.length} neutral leagues over ${ind.length} cities:`);
for (const l of leagues) console.log(`  ${l.name.padEnd(28)} ${l.id}`);
