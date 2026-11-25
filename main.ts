// news-image-20261125 v3 — MODERN COLORFUL theme, full-day edition.
// Node 22+ STDLIB ONLY (fs, zlib, path). No network, no eval.
// Renders a 1024x1024 PNG to /output/entry.png using a glyph atlas
// rendered natively at each text size (see atlas.png + metrics.json).
// Every string is measured and wrapped before drawing; no hand-drawn
// stroke fonts anywhere.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { fileURLToPath } from "node:url";

// Paths are resolved from THIS script's location and from the environment,
// never from a hardcoded dev-machine path or the working directory: in the
// grader the repo is mounted read-only at /bot and the cwd is not /bot.
const ENTRY_DIR: string = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH: string = path.join(process.env.MAKEFUN_OUTPUT_DIR || "/output", "entry.png");
const W: number = 1024;
const H: number = 1024;

// ---------------------------------------------------------------- palette
type RGB = [number, number, number];
const NAVY: RGB = [27, 42, 74];
const INK: RGB = [30, 41, 59];
const MUTED: RGB = [71, 85, 105];
const TEAL: RGB = [13, 116, 128];
const CORAL: RGB = [225, 29, 72];
const VIOLET: RGB = [124, 58, 237];
const VIOLET_DEEP: RGB = [109, 40, 217];
const AMBER: RGB = [180, 83, 9];
const AMBER_BRIGHT: RGB = [245, 158, 11];
const GREEN: RGB = [21, 128, 61];
const BLUE: RGB = [37, 99, 235];
const PINK: RGB = [219, 39, 119];
const WHITE: RGB = [255, 255, 255];
const LINE: RGB = [226, 232, 240];
const LIGHT_BG: RGB = [241, 245, 249];

function tint(c: RGB, f: number): RGB {
  // Mix colour c toward white by factor f (0 = c, 1 = white).
  return [
    Math.round(c[0] + (255 - c[0]) * f),
    Math.round(c[1] + (255 - c[1]) * f),
    Math.round(c[2] + (255 - c[2]) * f),
  ];
}

// ---------------------------------------------------------------- PNG codec
const CRC_TABLE: Uint32Array = ((): Uint32Array => {
  const t: Uint32Array = new Uint32Array(256);
  for (let n: number = 0; n < 256; n++) {
    let c: number = n;
    for (let k: number = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c: number = 0xffffffff;
  for (let i: number = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len: Buffer = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td: Buffer = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc: Buffer = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function paeth(a: number, b: number, c: number): number {
  const p: number = a + b - c;
  const pa: number = Math.abs(p - a);
  const pb: number = Math.abs(p - b);
  const pc: number = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Decode an 8-bit non-interlaced PNG (colour types 0, 2, 4, 6) to RGBA.
function decodePng(buf: Buffer): { w: number; h: number; rgba: Buffer } {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error("not a PNG");
  }
  let off: number = 8;
  let w: number = 0;
  let h: number = 0;
  let bitDepth: number = 0;
  let colorType: number = 0;
  let interlace: number = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len: number = buf.readUInt32BE(off);
    const type: string = buf.toString("ascii", off + 4, off + 8);
    const data: Buffer = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error("unsupported PNG variant");
  const ch: number = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const stride: number = w * ch;
  const raw: Buffer = zlib.inflateSync(Buffer.concat(idat));
  const rgba: Buffer = Buffer.alloc(w * h * 4);
  let prev: Buffer = Buffer.alloc(stride);
  let p: number = 0;
  for (let y: number = 0; y < h; y++) {
    const filter: number = raw[p++];
    const row: Buffer = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let i: number = 0; i < stride; i++) {
      const a: number = i >= ch ? row[i - ch] : 0;
      const b: number = prev[i];
      const c: number = i >= ch ? prev[i - ch] : 0;
      if (filter === 1) row[i] = (row[i] + a) & 0xff;
      else if (filter === 2) row[i] = (row[i] + b) & 0xff;
      else if (filter === 3) row[i] = (row[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) row[i] = (row[i] + paeth(a, b, c)) & 0xff;
    }
    for (let x: number = 0; x < w; x++) {
      const s: number = x * ch;
      const d: number = (y * w + x) * 4;
      if (ch === 4) {
        rgba[d] = row[s]; rgba[d + 1] = row[s + 1]; rgba[d + 2] = row[s + 2]; rgba[d + 3] = row[s + 3];
      } else if (ch === 3) {
        rgba[d] = row[s]; rgba[d + 1] = row[s + 1]; rgba[d + 2] = row[s + 2]; rgba[d + 3] = 255;
      } else if (ch === 2) {
        rgba[d] = row[s]; rgba[d + 1] = row[s]; rgba[d + 2] = row[s]; rgba[d + 3] = row[s + 1];
      } else {
        rgba[d] = row[s]; rgba[d + 1] = row[s]; rgba[d + 2] = row[s]; rgba[d + 3] = 255;
      }
    }
    prev = row;
  }
  return { w, h, rgba };
}

function encodePng(rgba: Buffer, w: number, h: number): Buffer {
  const raw: Buffer = Buffer.alloc(h * (1 + w * 4));
  for (let y: number = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr: Buffer = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig: Buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- canvas
const canvas: Buffer = Buffer.alloc(W * H * 4);
for (let i: number = 0; i < W * H; i++) {
  canvas[i * 4] = 255; canvas[i * 4 + 1] = 255; canvas[i * 4 + 2] = 255; canvas[i * 4 + 3] = 255;
}

function blend(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const d: number = (y * W + x) * 4;
  const ia: number = 255 - a;
  canvas[d] = Math.round((c[0] * a + canvas[d] * ia) / 255);
  canvas[d + 1] = Math.round((c[1] * a + canvas[d + 1] * ia) / 255);
  canvas[d + 2] = Math.round((c[2] * a + canvas[d + 2] * ia) / 255);
  canvas[d + 3] = 255;
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0: number = Math.max(0, Math.round(x));
  const y0: number = Math.max(0, Math.round(y));
  const x1: number = Math.min(W, Math.round(x + w));
  const y1: number = Math.min(H, Math.round(y + h));
  for (let yy: number = y0; yy < y1; yy++) {
    let d: number = (yy * W + x0) * 4;
    for (let xx: number = x0; xx < x1; xx++) {
      canvas[d] = c[0]; canvas[d + 1] = c[1]; canvas[d + 2] = c[2]; canvas[d + 3] = 255;
      d += 4;
    }
  }
}

function fillRoundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
  const rr: number = Math.min(r, w / 2, h / 2);
  for (let yy: number = Math.round(y); yy < Math.round(y + h); yy++) {
    let dx: number = 0;
    const dEdge: number = Math.min(yy - y, y + h - 1 - yy);
    if (dEdge < rr) {
      const dy: number = rr - dEdge;
      dx = rr - Math.sqrt(rr * rr - dy * dy);
    }
    fillRect(x + dx, yy, w - 2 * dx, 1, c);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  const ri: number = Math.round(r);
  for (let dy: number = -ri; dy <= ri; dy++) {
    const half: number = Math.sqrt(Math.max(0, r * r - dy * dy));
    fillRect(cx - half, cy + dy, half * 2, 1, c);
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  const ri: number = Math.round(ry);
  for (let dy: number = -ri; dy <= ri; dy++) {
    const half: number = rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)));
    fillRect(cx - half, cy + dy, half * 2, 1, c);
  }
}

function fillPolygon(pts: Array<[number, number]>, c: RGB): void {
  let minY: number = Infinity;
  let maxY: number = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let y: number = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i: number = 0; i < pts.length; i++) {
      const a: [number, number] = pts[i];
      const b: [number, number] = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p: number, q: number): number => p - q);
    for (let k: number = 0; k + 1 < xs.length; k += 2) {
      fillRect(Math.ceil(xs[k]), y, Math.floor(xs[k + 1]) - Math.ceil(xs[k]), 1, c);
    }
  }
}

// Thick line as a quad; round caps via circles at the ends.
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const dx: number = x1 - x0;
  const dy: number = y1 - y0;
  const len: number = Math.hypot(dx, dy) || 1;
  const nx: number = (-dy / len) * (w / 2);
  const ny: number = (dx / len) * (w / 2);
  fillPolygon(
    [
      [x0 + nx, y0 + ny],
      [x1 + nx, y1 + ny],
      [x1 - nx, y1 - ny],
      [x0 - nx, y0 - ny],
    ],
    c,
  );
  fillCircle(x0, y0, w / 2, c);
  fillCircle(x1, y1, w / 2, c);
}

function hLine(x: number, y: number, w: number, c: RGB): void {
  fillRect(x, y, w, 1, c);
}

// ---------------------------------------------------------------- text
// Glyph atlas: one row per (weight, size), each rendered NATIVELY at that
// size from the real TTF — glyphs are never resampled between sizes.
type Glyph = { x: number; y: number; w: number; h: number; ox: number; oy: number; adv: number };
type FontRow = { size: number; ascent: number; descent: number; glyphs: Record<string, Glyph> };

const METRICS: { fonts: Record<string, FontRow> } = JSON.parse(
  fs.readFileSync(path.join(ENTRY_DIR, "metrics.json"), "utf-8"),
);
const ATLAS: { w: number; h: number; rgba: Buffer } = decodePng(
  fs.readFileSync(path.join(ENTRY_DIR, "atlas.png")),
);

function fontKey(weight: string, size: number): string {
  return `${weight}_${size}`;
}

function measure(text: string, key: string): number {
  const row: FontRow = METRICS.fonts[key];
  let total: number = 0;
  for (const ch of text) {
    const g: Glyph | undefined = row.glyphs[ch];
    total += g ? g.adv : row.glyphs["?"].adv;
  }
  return total;
}

// Draw text with its baseline at (x, baseY). Returns the advance width.
function drawText(text: string, x: number, baseY: number, key: string, c: RGB): number {
  const row: FontRow = METRICS.fonts[key];
  let pen: number = x;
  for (const ch of text) {
    const g: Glyph | undefined = row.glyphs[ch];
    if (!g) {
      pen += row.glyphs["?"].adv;
      continue;
    }
    if (g.w > 0 && g.h > 0) {
      const gx: number = Math.round(pen + g.ox);
      const gy: number = Math.round(baseY + g.oy);
      for (let yy: number = 0; yy < g.h; yy++) {
        for (let xx: number = 0; xx < g.w; xx++) {
          const a: number = ATLAS.rgba[((g.y + yy) * ATLAS.w + (g.x + xx)) * 4 + 3];
          if (a > 0) blend(gx + xx, gy + yy, c, a);
        }
      }
    }
    pen += g.adv;
  }
  return pen - x;
}

function drawTextCentered(text: string, cx: number, baseY: number, key: string, c: RGB): void {
  drawText(text, cx - measure(text, key) / 2, baseY, key, c);
}

function wrapText(text: string, key: string, maxW: number): string[] {
  const words: string[] = text.split(" ");
  const lines: string[] = [];
  let cur: string = "";
  for (const word of words) {
    const trial: string = cur === "" ? word : `${cur} ${word}`;
    if (measure(trial, key) <= maxW || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Coloured chip (rounded pill) with white bold text; returns its width.
function chip(text: string, x: number, y: number, h: number, key: string, bg: RGB): number {
  const w: number = measure(text, key) + 16;
  fillRoundRect(x, y, w, h, h / 2, bg);
  drawText(text, x + 8, y + h / 2 + 3.5, key, WHITE);
  return w;
}

// Small dark status pill (CONFIRMED / REPORTED) drawn inside an illustration.
function statusPill(text: string, x: number, y: number, bg: RGB): void {
  const key: string = fontKey("Bold", 9);
  const w: number = measure(text, key) + 12;
  fillRoundRect(x, y, w, 13, 6, bg);
  drawText(text, x + 6, y + 10, key, WHITE);
}

// ---------------------------------------------------------------- content
// Full-day Wednesday 25 November 2026, cut-off ~21:30 UTC. All figures from
// the v2 verified research; DATE CHECK wording verbatim.
const MASTHEAD: string = "Wednesday 25 November 2026";
const SUBDECK: string =
  "Tariffs proposed for 14 economies  —  US economy roars  —  Shenzhou-24 docks with first foreign astronaut";

type Stat = { n: string; label: string; c: RGB };
const STATS: Stat[] = [
  { n: "−6.16%", label: "KOSPI, WEDNESDAY CLOSE", c: CORAL },
  { n: "4.3%", label: "US Q3 GDP, ANNUALISED", c: TEAL },
  { n: "3.3%", label: "CORE PCE INFLATION, OCTOBER", c: VIOLET },
  { n: "$132.3bn", label: "DELL AI SERVER BACKLOG", c: NAVY },
  { n: "50+", label: "HOSTAGES FREED, CARTAGENA", c: GREEN },
  { n: "570,000", label: "AIDS DEATHS IN 2025", c: AMBER },
];

type Tl = { t: string; c: RGB; text: string };
const TIMELINE: Tl[] = [
  { t: "OVERNIGHT", c: CORAL, text: "Russia hits Ukraine's energy grid; power cut in five regions." },
  { t: "00:18 UTC", c: TEAL, text: "Shenzhou-24 launches from Jiuquan." },
  { t: "03:56 UTC", c: VIOLET, text: "Shenzhou-24 docks with Tiangong." },
  { t: "EARLY WED", c: AMBER, text: "Cartagena hostages freed after ~17-hour siege." },
  { t: "MORNING", c: GREEN, text: "Asia stocks tumble; Kospi closes −6.16%." },
  { t: "13:30 UTC", c: BLUE, text: "US GDP 4.3%, core PCE 3.3% — hot inflation." },
  { t: "21:00 UTC", c: PINK, text: "Wall Street closes; Nasdaq −0.62% after a −4.6% plunge; Dow +0.33%." },
];

type Lead = { n: number; kicker: string; kc: RGB; head: string; hc: RGB; body: string; src: string; tintBg: RGB };
const LEADS: Lead[] = [
  {
    n: 1,
    kicker: "WASHINGTON — TRADE",
    kc: CORAL,
    head: "Tariffs proposed for 14 economies as markets rout",
    hc: CORAL,
    body: "The US formally proposes Section 301 duties on 14 economies. China faces 20% on top of ~25% first-term duties; the EU, Japan, South Korea and Taiwan are capped at 15%.",
    src: "Reuters · Invezz — CONFIRMED",
    tintBg: tint(CORAL, 0.93),
  },
  {
    n: 2,
    kicker: "WASHINGTON — ECONOMY",
    kc: TEAL,
    head: "US economy roars as inflation runs hot",
    hc: TEAL,
    body: "Q3 GDP is revised up to 4.3% annualised, the fastest in three years. October PCE rises 0.3% on the month, 3.8% on the year; core PCE hits 3.3%, the hottest since November 2023.",
    src: "Reuters · BEA — CONFIRMED",
    tintBg: tint(TEAL, 0.93),
  },
  {
    n: 3,
    kicker: "CHINA — SPACE",
    kc: VIOLET,
    head: "Shenzhou-24 docks with first foreign astronaut",
    hc: VIOLET,
    body: "Launched 00:18 UTC, Shenzhou-24 docks with Tiangong at 03:56 UTC. Pakistani pilot Muhammad Zeeshan Ali, 40, is the first Pakistani in orbit and the first foreign astronaut aboard Tiangong.",
    src: "Xinhua · CMSA — CONFIRMED",
    tintBg: tint(VIOLET, 0.93),
  },
];

type Grid = { n: number; kicker: string; kc: RGB; head: string; hc: RGB; body: string; src: string };
const GRID: Grid[] = [
  { n: 4, kicker: "SEOUL / TOKYO — MARKETS", kc: CORAL, head: "Asia markets rout", hc: CORAL, body: "Kospi −6.16% to 4,697.51; Taiex −4.80%; Nikkei −2.78%.", src: "Reuters" },
  { n: 5, kicker: "NEW YORK — MARKETS", kc: TEAL, head: "Wall Street pares a plunge", hc: TEAL, body: "Nasdaq −0.62% at 23,585.80 after a −4.6% plunge; Dow +0.33%.", src: "Reuters" },
  { n: 6, kicker: "KYIV / ODESA — WAR", kc: VIOLET, head: "Russia hits Ukraine's energy grid", hc: VIOLET, body: "Overnight attack cuts power in five regions; a plant halts.", src: "Reuters" },
  { n: 7, kicker: "CARTAGENA — CRIME", kc: AMBER, head: "Cartagena hostages freed", hc: AMBER, body: "Forces free all hostages after a ~17-hour siege.", src: "AP" },
  { n: 8, kicker: "ROUND ROCK — TECH", kc: NAVY, head: "Dell beats, shares fall", hc: NAVY, body: "Revenue $54.9bn, +103% YoY; AI backlog a record $132.3bn.", src: "Reuters" },
  { n: 9, kicker: "GAZA CITY — WAR", kc: CORAL, head: "Hamas security chief killed", hc: CORAL, body: "Strike kills Hamas colonel Mohammad Abuelouf and his family.", src: "Reuters" },
  { n: 10, kicker: "BLUE NILE — WAR", kc: TEAL, head: "Sudan drone strikes kill 19", hc: TEAL, body: "RSF drone strikes kill 19 civilians and wound 20 in Blue Nile.", src: "AFP" },
  { n: 11, kicker: "KOSHI — DISASTER", kc: VIOLET, head: "Nepal quake 5.6", hc: VIOLET, body: "Magnitude 5.6 quake strikes Koshi province near the Tibet border.", src: "AP" },
  { n: 12, kicker: "HORMUZ — SECURITY", kc: AMBER, head: "Two tankers hit mines in Hormuz", hc: AMBER, body: "Two oil tankers strike naval mines and catch fire in the strait.", src: "Reuters" },
  { n: 13, kicker: "REDMOND — TECH", kc: NAVY, head: "Microsoft 'Code Red'", hc: NAVY, body: "Microsoft declares 'Code Red' after a nearly 24-hour outage.", src: "Bloomberg" },
];

const WIRES_A: string[] = [
  "14. O'Hare radar outage delays flights into Chicago (FAA).",
  "15. Australian inflation jumps to 4.9%, odds of a rate rise grow.",
  "16. Moscow calls Ukrainian ship strikes \u201Cterrorism\u201D; Zelenskiy confirmed Ukraine hit the cargo vessel Sparta II.",
  "17. Fort Hood shooter Hasan seeks stay of execution set for next week; survivors denied attendance.",
  "18. Gaza death toll reaches 74,746 amid Israeli attacks (WAFA).",
  "19. 266 million people face acute food insecurity (WFP).",
  "20. Bangladesh garment workers win 36% wage increase.",
  "21. Malaysia to send 6,500+ Rohingya refugees back to Myanmar in Dec.",
  "22. DRC Ebola team evacuated from Akwe hospital amid fighting.",
  "23. UNAIDS: AIDS deaths fell to 570,000 in 2025, lowest in 20+ years.",
  "24. UAE bus\u2013truck collision toll rises to 13 in Ras Al Khaimah.",
  "25. Eisenkot clinches first coalition deal to form Israeli govt.",
];

const WIRES_B: string[] = [
  "26. Lewis Pugh swims 15 km through Strait of Hormuz over three days.",
  "27. Gukesh holds Sindarov in world chess championship.",
  "28. Sooryavanshi, 15, hits fastest List A 200: 204 off 53 balls.",
  "29. North Korea threatens to close Swiss office over sanctions.",
  "30. Ukraine needs \u20AC115bn ($125bn) external support in 2027.",
  "31. Ousted PM Sheikh Hasina plans return to Bangladesh on 16 Dec.",
  "32. Lukashenko proposes flying with Zelenskiy to Moscow for talks.",
  "33. French officials order ex-president Sarkozy's corruption case to trial; hearing 1 April 2027.",
  "34. Trump awards the Medal of Freedom to Rudy Giuliani.",
  "35. Small plane crashes into Gulf of Mexico; rescue searching for 6.",
  "36. Yemen: strike on buses and trucks kills 26 (The Hindu).",
];

const DATE_CHECK: string =
  "NOW INCLUDED (Wednesday 25 November): USTR tariff proposals and the Asia selloff, the Wall Street close, Q3 GDP 4.3% and October PCE, the Shenzhou-24 launch and docking, the Nepal quake, the Cartagena rescue, Russia's energy-grid attack, Dell's $132.3bn AI backlog, the Hamas security chief killed in Gaza, the Sudan drone strikes, the Yemen strike, Microsoft's 'Code Red', the Hormuz tankers hit by mines. LEFT OUT (earlier news): COP31 collapse (Sun 22 Nov), ICJ Myanmar ruling (19 Nov), Anthropic IPO debut (19 Nov), Huang's reinstatement (Mon 23 Nov), Dymer strike (22 Nov), Java factory fire (23 Nov), Benghazi warship sinking (22\u201323 Nov), NATO space vow (24 Nov), Russian jets near Ulleung (Tue 24 Nov), the turkey pardon ceremony (Tue 24 Nov), the US-weighs-strikes-on-Iranian-leaders report (Tue 24 Nov). Still to come after press time: EU summit (26\u201327 Nov), Thanksgiving Day (Thu 26 Nov), US markets closed Thursday.";

const SOURCES_LINE: string =
  "Sources: Reuters, WSJ, AP, Bloomberg, The Hindu, BBC, UN News, AFP, BEA, Xinhua. Cut-off ~21:30 UTC, Wednesday 25 November 2026.";

// Dotted world map: 52 cols x 22 rows, '#' = land. Cols run -170..+190 lon,
// rows run ~+75..-55 lat. Pins are placed by (col, row) on this grid.
const MAP_ROWS: string[] = [
  "      ###########     #              #############  ",
  "    ###############   ###          #################",
  "   ################    ##         ##################",
  "    ##############     ##   ###     ##############  ",
  "     ############           ###     ############  ",
  "      ##########     #      ####     ############     ",
  "       ########      ##      ###      ##########      ",
  "        ######       #       ###       ########       ",
  "         ####        ##      ###        ######  ##    ",
  "         ###          #       ##         ####  ###    ",
  "          ##          #       ##          ##    ##    ",
  "          ##                 ###          #           ",
  "           #                  ##                      ",
  "           ##                 ##                      ",
  "            #                  #          ##          ",
  "            #                             ###         ",
  "            #                            ####         ",
  "                                     ##  ######       ",
  "                                      #   #####       ",
  "                                          ####        ",
  "                                           ##         ",
  "                                                          ",
];

// [number, col, row, colour] — keyed to stories 1-13.
const PINS: Array<[number, number, number, RGB]> = [
  [1, 13, 6, CORAL],
  [2, 16, 7, TEAL],
  [3, 40, 6, VIOLET],
  [4, 44, 7, CORAL],
  [5, 18, 5, TEAL],
  [6, 30, 5, VIOLET],
  [7, 15, 11, AMBER],
  [8, 11, 9, NAVY],
  [9, 31, 8, CORAL],
  [10, 31, 11, TEAL],
  [11, 40, 8, VIOLET],
  [12, 35, 9, AMBER],
  [13, 8, 5, NAVY],
];

// ---------------------------------------------------------------- helpers
function illoBand(x: number, y: number, w: number, h: number, r: number, bg: RGB): void {
  fillRoundRect(x, y, w, h, r, bg);
  fillRect(x, y + h - r, w, r, bg); // square off the bottom corners
}

function numBadge(n: number, cx: number, cy: number, r: number, bg: RGB): void {
  fillCircle(cx, cy, r, bg);
  drawTextCentered(String(n), cx, cy + 4.5, fontKey("Bold", 13), WHITE);
}

// ---------------------------------------------------------------- illustrations
// Flat geometric illustrations in the theme palette. Each lead gets a
// 64px band; each grid card a 28px band.
function drawLeadIllo(n: number, x: number, y: number, w: number, h: number): void {
  if (n === 1) {
    // Cargo ship under tariff skies.
    illoBand(x, y, w, h, 10, tint(BLUE, 0.82));
    fillCircle(x + 272, y + 14, 9, AMBER_BRIGHT);
    fillRect(x + 58, y + 26, 26, 18, CORAL);
    fillRect(x + 88, y + 22, 26, 22, AMBER_BRIGHT);
    fillRect(x + 118, y + 28, 26, 16, TEAL);
    fillRect(x + 148, y + 24, 26, 20, VIOLET);
    fillRect(x + 178, y + 30, 26, 14, PINK);
    thickLine(x + 208, y + 44, x + 208, y + 18, 3, NAVY);
    fillPolygon([[x + 30, y + 44], [x + 274, y + 44], [x + 258, y + 58], [x + 46, y + 58]], NAVY);
    thickLine(x + 20, y + 61, x + 70, y + 61, 2, TEAL);
    thickLine(x + 90, y + 61, x + 150, y + 61, 2, TEAL);
    thickLine(x + 170, y + 61, x + 230, y + 61, 2, TEAL);
  } else if (n === 2) {
    // Rising bars with a hot trend line.
    illoBand(x, y, w, h, 10, tint(TEAL, 0.88));
    const bars: Array<[number, RGB]> = [
      [18, NAVY],
      [26, TEAL],
      [22, VIOLET],
      [34, CORAL],
      [44, AMBER_BRIGHT],
    ];
    for (let i: number = 0; i < 5; i++) {
      const bx: number = x + 42 + i * 46;
      fillRoundRect(bx, y + 58 - bars[i][0], 28, bars[i][0], 3, bars[i][1]);
    }
    thickLine(x + 56, y + 34, x + 102, y + 26, 3, CORAL);
    thickLine(x + 102, y + 26, x + 148, y + 30, 3, CORAL);
    thickLine(x + 148, y + 30, x + 194, y + 18, 3, CORAL);
    thickLine(x + 194, y + 18, x + 240, y + 8, 3, CORAL);
    fillCircle(x + 240, y + 8, 4, CORAL);
  } else {
    // Rocket over a dark sky, planet at left.
    illoBand(x, y, w, h, 10, NAVY);
    const stars: Array<[number, number]> = [
      [20, 10], [60, 22], [110, 8], [150, 18], [250, 10], [285, 30], [90, 40], [30, 50],
    ];
    for (const s of stars) fillCircle(x + s[0], y + s[1], 1.5, WHITE);
    fillCircle(x + 48, y + 22, 12, CORAL);
    fillCircle(x + 44, y + 18, 4, tint(CORAL, 0.5));
    fillCircle(x + 252, y + 48, 7, tint(BLUE, 0.6));
    fillPolygon([[x + 180, y + 16], [x + 202, y + 16], [x + 191, y + 4]], CORAL);
    fillRoundRect(x + 180, y + 16, 22, 30, 8, WHITE);
    fillCircle(x + 191, y + 28, 4, TEAL);
    fillPolygon([[x + 180, y + 38], [x + 172, y + 50], [x + 180, y + 46]], CORAL);
    fillPolygon([[x + 202, y + 38], [x + 210, y + 50], [x + 202, y + 46]], CORAL);
    fillPolygon([[x + 185, y + 46], [x + 197, y + 46], [x + 191, y + 60]], AMBER_BRIGHT);
  }
}

function drawGridIllo(n: number, x: number, y: number, w: number, h: number): void {
  if (n === 4) {
    illoBand(x, y, w, h, 8, tint(CORAL, 0.88));
    thickLine(x + 12, y + 6, x + 60, y + 10, 2, CORAL);
    thickLine(x + 60, y + 10, x + 110, y + 16, 2, CORAL);
    thickLine(x + 110, y + 16, x + 160, y + 24, 2, CORAL);
    fillCircle(x + 160, y + 24, 3, CORAL);
  } else if (n === 5) {
    illoBand(x, y, w, h, 8, tint(TEAL, 0.9));
    const bars: Array<[number, number, RGB]> = [
      [20, 14, CORAL],
      [60, 8, CORAL],
      [100, 16, GREEN],
      [140, 20, GREEN],
    ];
    for (const b of bars) fillRect(x + b[0], y + 24 - b[1], 14, b[1], b[2]);
    thickLine(x + 27, y + 6, x + 67, y + 14, 2, NAVY);
    thickLine(x + 67, y + 14, x + 107, y + 10, 2, NAVY);
    thickLine(x + 107, y + 10, x + 147, y + 4, 2, NAVY);
  } else if (n === 6) {
    illoBand(x, y, w, h, 8, NAVY);
    fillPolygon(
      [[x + 96, y + 3], [x + 82, y + 15], [x + 92, y + 15], [x + 84, y + 25], [x + 102, y + 12], [x + 92, y + 12]],
      AMBER_BRIGHT,
    );
    fillCircle(x + 30, y + 8, 2, WHITE);
    fillCircle(x + 160, y + 20, 2, WHITE);
  } else if (n === 7) {
    illoBand(x, y, w, h, 8, tint(AMBER, 0.88));
    for (let i: number = 0; i < 6; i++) fillRect(x + i * 32, y, 16, 8, i % 2 === 0 ? CORAL : WHITE);
    fillRect(x + 84, y + 12, 20, 16, NAVY);
    fillRect(x + 30, y + 16, 12, 12, NAVY);
    fillRect(x + 150, y + 16, 12, 12, NAVY);
  } else if (n === 8) {
    illoBand(x, y, w, h, 8, tint(NAVY, 0.9));
    fillRoundRect(x + 66, y + 4, 56, 18, 2, NAVY);
    thickLine(x + 72, y + 18, x + 90, y + 12, 2, TEAL);
    thickLine(x + 90, y + 12, x + 108, y + 15, 2, TEAL);
    thickLine(x + 108, y + 15, x + 118, y + 8, 2, TEAL);
    fillPolygon([[x + 60, y + 22], [x + 128, y + 22], [x + 134, y + 26], [x + 54, y + 26]], NAVY);
  } else if (n === 9) {
    illoBand(x, y, w, h, 8, tint(CORAL, 0.9));
    fillRect(x + 30, y + 12, 18, 16, NAVY);
    fillRect(x + 56, y + 6, 18, 22, NAVY);
    fillRect(x + 82, y + 14, 18, 14, NAVY);
    fillRect(x + 108, y + 9, 18, 19, NAVY);
    fillCircle(x + 160, y + 10, 6, AMBER_BRIGHT);
  } else if (n === 10) {
    illoBand(x, y, w, h, 8, tint(AMBER, 0.88));
    fillCircle(x + 158, y + 9, 7, AMBER_BRIGHT);
    // Dunes as flat polygons clipped inside the 28px band.
    fillPolygon([[x + 8, y + 28], [x + 70, y + 14], [x + 132, y + 28]], AMBER);
    fillPolygon([[x + 96, y + 28], [x + 150, y + 18], [x + 189, y + 28]], tint(AMBER, 0.4));
  } else if (n === 11) {
    illoBand(x, y, w, h, 8, tint(VIOLET, 0.9));
    fillPolygon([[x + 20, y + 28], [x + 70, y + 4], [x + 120, y + 28]], NAVY);
    fillPolygon([[x + 90, y + 28], [x + 140, y + 8], [x + 180, y + 28]], VIOLET);
    thickLine(x + 70, y + 4, x + 62, y + 14, 2, WHITE);
    thickLine(x + 62, y + 14, x + 72, y + 20, 2, WHITE);
  } else if (n === 12) {
    illoBand(x, y, w, h, 8, tint(BLUE, 0.88));
    fillPolygon([[x + 40, y + 16], [x + 150, y + 16], [x + 140, y + 25], [x + 50, y + 25]], NAVY);
    fillRect(x + 96, y + 8, 10, 8, CORAL);
    fillPolygon([[x + 120, y + 8], [x + 126, y + 2], [x + 132, y + 8]], AMBER_BRIGHT);
    thickLine(x + 20, y + 26, x + 60, y + 26, 2, TEAL);
    thickLine(x + 150, y + 26, x + 178, y + 26, 2, TEAL);
  } else {
    illoBand(x, y, w, h, 8, tint(BLUE, 0.9));
    fillRect(x + 70, y + 5, 20, 9, BLUE);
    fillRect(x + 94, y + 5, 20, 9, TEAL);
    fillRect(x + 70, y + 16, 20, 9, VIOLET);
    fillRect(x + 94, y + 16, 20, 9, CORAL);
    fillCircle(x + 160, y + 14, 6, AMBER_BRIGHT);
  }
}

// ---------------------------------------------------------------- layout
const MX: number = 22;
const CW: number = 980;

function drawTopStrip(): void {
  drawText("THE WORLD IN ONE DAY — FULL-DAY EDITION", MX, 18, fontKey("Bold", 10), NAVY);
  const right: string = "36 STORIES · 7 REGIONS · WEDNESDAY 25 NOVEMBER 2026";
  drawText(right, MX + CW - measure(right, fontKey("Bold", 10)), 18, fontKey("Bold", 10), NAVY);
  const seg: RGB[] = [CORAL, AMBER_BRIGHT, TEAL, VIOLET, GREEN, BLUE, PINK];
  const sw: number = CW / seg.length;
  for (let i: number = 0; i < seg.length; i++) fillRect(MX + i * sw, 26, sw, 4, seg[i]);
}

function drawMasthead(): void {
  drawTextCentered(MASTHEAD, MX + CW / 2, 76, fontKey("Bold", 46), NAVY);
  fillRoundRect(MX + CW / 2 - 70, 84, 140, 4, 2, CORAL);
  drawTextCentered(SUBDECK, MX + CW / 2, 102, fontKey("Bold", 13), NAVY);
}

function drawStats(): void {
  const y0: number = 110;
  hLine(MX, y0, CW, LINE);
  const cellW: number = CW / STATS.length;
  for (let i: number = 0; i < STATS.length; i++) {
    const cx: number = MX + cellW * i + cellW / 2;
    drawTextCentered(STATS[i].n, cx, 136, fontKey("Bold", 26), STATS[i].c);
    drawTextCentered(STATS[i].label, cx, 151, fontKey("Bold", 9), MUTED);
    if (i > 0) fillRect(MX + cellW * i, y0 + 8, 1, 32, LINE);
  }
  hLine(MX, 158, CW, LINE);
}

function drawTimeline(): void {
  fillRoundRect(MX, 164, CW, 52, 8, LIGHT_BG);
  const segW: number = CW / TIMELINE.length;
  for (let i: number = 0; i < TIMELINE.length; i++) {
    const sx: number = MX + segW * i;
    drawText(TIMELINE[i].t, sx + 8, 178, fontKey("Bold", 10), TIMELINE[i].c);
    const lines: string[] = wrapText(TIMELINE[i].text, fontKey("Regular", 10), segW - 16);
    for (let li: number = 0; li < lines.length; li++) {
      drawText(lines[li], sx + 8, 190 + li * 11, fontKey("Regular", 10), INK);
    }
  }
}

function drawLeads(): void {
  const colW: number = 316;
  const xs: number[] = [MX, MX + 332, MX + 664];
  for (let i: number = 0; i < LEADS.length; i++) {
    const L: Lead = LEADS[i];
    const x: number = xs[i];
    const y0: number = 222;
    fillRoundRect(x, y0, colW, 220, 10, L.tintBg);
    drawLeadIllo(L.n, x, y0, colW, 64);
    numBadge(L.n, x + 18, y0 + 18, 12, L.kc);
    statusPill("CONFIRMED", x + colW - 74, y0 + 8, NAVY);
    chip(L.kicker, x + 12, y0 + 72, 17, fontKey("Bold", 10), L.kc);
    const headLines: string[] = wrapText(L.head, fontKey("Bold", 20), colW - 24);
    for (let li: number = 0; li < headLines.length; li++) {
      drawText(headLines[li], x + 12, 326 + li * 24, fontKey("Bold", 20), L.hc);
    }
    const bodyLines: string[] = wrapText(L.body, fontKey("Regular", 12), colW - 24);
    for (let li: number = 0; li < bodyLines.length; li++) {
      drawText(bodyLines[li], x + 12, 368 + li * 15, fontKey("Regular", 12), INK);
    }
    drawText(L.src, x + 12, 430, fontKey("Bold", 10), L.kc);
  }
}

function drawGrid(): void {
  drawText("MORE TOP STORIES", MX, 454, fontKey("Bold", 13), NAVY);
  fillRect(MX + 158, 446, CW - 158, 3, CORAL);
  const colW: number = 190;
  const xs: number[] = [MX, MX + 198, MX + 396, MX + 594, MX + 792];
  const ys: number[] = [462, 566];
  for (let i: number = 0; i < GRID.length; i++) {
    const G: Grid = GRID[i];
    const x: number = xs[i % 5];
    const y0: number = ys[Math.floor(i / 5)];
    fillRoundRect(x, y0, colW, 102, 8, tint(G.hc, 0.95));
    drawGridIllo(G.n, x, y0, colW, 28);
    numBadge(G.n, x + 13, y0 + 14, 9, G.kc);
    statusPill("REPORTED", x + colW - 62, y0 + 7, NAVY);
    drawText(G.kicker, x + 8, y0 + 42, fontKey("Bold", 9), G.kc);
    drawText(G.src, x + colW - 8 - measure(G.src, fontKey("Regular", 9)), y0 + 42, fontKey("Regular", 9), MUTED);
    const headLines: string[] = wrapText(G.head, fontKey("Bold", 13), colW - 16);
    for (let li: number = 0; li < headLines.length; li++) {
      drawText(headLines[li], x + 8, y0 + 57 + li * 15, fontKey("Bold", 13), G.hc);
    }
    const bodyLines: string[] = wrapText(G.body, fontKey("Regular", 10), colW - 16);
    for (let li: number = 0; li < bodyLines.length; li++) {
      drawText(bodyLines[li], x + 8, y0 + 87 + li * 12, fontKey("Regular", 10), INK);
    }
  }
}

function drawWireColumn(items: string[], x: number, w: number, yStart: number): number {
  let y: number = yStart;
  const numKey: string = fontKey("Bold", 9);
  const txtKey: string = fontKey("Regular", 9);
  for (const item of items) {
    const m: RegExpMatchArray | null = item.match(/^(\d+)\.\s(.*)$/);
    const num: string = m ? `${m[1]}.` : "";
    const rest: string = m ? m[2] : item;
    const numW: number = measure(num, numKey);
    drawText(num, x, y, numKey, CORAL);
    const lines: string[] = wrapText(rest, txtKey, w - numW - 6);
    for (let li: number = 0; li < lines.length; li++) {
      drawText(lines[li], x + numW + 6, y + li * 11, txtKey, INK);
    }
    y += lines.length * 11 + 1;
  }
  return y;
}

function drawWiresAndMap(): void {
  drawText("ALSO IN — 23 MORE STORIES", MX, 686, fontKey("Bold", 13), NAVY);
  fillRect(MX + 218, 678, CW - 218 - 312, 3, TEAL);
  drawText("WHERE IT HAPPENED", 690, 686, fontKey("Bold", 13), NAVY);
  drawWireColumn(WIRES_A, MX, 318, 700);
  drawWireColumn(WIRES_B, 356, 318, 700);
  // Dotted world map.
  const cell: number = 6;
  const mapX: number = 690;
  const mapY: number = 694;
  for (let r: number = 0; r < MAP_ROWS.length; r++) {
    for (let c: number = 0; c < MAP_ROWS[r].length; c++) {
      if (MAP_ROWS[r][c] === "#") {
        fillCircle(mapX + c * cell + 3, mapY + r * cell + 3, 1.7, [203, 213, 225]);
      }
    }
  }
  for (const pin of PINS) {
    const px: number = mapX + pin[1] * cell + 3;
    const py: number = mapY + pin[2] * cell + 3;
    fillCircle(px, py, 8, pin[3]);
    drawTextCentered(String(pin[0]), px, py + 3.5, fontKey("Bold", 9), WHITE);
  }
  const legend: string[] = [
    "1–2 Washington · 3 Jiuquan · 4 Seoul",
    "5 New York · 6 Odesa · 7 Cartagena · 8 Round Rock",
    "9 Gaza City · 10 Blue Nile · 11 Koshi · 12 Hormuz · 13 Redmond",
  ];
  for (let li: number = 0; li < legend.length; li++) {
    drawText(legend[li], mapX, 840 + li * 12, fontKey("Regular", 9), MUTED);
  }
}

function drawDateCheck(): void {
  fillRoundRect(MX, 878, CW, 106, 10, VIOLET_DEEP);
  drawText(
    "DATE CHECK — FULL-DAY EDITION.  Cut-off ~21:30 UTC, Wednesday 25 November 2026.",
    MX + 18,
    898,
    fontKey("Bold", 12),
    WHITE,
  );
  const lines: string[] = wrapText(DATE_CHECK, fontKey("Regular", 11), CW - 36);
  for (let li: number = 0; li < lines.length; li++) {
    drawText(lines[li], MX + 18, 916 + li * 13, fontKey("Regular", 11), WHITE);
  }
}

function drawSourcesAndFooter(): void {
  drawText(SOURCES_LINE, MX, 996, fontKey("Regular", 10), MUTED);
  fillRoundRect(MX, 1002, CW, 20, 6, NAVY);
  drawText("THE WORLD IN ONE DAY", MX + 12, 1016, fontKey("Bold", 11), WHITE);
  const right: string = "WEDNESDAY 25 NOVEMBER 2026 · ONE PAGE";
  drawText(right, MX + CW - 12 - measure(right, fontKey("Bold", 11)), 1016, fontKey("Bold", 11), WHITE);
}

// ---------------------------------------------------------------- main
function main(): void {
  drawTopStrip();
  drawMasthead();
  drawStats();
  drawTimeline();
  drawLeads();
  drawGrid();
  drawWiresAndMap();
  drawDateCheck();
  drawSourcesAndFooter();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, encodePng(canvas, W, H));
}

main();
