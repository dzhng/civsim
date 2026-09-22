// A tiny, dependency-free animated-GIF encoder, just enough to turn a handful
// of rendered RGBA frames into a looping GIF for animation review. The battle's
// shading is flat (a few dozen colours), so a frequency-histogram palette in
// RGB444 with nearest-colour mapping is indistinguishable from the source — no
// need for full median-cut. Used by shots/models/scripts/soldier-animation.mjs to dump one GIF per
// (class, animation) under web/shots/models/shared/soldiers/anim/ so the soldier
// animations can be eyeballed frame by frame the way the user asked.
import { PNG } from "pngjs";

// Quantise a set of RGBA frames to one shared ≤256-colour palette.
export function quantize(frames, colorBits = 4) {
  if (!Number.isInteger(colorBits) || colorBits < 4 || colorBits > 8) {
    throw new Error("GIF color precision must be 4–8 bits per channel");
  }
  const shift = 8 - colorBits;
  const mask = (1 << colorBits) - 1;
  const keyOf = (r, g, b) =>
    ((r >> shift) << (colorBits * 2)) | ((g >> shift) << colorBits) | (b >> shift);
  // Keep the most frequent color buckets. Water review can opt into RGB888
  // so a narrow color range is not collapsed before palette selection.
  const hist = new Map();
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < d.length; i += 4) {
      const key = keyOf(d[i], d[i + 1], d[i + 2]);
      hist.set(key, (hist.get(key) || 0) + 1);
    }
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256);
  const palette = new Uint8Array(256 * 3);
  for (let k = 0; k < top.length; k++) {
    const key = top[k][0];
    // Preserve the legacy RGB444 palette by default.
    palette[k * 3] = ((key >> (colorBits * 2)) & mask) * (255 / mask);
    palette[k * 3 + 1] = ((key >> colorBits) & mask) * (255 / mask);
    palette[k * 3 + 2] = (key & mask) * (255 / mask);
  }
  const nColors = Math.max(1, top.length);
  // Cache only observed colors; RGB888 should not allocate a 16-million-slot table.
  const cache = new Map();
  const nearest = (r, g, b) => {
    const key = keyOf(r, g, b);
    if (cache.has(key)) return cache.get(key);
    let best = 0,
      bestD = Infinity;
    for (let k = 0; k < nColors; k++) {
      const dr = r - palette[k * 3],
        dg = g - palette[k * 3 + 1],
        db = b - palette[k * 3 + 2];
      const dd = dr * dr + dg * dg + db * db;
      if (dd < bestD) {
        bestD = dd;
        best = k;
      }
    }
    cache.set(key, best);
    return best;
  };
  const indexed = frames.map((f) => {
    const d = f.data,
      out = new Uint8Array(d.length / 4);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) out[p] = nearest(d[i], d[i + 1], d[i + 2]);
    return out;
  });
  return { palette, indexed };
}

// LZW-compress one frame's index array (GIF variable-width codes, LSB-first).
function lzw(indices, minCode) {
  const clear = 1 << minCode,
    eoi = clear + 1;
  let dict = new Map(),
    next = eoi + 1,
    width = minCode + 1;
  const out = [];
  let cur = 0,
    bits = 0;
  const emit = (code) => {
    cur |= code << bits;
    bits += width;
    while (bits >= 8) {
      out.push(cur & 0xff);
      cur >>= 8;
      bits -= 8;
    }
  };
  const resetDict = () => {
    dict = new Map();
    for (let i = 0; i < clear; i++) dict.set(String(i), i);
    next = eoi + 1;
    width = minCode + 1;
  };
  resetDict();
  emit(clear);
  let prefix = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i];
    const key = prefix + "," + c;
    if (dict.has(key)) {
      prefix = key;
      continue;
    }
    emit(dict.get(prefix));
    dict.set(key, next++);
    if (next > 1 << width && width < 12) width++;
    if (next >= 4096) {
      emit(clear);
      resetDict();
    }
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
  const { palette, indexed } = quantize(frames, opts.colorBits);
  const bytes = [];
  const u16 = (v) => {
    bytes.push(v & 0xff, (v >> 8) & 0xff);
  };
  const str = (s) => {
    for (const ch of s) bytes.push(ch.charCodeAt(0));
  };
  str("GIF89a");
  u16(width);
  u16(height);
  bytes.push(0xf7, 0, 0); // global table, 8-bit, 256 colours; bg 0; aspect 0
  for (let i = 0; i < 256 * 3; i++) bytes.push(palette[i] || 0);
  if (opts.loop !== false) {
    // NETSCAPE loop-forever extension.
    bytes.push(0x21, 0xff, 11);
    str("NETSCAPE2.0");
    bytes.push(3, 1, 0, 0, 0);
  }
  const minCode = 8;
  for (const idx of indexed) {
    bytes.push(0x21, 0xf9, 4, 0); // graphic control: no disposal, no transparency
    u16(delayCs);
    bytes.push(0, 0);
    bytes.push(0x2c);
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    bytes.push(0); // image descriptor
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

/** Box-average downscale an RGBA frame by an integer factor. Timeline frames are
 *  1280x800 — a full-res GIF per scenario would bloat the tracked shots/, so the
 *  watch-the-sequence GIF is shrunk (factor 2 → 640x400) while the per-frame PNGs
 *  remain the full-res regression baselines. factor<=1 is a no-op passthrough. */
export function downscaleRGBA(frame, factor) {
  if (factor <= 1) return frame;
  const { data, width, height } = frame;
  const w = Math.floor(width / factor),
    h = Math.floor(height / factor);
  const out = Buffer.alloc(w * h * 4);
  const n = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const si = ((y * factor + dy) * width + (x * factor + dx)) * 4;
          r += data[si];
          g += data[si + 1];
          b += data[si + 2];
          a += data[si + 3];
        }
      }
      const di = (y * w + x) * 4;
      out[di] = r / n;
      out[di + 1] = g / n;
      out[di + 2] = b / n;
      out[di + 3] = a / n;
    }
  }
  return { data: out, width: w, height: h };
}
