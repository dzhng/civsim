// Procedural sprite atlas: top-down soldiers per class/team with walk,
// attack, and corpse frames, plus trees, banners, and rocks. Drawn once at
// startup on a 2D canvas — no external assets, no licenses, crisp at zoom.

export const SPRITE = 64; // px per cell
export const COLS = 8;
// 18 soldier rows (9 classes x 2 teams) + 1 decal row.
export const ROWS = 19;
export const FRAMES = 5; // stand, walk-a, walk-b, attack, dead

const TREE_COL = 0;
const TREE_VARIANTS = 3;
const BANNER_COL = 4;
const ROCK_COL = 3;

const TEAM: [string, string][] = [
  ['#a23b32', '#d96a52'], // red: base, accent
  ['#2f4d8a', '#5b82c9'], // blue
];

// Per-class look: [skin/armor tone, helmet style, shield, weapon]
interface Look {
  armor: string;
  helmet: 'crest' | 'cap' | 'open' | 'wide' | 'hood' | 'none';
  shield: 'round' | 'tall' | 'small' | 'none';
  weapon: 'sword' | 'spear' | 'greatsword' | 'pike' | 'bow' | 'javelin' | 'lance' | 'sling';
  mounted?: boolean;
}

const LOOKS: Look[] = [
  { armor: '#8d8f96', helmet: 'crest', shield: 'tall', weapon: 'sword' }, // heavy
  { armor: '#9a8a6a', helmet: 'cap', shield: 'round', weapon: 'spear' }, // light
  { armor: '#6f7480', helmet: 'open', shield: 'none', weapon: 'greatsword' }, // long swords
  { armor: '#b0a386', helmet: 'wide', shield: 'round', weapon: 'pike' }, // phalanx
  { armor: '#7a6f55', helmet: 'hood', shield: 'none', weapon: 'bow' }, // archers
  { armor: '#857a60', helmet: 'none', shield: 'small', weapon: 'javelin' }, // skirmishers
  { armor: '#8d8f96', helmet: 'crest', shield: 'small', weapon: 'lance', mounted: true }, // shock cav
  { armor: '#9a8a6a', helmet: 'cap', shield: 'none', weapon: 'bow', mounted: true }, // horse archers
  { armor: '#7a6f55', helmet: 'cap', shield: 'none', weapon: 'sling' }, // artillery crew
];

export function buildAtlas(): { canvas: HTMLCanvasElement; soldierRow: (cls: number, team: number) => number; decalRow: number } {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * SPRITE;
  canvas.height = ROWS * SPRITE;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, canvas.width, canvas.height);

  for (let cls = 0; cls < 9; cls++) {
    for (let team = 0; team < 2; team++) {
      const row = cls * 2 + team;
      for (let f = 0; f < FRAMES; f++) {
        drawSoldier(g, f * SPRITE, row * SPRITE, LOOKS[cls], TEAM[team], f);
      }
    }
  }
  const decalRow = 18;
  // Trees (3 variants), rock, banners (2 teams).
  for (let v = 0; v < TREE_VARIANTS; v++) drawTree(g, (TREE_COL + v) * SPRITE, decalRow * SPRITE, v);
  drawRock(g, ROCK_COL * SPRITE, decalRow * SPRITE);
  drawBanner(g, BANNER_COL * SPRITE, decalRow * SPRITE, TEAM[0][0]);
  drawBanner(g, (BANNER_COL + 1) * SPRITE, decalRow * SPRITE, TEAM[1][0]);

  return { canvas, soldierRow: (cls, team) => cls * 2 + team, decalRow };
}

// All soldiers are drawn FACING +X (right); the shader rotates them.
function drawSoldier(g: CanvasRenderingContext2D, ox: number, oy: number, look: Look, team: [string, string], frame: number) {
  const c = SPRITE / 2;
  g.save();
  g.translate(ox + c, oy + c);

  const dead = frame === 4;
  const attack = frame === 3;
  const walkA = frame === 1;
  const walkB = frame === 2;
  if (dead) {
    g.rotate(1.9); // sprawled
    g.globalAlpha = 0.85;
  }

  // Shadow.
  if (!dead) {
    g.fillStyle = 'rgba(0,0,0,0.30)';
    g.beginPath();
    g.ellipse(0, 2, look.mounted ? 22 : 11, look.mounted ? 12 : 8, 0, 0, 7);
    g.fill();
  }

  if (look.mounted) {
    // Horse body along +x.
    const bob = walkA ? 1.5 : walkB ? -1.5 : 0;
    g.fillStyle = dead ? '#5d4a3a' : '#6e553f';
    g.beginPath();
    g.ellipse(0, bob * 0.4, 21, 8.5, 0, 0, 7);
    g.fill();
    // Head + neck.
    g.beginPath();
    g.ellipse(21, bob, 6.5, 4, 0.25, 0, 7);
    g.fill();
    g.fillStyle = '#4c3a2b';
    g.fillRect(14, -7 + bob, 7, 3); // mane
    // Tail.
    g.strokeStyle = '#4c3a2b';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-21, 0);
    g.lineTo(-26, 3 + bob);
    g.stroke();
    if (dead) {
      blood(g, -4, 6, 12);
      g.restore();
      return;
    }
  }

  const wob = walkA ? 1.2 : walkB ? -1.2 : 0;
  const bodyY = look.mounted ? -2 : 0;

  // Limbs hint (walking only, foot troops).
  if (!look.mounted && (walkA || walkB)) {
    g.strokeStyle = '#4a4138';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-3, wob * 2.4);
    g.lineTo(4, -wob * 2.4);
    g.stroke();
  }

  // Body: team tunic.
  g.fillStyle = dead ? shade(team[0], -25) : team[0];
  g.beginPath();
  g.ellipse(0, bodyY, 8.5, 7, 0, 0, 7);
  g.fill();
  // Armor shoulders.
  g.fillStyle = look.armor;
  g.beginPath();
  g.ellipse(-2, bodyY, 5.5, 6.2, 0, 0, 7);
  g.fill();

  // Weapon (before head so it reads as held forward).
  const thrust = attack ? 7 : 0;
  g.strokeStyle = '#cfd2d8';
  g.fillStyle = '#cfd2d8';
  switch (look.weapon) {
    case 'pike':
      g.lineWidth = 2;
      g.strokeStyle = '#8a6f4d';
      line(g, 2, 5, 30 + thrust, 5);
      g.strokeStyle = '#d8dbe2';
      line(g, 27 + thrust, 5, 31 + thrust, 5);
      break;
    case 'spear':
      g.lineWidth = 2;
      g.strokeStyle = '#8a6f4d';
      line(g, 0, 6, 19 + thrust, 6);
      g.strokeStyle = '#d8dbe2';
      line(g, 16 + thrust, 6, 20 + thrust, 6);
      break;
    case 'sword':
      g.lineWidth = 2.5;
      line(g, 5 + thrust, 6, 14 + thrust, 8);
      break;
    case 'greatsword':
      g.lineWidth = 3;
      line(g, 4 + thrust, 7, 19 + thrust, 9);
      break;
    case 'lance':
      g.lineWidth = 2;
      g.strokeStyle = '#8a6f4d';
      line(g, 4, 7, 28 + thrust, 7);
      break;
    case 'bow': {
      g.strokeStyle = '#8a6f4d';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(10, 0, 8, -1.2, 1.2);
      g.stroke();
      g.strokeStyle = '#ddd';
      g.lineWidth = 1;
      line(g, 10 - 8 * Math.cos(1.2), -8 * Math.sin(1.2), 10 - 8 * Math.cos(1.2), 8 * Math.sin(1.2));
      break;
    }
    case 'javelin':
      g.lineWidth = 1.8;
      g.strokeStyle = '#8a6f4d';
      line(g, 2, 6, 16 + thrust * 1.6, 6 - thrust * 0.4);
      break;
    case 'sling':
      g.lineWidth = 1.6;
      g.strokeStyle = '#7a6a50';
      line(g, 3, 6, 11, 8);
      break;
  }

  // Shield (left side = -y in facing frame).
  if (look.shield !== 'none') {
    g.fillStyle = team[1];
    g.strokeStyle = shade(team[1], -35);
    g.lineWidth = 1.5;
    g.beginPath();
    if (look.shield === 'tall') g.ellipse(2, -8, 5, 9, 0, 0, 7);
    else if (look.shield === 'round') g.ellipse(2, -8, 6.2, 6.2, 0, 0, 7);
    else g.ellipse(2, -7, 4.2, 4.2, 0, 0, 7);
    g.fill();
    g.stroke();
  }

  // Head + helmet.
  g.fillStyle = '#caa27c';
  g.beginPath();
  g.ellipse(2, bodyY - 1, 4.4, 4.4, 0, 0, 7);
  g.fill();
  g.fillStyle = look.armor;
  switch (look.helmet) {
    case 'crest':
      g.beginPath();
      g.ellipse(2, bodyY - 1, 4.6, 4.6, 0, 0, 7);
      g.fill();
      g.fillStyle = team[1];
      g.fillRect(-4, bodyY - 2.4, 11, 2.6); // crest along facing
      break;
    case 'cap':
      g.beginPath();
      g.ellipse(1, bodyY - 1, 4.2, 4.2, 0, 0, 7);
      g.fill();
      break;
    case 'open':
      g.beginPath();
      g.arc(1, bodyY - 1, 4.4, 1.8, 4.6);
      g.fill();
      break;
    case 'wide':
      g.beginPath();
      g.ellipse(1, bodyY - 1, 5.4, 5.0, 0, 0, 7);
      g.fill();
      break;
    case 'hood':
      g.fillStyle = '#5a523f';
      g.beginPath();
      g.ellipse(1, bodyY - 1, 4.6, 4.6, 0, 0, 7);
      g.fill();
      break;
    case 'none':
      break;
  }

  if (dead) blood(g, 2, 5, 9);
  g.restore();
}

function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

function blood(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = 'rgba(110, 18, 14, 0.55)';
  g.beginPath();
  g.ellipse(x, y, r, r * 0.7, 0.5, 0, 7);
  g.fill();
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const gr = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${gr},${b})`;
}

function drawTree(g: CanvasRenderingContext2D, ox: number, oy: number, variant: number) {
  const c = SPRITE / 2;
  g.save();
  g.translate(ox + c, oy + c);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.ellipse(3, 4, 16, 12, 0, 0, 7);
  g.fill();
  const greens = ['#2e4a26', '#37552c', '#2a4430'];
  const r = 15 + variant * 2;
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + variant;
    g.fillStyle = greens[(k + variant) % 3];
    g.beginPath();
    g.ellipse(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.6, r * 0.6, 0, 0, 7);
    g.fill();
  }
  g.fillStyle = '#456b35';
  g.beginPath();
  g.ellipse(-2, -2, r * 0.5, r * 0.5, 0, 0, 7);
  g.fill();
  g.restore();
}

function drawRock(g: CanvasRenderingContext2D, ox: number, oy: number) {
  const c = SPRITE / 2;
  g.save();
  g.translate(ox + c, oy + c);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.ellipse(3, 5, 20, 13, 0, 0, 7);
  g.fill();
  g.fillStyle = '#75716a';
  g.beginPath();
  g.moveTo(-20, 6);
  g.lineTo(-12, -12);
  g.lineTo(2, -16);
  g.lineTo(16, -8);
  g.lineTo(20, 6);
  g.lineTo(4, 12);
  g.closePath();
  g.fill();
  g.fillStyle = '#8d8a83';
  g.beginPath();
  g.moveTo(-12, -10);
  g.lineTo(2, -14);
  g.lineTo(12, -6);
  g.lineTo(-4, -2);
  g.closePath();
  g.fill();
  g.restore();
}

function drawBanner(g: CanvasRenderingContext2D, ox: number, oy: number, color: string) {
  const c = SPRITE / 2;
  g.save();
  g.translate(ox + c, oy + c);
  g.strokeStyle = '#6b5a3e';
  g.lineWidth = 3;
  line(g, 0, 26, 0, -22);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, -22);
  g.lineTo(24, -14);
  g.lineTo(0, -4);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1.5;
  g.stroke();
  g.restore();
}
