// A tiny, dependency-free animated-GIF encoder, just enough to turn a handful
// of rendered RGBA frames into a looping GIF for animation review. The battle's
// shading is flat (a few dozen colours), so a frequency-histogram palette in
// RGB444 with nearest-colour mapping is indistinguishable from the source — no
// need for full median-cut. Used by vibe/anim.mjs to dump one GIF per
// (class, animation) under web/shots/anim/ so the soldier animations can be
// eyeballed frame by frame the way the user asked.
import { PNG } from 'pngjs';

// Quantise a set of RGBA frames to one shared ≤256-colour palette.
export function quantize(frames) {
  // Histogram over RGB444 buckets (4096), then keep the most common as palette.
  const hist = new Map();
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < d.length; i += 4) {
      const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      hist.set(key, (hist.get(key) || 0) + 1);
    }
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256);
  const palette = new Uint8Array(256 * 3);
  for (let k = 0; k < top.length; k++) {
    const key = top[k][0];
    // Bucket centre (shift back, + 8 to land mid-cell).
    palette[k * 3] = ((key >> 8) & 15) * 17;
    palette[k * 3 + 1] = ((key >> 4) & 15) * 17;
    palette[k * 3 + 2] = (key & 15) * 17;
  }
  const nColors = Math.max(1, top.length);
  // Nearest-palette cache, one slot per RGB444 bucket.
  const cache = new Int16Array(4096).fill(-1);
  const nearest = (r, g, b) => {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    if (cache[key] >= 0) return cache[key];
    let best = 0, bestD = Infinity;
    for (let k = 0; k < nColors; k++) {
      const dr = r - palette[k * 3], dg = g - palette[k * 3 + 1], db = b - palette[k * 3 + 2];
      const dd = dr * dr + dg * dg + db * db;
      if (dd < bestD) { bestD = dd; best = k; }
    }
    cache[key] = best;
    return best;
  };
  const indexed = frames.map((f) => {
    const d = f.data, out = new Uint8Array(d.length / 4);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) out[p] = nearest(d[i], d[i + 1], d[i + 2]);
    return out;
  });
  return { palette, indexed };
}

// LZW-compress one frame's index array (GIF variable-width codes, LSB-first).
function lzw(indices, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  let dict = new Map(), next = eoi + 1, width = minCode + 1;
  const out = [];
  let cur = 0, bits = 0;
  const emit = (code) => {
    cur |= code << bits; bits += width;
    while (bits >= 8) { out.push(cur & 0xff); cur >>= 8; bits -= 8; }
  };
  const resetDict = () => {
    dict = new Map();
    for (let i = 0; i < clear; i++) dict.set(String(i), i);
    next = eoi + 1; width = minCode + 1;
  };
  resetDict();
  emit(clear);
  let prefix = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i];
    const key = prefix + ',' + c;
    if (dict.has(key)) { prefix = key; continue; }
    emit(dict.get(prefix));
    dict.set(key, next++);
    if (next > (1 << width) && width < 12) width++;
    if (next >= 4096) { emit(clear); resetDict(); }
    prefix = String(c);
  }
  emit(dict.get(prefix));
  emit(eoi);
  if (bits > 0) out.push(cur & 0xff);
  return out;
}

/** Encode frames ({data: RGBA Buffer}[]) at `width`x`height` into a GIF.
 *  `delayCs` is the per-frame delay in centiseconds. Returns a Buffer. */
export function encodeGif(frames, width, height, delayCs = 8, opts = {}) {
  const { palette, indexed } = quantize(frames);
  const bytes = [];
  const u16 = (v) => { bytes.push(v & 0xff, (v >> 8) & 0xff); };
  const str = (s) => { for (const ch of s) bytes.push(ch.charCodeAt(0)); };
  str('GIF89a');
  u16(width); u16(height);
  bytes.push(0xf7, 0, 0); // global table, 8-bit, 256 colours; bg 0; aspect 0
  for (let i = 0; i < 256 * 3; i++) bytes.push(palette[i] || 0);
  if (opts.loop !== false) {
    // NETSCAPE loop-forever extension.
    bytes.push(0x21, 0xff, 11);
    str('NETSCAPE2.0');
    bytes.push(3, 1, 0, 0, 0);
  }
  const minCode = 8;
  for (const idx of indexed) {
    bytes.push(0x21, 0xf9, 4, 0); // graphic control: no disposal, no transparency
    u16(delayCs); bytes.push(0, 0);
    bytes.push(0x2c); u16(0); u16(0); u16(width); u16(height); bytes.push(0); // image descriptor
    bytes.push(minCode);
    const data = lzw(idx, minCode);
    for (let p = 0; p < data.length; p += 255) {
      const chunk = data.slice(p, p + 255);
      bytes.push(chunk.length, ...chunk);
    }
    bytes.push(0); // block terminator
  }
  bytes.push(0x3b);
  return Buffer.from(bytes);
}

/** Read a PNG screenshot Buffer into the {data,width,height} the encoder wants. */
export function pngToRGBA(buf) {
  const img = PNG.sync.read(buf);
  return { data: img.data, width: img.width, height: img.height };
}
