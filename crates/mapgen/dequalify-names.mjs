import { readFile, writeFile } from 'node:fs/promises';

const PATH = new URL('../../web/public/data/campaign-map.json', import.meta.url).pathname;

const map = JSON.parse(await readFile(PATH, 'utf8'));
const base = (s) => s.split(' (')[0];

const freq = Object.create(null);
for (const node of map.nodes) {
  if (node.kind !== 'city') continue;
  const b = base(node.name);
  freq[b] = (freq[b] ?? 0) + 1;
}

const dequalify = (name) => {
  const m = name.match(/^(.+) \((.+)\)$/);
  if (!m) return name;
  const [, b, q] = m;
  return freq[b] >= 2 ? `${b} ${q}` : b;
};

const rename = (record) => {
  const old = record.name;
  const name = dequalify(old);
  if (old !== name) {
    record.name = name;
    console.log(`${old} -> ${name}`);
  }
};

for (const node of map.nodes) {
  if (node.kind === 'city') rename(node);
}
for (const faction of map.factions) rename(faction);

await writeFile(PATH, JSON.stringify(map));
