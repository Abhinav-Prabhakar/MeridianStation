import * as THREE from "three";
import type { Kit } from "../core/kit";
import type { Zone } from "./layout";
import { pointInPoly } from "./layout";

/**
 * Procedural decals.
 *
 * A photograph of a wall has hundreds of small events on it: a water stain
 * spreading from the ceiling, paint chipped off a stencil, a taped notice
 * curling at one corner, boot scuffs at kick height. None of that is
 * geometry — it is a *texture layer*, and without it big plaster fields read
 * as flat paint no matter how good the lighting is.
 *
 * Everything here is drawn at runtime into one 2048² canvas atlas (16 tiles of
 * 512²), so the cost is a single 4 MB texture and one draw call for every decal
 * in the station: each decal is a plane whose UVs are remapped into its tile,
 * and `mergeStatic` folds them all into one mesh.
 *
 * Placement is by raycast rather than by hand-authored coordinates: sample a
 * point inside a room, fire a ray outward, and if it hits a tagged wall face,
 * stamp a decal there with its normal. That means the decals follow the
 * geometry when rooms move, and they never float off a wall.
 */

export const ATLAS = 2048;
const TILE = ATLAS / 4;

type Painter = (g: CanvasRenderingContext2D, S: number, rnd: () => number) => void;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Punch irregular holes out of whatever has been painted, for chipped paint. */
function wear(g: CanvasRenderingContext2D, S: number, rnd: () => number, amount = 0.3) {
  g.save();
  g.globalCompositeOperation = "destination-out";
  const n = Math.round(S * amount * 0.5);
  for (let i = 0; i < n; i++) {
    const a = 0.25 + rnd() * 0.6;
    g.fillStyle = `rgba(0,0,0,${a})`;
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 0.6 + rnd() * 3.4;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + rnd()), rnd() * 3.14, 0, 6.2832);
    g.fill();
  }
  g.restore();
}

/** Stencil lettering: condensed, slightly uneven, with a faint over-spray. */
function stencilText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  rnd: () => number,
  spacing = 1.06,
  /** shrink to fit inside this width, starting at x */
  maxWidth = 0
) {
  g.save();
  g.fillStyle = color;
  g.textBaseline = "middle";
  g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`;
  if (maxWidth > 0) {
    let w = 0;
    for (const ch of text) w += g.measureText(ch).width * spacing;
    if (w > maxWidth) {
      size *= maxWidth / w;
      g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`;
    }
  }
  let cx = x;
  for (const ch of text) {
    const w = g.measureText(ch).width * spacing;
    // a stencil letter is a separate cut: each one sits a hair off its own line
    g.save();
    g.translate(cx, y + (rnd() - 0.5) * size * 0.03);
    g.rotate((rnd() - 0.5) * 0.012);
    g.fillText(ch, 0, 0);
    g.restore();
    cx += w;
  }
  g.restore();
}

function raggedRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number) {
  g.beginPath();
  const step = 10;
  g.moveTo(x, y);
  for (let i = 0; i <= w; i += step) g.lineTo(x + i, y + (rnd() - 0.5) * 2.5);
  for (let i = 0; i <= h; i += step) g.lineTo(x + w + (rnd() - 0.5) * 2.5, y + i);
  for (let i = w; i >= 0; i -= step) g.lineTo(x + i, y + h + (rnd() - 0.5) * 2.5);
  for (let i = h; i >= 0; i -= step) g.lineTo(x + (rnd() - 0.5) * 2.5, y + i);
  g.closePath();
  g.fill();
}

// ---------------------------------------------------------------- the art
const TILES: Painter[] = [
  // 0 — water damage spreading from a ceiling line
  (g, S, rnd) => {
    const cx = S * (0.3 + rnd() * 0.4);
    const grd = g.createRadialGradient(cx, S * 0.08, S * 0.02, cx, S * 0.1, S * 0.62);
    grd.addColorStop(0, "rgba(74,58,38,0.78)");
    grd.addColorStop(0.45, "rgba(88,72,50,0.42)");
    grd.addColorStop(0.78, "rgba(105,88,62,0.2)");
    grd.addColorStop(1, "rgba(110,94,68,0)");
    g.fillStyle = grd;
    raggedRect(g, 0, 0, S, S, rnd);
    // tide mark: the edge of the last time it got wet
    g.strokeStyle = "rgba(52,40,26,0.4)";
    g.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      const t = (k + 1) / 3.4;
      for (let a = 0; a <= 6.4; a += 0.18) {
        const r = S * (0.16 + t * 0.34) * (1 + 0.1 * Math.sin(a * 5 + k));
        g.lineTo(cx + Math.cos(a) * r, S * 0.1 + Math.sin(a) * r * 1.25);
      }
      g.closePath();
      g.stroke();
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(40,32,22,${rnd() * 0.16})`;
      g.beginPath();
      g.arc(rnd() * S, rnd() * S, rnd() * 2.6, 0, 6.2832);
      g.fill();
    }
  },

  // 1 — drips running down from a leak
  (g, S, rnd) => {
    const n = 9 + Math.floor(rnd() * 8);
    for (let i = 0; i < n; i++) {
      const x = S * (0.08 + rnd() * 0.84);
      const len = S * (0.15 + rnd() * 0.8);
      const w = 1.2 + rnd() * 4.2;
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, `rgba(46,38,26,${0.24 + rnd() * 0.34})`);
      grd.addColorStop(0.7, "rgba(52,43,30,0.16)");
      grd.addColorStop(1, "rgba(56,46,32,0)");
      g.fillStyle = grd;
      g.fillRect(x, 0, w, len);
      // a heavier bead at the bottom of the run
      g.fillStyle = "rgba(38,31,21,0.22)";
      g.beginPath();
      g.ellipse(x + w / 2, len * 0.94, w * 1.3, w * 1.7, 0, 0, 6.2832);
      g.fill();
    }
  },

  // 2 — rust running down from a fixture or bracket above
  (g, S, rnd) => {
    for (let i = 0; i < 26; i++) {
      const x = S * (0.2 + rnd() * 0.6);
      const len = S * (0.2 + rnd() * 0.75);
      g.fillStyle = `rgba(${110 + rnd() * 50 | 0},${58 + rnd() * 30 | 0},${22 + rnd() * 16 | 0},${0.12 + rnd() * 0.28})`;
      g.fillRect(x, 0, 1 + rnd() * 5, len);
    }
    const grd = g.createRadialGradient(S / 2, S * 0.02, 2, S / 2, S * 0.06, S * 0.3);
    grd.addColorStop(0, "rgba(126,68,28,0.5)");
    grd.addColorStop(1, "rgba(120,64,26,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S * 0.4);
    for (let i = 0; i < 180; i++) {
      g.fillStyle = `rgba(${130 + rnd() * 40 | 0},${70 + rnd() * 25 | 0},30,${rnd() * 0.2})`;
      g.beginPath();
      g.arc(rnd() * S, rnd() * S * 0.7, rnd() * 2, 0, 6.2832);
      g.fill();
    }
  },

  // 3 — station stencil
  (g, S, rnd) => {
    stencilText(g, "MERIDIAN", S * 0.07, S * 0.42, S * 0.2, "rgba(226,220,204,0.72)", rnd, 1.06, S * 0.86);
    stencilText(g, "DEEP LISTENING STATION", S * 0.075, S * 0.6, S * 0.05, "rgba(214,208,192,0.55)", rnd, 1.2, S * 0.85);
    g.fillStyle = "rgba(220,214,198,0.5)";
    g.fillRect(S * 0.07, S * 0.68, S * 0.5, S * 0.012);
    wear(g, S, rnd, 0.55);
  },

  // 4 — no smoking (period notice)
  (g, S, rnd) => {
    g.strokeStyle = "rgba(214,206,188,0.6)";
    g.lineWidth = S * 0.012;
    g.strokeRect(S * 0.1, S * 0.22, S * 0.8, S * 0.56);
    stencilText(g, "NO", S * 0.14, S * 0.38, S * 0.15, "rgba(222,214,196,0.68)", rnd, 1.06, S * 0.7);
    stencilText(g, "SMOKING", S * 0.14, S * 0.52, S * 0.15, "rgba(222,214,196,0.68)", rnd, 1.06, S * 0.7);
    stencilText(g, "BY ORDER", S * 0.14, S * 0.67, S * 0.046, "rgba(208,200,182,0.5)", rnd, 1.25, S * 0.68);
    wear(g, S, rnd, 0.62);
  },

  // 5 — direction stencil
  (g, S, rnd) => {
    const c = "rgba(224,218,200,0.62)";
    stencilText(g, "SECTOR 4", S * 0.12, S * 0.35, S * 0.13, c, rnd, 1.06, S * 0.72);
    // arrow
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(S * 0.12, S * 0.66);
    g.lineTo(S * 0.62, S * 0.66);
    g.lineTo(S * 0.62, S * 0.58);
    g.lineTo(S * 0.84, S * 0.71);
    g.lineTo(S * 0.62, S * 0.84);
    g.lineTo(S * 0.62, S * 0.76);
    g.lineTo(S * 0.12, S * 0.76);
    g.closePath();
    g.fill();
    wear(g, S, rnd, 0.6);
  },

  // 6 — danger plate
  (g, S, rnd) => {
    g.fillStyle = "rgba(178,148,44,0.5)";
    g.fillRect(S * 0.08, S * 0.28, S * 0.84, S * 0.44);
    stencilText(g, "DANGER", S * 0.12, S * 0.43, S * 0.16, "rgba(24,22,18,0.66)", rnd, 1.06, S * 0.76);
    stencilText(g, "415 VOLT", S * 0.13, S * 0.6, S * 0.09, "rgba(24,22,18,0.6)", rnd, 1.06, S * 0.74);
    wear(g, S, rnd, 0.7);
  },

  // 7 — a note taped to the wall
  (g, S, rnd) => {
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate((rnd() - 0.5) * 0.06);
    const w = S * 0.52;
    const h = S * 0.68;
    g.fillStyle = "rgba(226,214,184,0.92)";
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = "rgba(206,192,158,0.55)";
    g.fillRect(-w / 2, -h / 2, w, h * 0.1);
    // ruled lines of "handwriting"
    g.strokeStyle = "rgba(44,38,30,0.55)";
    g.lineWidth = S * 0.004;
    for (let i = 0; i < 9; i++) {
      const y = -h * 0.28 + i * h * 0.075;
      const len = w * (0.42 + rnd() * 0.5);
      g.beginPath();
      g.moveTo(-w * 0.4, y);
      for (let x = -w * 0.4; x < -w * 0.4 + len; x += 6) {
        g.lineTo(x, y + Math.sin(x * 0.3 + i) * 1.6);
      }
      g.stroke();
    }
    // tape: two strips, yellowed, one lifting
    g.fillStyle = "rgba(214,200,150,0.5)";
    g.fillRect(-w / 2 - S * 0.06, -h / 2 - S * 0.02, S * 0.16, S * 0.05);
    g.fillRect(w / 2 - S * 0.1, -h / 2 - S * 0.02, S * 0.16, S * 0.05);
    g.restore();
    wear(g, S, rnd, 0.25);
  },

  // 8 — chalk tallies
  (g, S, rnd) => {
    g.strokeStyle = "rgba(216,212,198,0.5)";
    g.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const x0 = S * (0.12 + k * 0.2);
      const y0 = S * (0.32 + rnd() * 0.3);
      for (let i = 0; i < 4; i++) {
        g.lineWidth = 2 + rnd() * 2;
        g.beginPath();
        g.moveTo(x0 + i * S * 0.028, y0);
        g.lineTo(x0 + i * S * 0.028 + (rnd() - 0.5) * 6, y0 + S * (0.16 + rnd() * 0.1));
        g.stroke();
      }
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x0 - S * 0.01, y0 + S * 0.12);
      g.lineTo(x0 + S * 0.11, y0 + S * 0.05);
      g.stroke();
    }
  },

  // 9 — boot scuffs at kick height
  (g, S, rnd) => {
    for (let i = 0; i < 16; i++) {
      g.strokeStyle = `rgba(30,28,24,${0.1 + rnd() * 0.26})`;
      g.lineWidth = 3 + rnd() * 9;
      g.lineCap = "round";
      const x = S * (0.1 + rnd() * 0.8);
      const y = S * (0.35 + rnd() * 0.6);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + S * 0.1, y - S * 0.06, x + S * (0.1 + rnd() * 0.2), y + S * 0.03);
      g.stroke();
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(28,26,22,${rnd() * 0.2})`;
      g.beginPath();
      g.arc(rnd() * S, S * (0.4 + rnd() * 0.55), rnd() * 3, 0, 6.2832);
      g.fill();
    }
  },

  // 10 — a patch of newer paint over an old repair
  (g, S, rnd) => {
    g.fillStyle = "rgba(214,210,196,0.2)";
    raggedRect(g, S * 0.12, S * 0.14, S * 0.76, S * 0.72, rnd);
    g.strokeStyle = "rgba(178,172,156,0.2)";
    g.lineWidth = 5;
    g.strokeRect(S * 0.12, S * 0.14, S * 0.76, S * 0.72);
    // brush drag
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(226,222,208,${rnd() * 0.07})`;
      g.lineWidth = 2 + rnd() * 5;
      g.beginPath();
      const y = S * (0.15 + rnd() * 0.7);
      g.moveTo(S * (0.13 + rnd() * 0.1), y);
      g.lineTo(S * (0.7 + rnd() * 0.17), y + (rnd() - 0.5) * 10);
      g.stroke();
    }
  },

  // 11 — mould, mostly in corners and low on the wall
  (g, S, rnd) => {
    for (let c = 0; c < 5; c++) {
      const cx = rnd() * S;
      const cy = S * (0.45 + rnd() * 0.55);
      for (let i = 0; i < 700; i++) {
        const a = rnd() * 6.2832;
        const r = Math.pow(rnd(), 1.8) * S * 0.26;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.8;
        const k = 1 - r / (S * 0.26);
        g.fillStyle = `rgba(${28 + rnd() * 26 | 0},${30 + rnd() * 22 | 0},${22 + rnd() * 16 | 0},${k * 0.3})`;
        g.beginPath();
        g.arc(x, y, 0.8 + rnd() * 2.6, 0, 6.2832);
        g.fill();
      }
    }
  },

  // 12 — a torn corner of a schematic, taped up
  (g, S, rnd) => {
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate((rnd() - 0.5) * 0.05);
    const w = S * 0.66;
    const h = S * 0.5;
    g.fillStyle = "rgba(52,74,96,0.9)";
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = "rgba(216,226,236,0.55)";
    g.lineWidth = 1.4;
    g.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
    // a little circuit: rails, components, junctions
    for (let i = 0; i < 9; i++) {
      const y = -h / 2 + (i + 1) * (h / 10);
      g.beginPath();
      g.moveTo(-w / 2 + 10, y);
      g.lineTo(w / 2 - 10, y);
      g.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const x = -w / 2 + 14 + rnd() * (w - 28);
      const y = -h / 2 + 10 + rnd() * (h - 20);
      g.beginPath();
      g.arc(x, y, 3, 0, 6.2832);
      g.stroke();
    }
    g.fillStyle = "rgba(226,232,240,0.5)";
    g.font = `600 ${S * 0.028}px Arial`;
    g.fillText("MK-IV  SIGNAL PATH", -w / 2 + 12, h / 2 - 12);
    g.restore();
    g.fillStyle = "rgba(216,204,164,0.45)";
    g.fillRect(S * 0.2, S * 0.16, S * 0.14, S * 0.05);
    g.fillRect(S * 0.66, S * 0.16, S * 0.14, S * 0.05);
    wear(g, S, rnd, 0.2);
  },

  // 13 — typed standing order, curling
  (g, S, rnd) => {
    const w = S * 0.46;
    const h = S * 0.62;
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate((rnd() - 0.5) * 0.04);
    g.fillStyle = "rgba(222,212,190,0.9)";
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = "rgba(58,50,40,0.75)";
    g.font = `700 ${S * 0.038}px "Courier New", monospace`;
    g.fillText("STANDING ORDERS", -w / 2 + 10, -h / 2 + S * 0.06);
    g.strokeStyle = "rgba(58,50,40,0.5)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-w / 2 + 10, -h / 2 + S * 0.075);
    g.lineTo(w / 2 - 10, -h / 2 + S * 0.075);
    g.stroke();
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `rgba(58,50,40,${0.3 + rnd() * 0.2})`;
      const y = -h / 2 + S * 0.1 + i * S * 0.036;
      g.fillRect(-w / 2 + 10, y, (w - 20) * (0.4 + rnd() * 0.6), 2.4);
    }
    g.fillStyle = "rgba(120,40,30,0.55)";
    g.font = `700 ${S * 0.06}px "Courier New", monospace`;
    g.fillText("SEALED", w * 0.16, h * 0.3);
    g.restore();
    wear(g, S, rnd, 0.18);
  },

  // 14 — grease smear, low on the wall near plant
  (g, S, rnd) => {
    for (let i = 0; i < 26; i++) {
      const x = S * (0.15 + rnd() * 0.7);
      const y = S * (0.3 + rnd() * 0.6);
      const r = S * (0.04 + rnd() * 0.16);
      const grd = g.createRadialGradient(x, y, 1, x, y, r);
      grd.addColorStop(0, `rgba(24,22,18,${0.1 + rnd() * 0.16})`);
      grd.addColorStop(1, "rgba(24,22,18,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, 6.2832);
      g.fill();
    }
  },

  // 15 — worn hazard stripes
  (g, S, rnd) => {
    g.save();
    g.beginPath();
    g.rect(S * 0.04, S * 0.3, S * 0.92, S * 0.4);
    g.clip();
    g.fillStyle = "rgba(196,164,48,0.4)";
    g.fillRect(S * 0.04, S * 0.3, S * 0.92, S * 0.4);
    g.fillStyle = "rgba(26,24,20,0.5)";
    for (let i = -10; i < 24; i++) {
      g.beginPath();
      const x = S * 0.04 + i * S * 0.09;
      g.moveTo(x, S * 0.72);
      g.lineTo(x + S * 0.05, S * 0.72);
      g.lineTo(x + S * 0.05 + S * 0.4, S * 0.3);
      g.lineTo(x + S * 0.4, S * 0.3);
      g.closePath();
      g.fill();
    }
    g.restore();
    wear(g, S, rnd, 0.75);
  },
];

function buildAtlas(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = ATLAS;
  const g = c.getContext("2d")!;
  const rnd = mulberry32(19624);
  TILES.forEach((paint, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    g.save();
    g.translate(col * TILE, row * TILE);
    g.beginPath();
    g.rect(0, 0, TILE, TILE);
    g.clip();
    paint(g, TILE, rnd);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** world size of each kind of decal, in metres */
const SIZE: [number, number][] = [
  [2.4, 2.4], // water stain
  [1.6, 1.9], // drips
  [1.0, 1.6], // rust run
  [1.9, 0.9], // MERIDIAN
  [0.9, 0.9], // no smoking
  [1.5, 0.7], // sector arrow
  [0.7, 0.5], // danger plate
  [0.34, 0.44], // taped note
  [1.0, 0.8], // chalk
  [1.7, 0.9], // scuffs
  [1.8, 1.3], // paint patch
  [1.6, 1.4], // mould
  [0.7, 0.52], // schematic
  [0.4, 0.55], // standing orders
  [1.9, 1.4], // grease
  [1.3, 0.5], // hazard
];

export interface DecalOptions {
  /** point on the wall */
  at: THREE.Vector3;
  /** wall normal, pointing into the room */
  normal: THREE.Vector3;
  kind: number;
  /** metres, overrides the table */
  w?: number;
  h?: number;
  rot?: number;
}

/**
 * Stamp one decal. Returns a plane with UVs remapped into its atlas tile, so
 * every decal in the station shares one material.
 */
export function placeDecal(kit: Kit, mat: THREE.Material, o: DecalOptions): THREE.Mesh {
  const [tw, th] = SIZE[o.kind] ?? [1, 1];
  const w = o.w ?? tw;
  const h = o.h ?? th;
  const geo = new THREE.PlaneGeometry(w, h);

  const col = o.kind % 4;
  const row = Math.floor(o.kind / 4);
  const inset = 3 / ATLAS;
  const u0 = col / 4 + inset;
  const u1 = (col + 1) / 4 - inset;
  const v0 = 1 - (row + 1) / 4 + inset;
  const v1 = 1 - row / 4 - inset;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(o.at).addScaledVector(o.normal, 0.012);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), o.normal);
  mesh.quaternion.copy(q);
  if (o.rot) mesh.rotateZ(o.rot);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  kit.root.add(mesh);
  return mesh;
}

export function decalMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map: buildAtlas(),
    transparent: true,
    depthWrite: false,
    roughness: 0.92,
    metalness: 0,
    side: THREE.FrontSide,
  });
  m.name = "decalAtlas";
  return m;
}

/** Rooms worth decorating by raycast, with how many decals each gets. */
const DENSITY: Record<string, number> = {
  rotunda: 26,
  corr_n: 6,
  corr_e: 6,
  corr_s: 6,
  corr_w: 6,
  records: 18,
  anechoic: 8,
  machine: 20,
  darkroom: 12,
  dome: 6,
  stair: 4,
  landing: 3,
  tunnel_a: 4,
  tunnel_b: 6,
  tunnel_c: 5,
};

/**
 * Scatter decals across the station.
 *
 * Each attempt picks a point on the room's floor polygon, fires a horizontal
 * ray at a random bearing and lands a decal on the first tagged wall face it
 * meets. Kind is chosen by height band — scuffs and grease live low, stencils
 * and notices at chest height, water damage up top — which is what keeps the
 * result from looking like a stamp tool.
 */
export function scatterDecals(kit: Kit, mat: THREE.Material, zones: Zone[], seed = 7) {
  const rnd = mulberry32(seed);
  const ray = new THREE.Raycaster();
  ray.far = 9;
  kit.root.updateMatrixWorld(true);

  const targets: THREE.Object3D[] = [];
  kit.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.wall) targets.push(o);
  });
  if (!targets.length) return 0;

  let placed = 0;
  const normal = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const origin = new THREE.Vector3();

  for (const zone of zones) {
    const want = DENSITY[zone.id] ?? 0;
    if (!want) continue;

    // bounding box of the room polygon, for sampling candidates
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of zone.poly) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }

    let tries = 0;
    let got = 0;
    while (got < want && tries < want * 30) {
      tries++;
      const px = x0 + rnd() * (x1 - x0);
      const pz = z0 + rnd() * (z1 - z0);
      if (!pointInPoly(px, pz, zone.poly)) continue;

      const y = zone.floorY + 0.55 + rnd() * Math.min(2.3, zone.ceilY - zone.floorY - 1.1);
      const a = rnd() * Math.PI * 2;
      dir.set(Math.sin(a), 0, Math.cos(a)).normalize();
      origin.set(px, y, pz);
      ray.set(origin, dir);
      const hit = ray.intersectObjects(targets, false)[0];
      if (!hit || hit.distance < 1.3) continue;
      if (!hit.face) continue;

      normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (Math.abs(normal.y) > 0.35) continue; // walls only
      if (normal.dot(dir) > -0.2) continue; // must face the sampler

      const rel = y - zone.floorY;
      let kind: number;
      const r = rnd();
      if (rel < 1.15) {
        kind = r < 0.34 ? 9 : r < 0.6 ? 14 : r < 0.78 ? 11 : r < 0.9 ? 15 : 1;
      } else if (rel < 2.1) {
        kind =
          r < 0.16 ? 3 : r < 0.26 ? 4 : r < 0.34 ? 5 : r < 0.44 ? 7 : r < 0.52 ? 8 : r < 0.6 ? 12 : r < 0.68 ? 13 : r < 0.78 ? 10 : r < 0.9 ? 0 : 6;
      } else {
        kind = r < 0.34 ? 0 : r < 0.56 ? 2 : r < 0.72 ? 1 : r < 0.86 ? 11 : 10;
      }

      const [dw, dh] = SIZE[kind];
      placeDecal(kit, mat, {
        at: hit.point,
        normal,
        kind,
        w: dw * (0.8 + rnd() * 0.5),
        h: dh * (0.8 + rnd() * 0.5),
        rot: (rnd() - 0.5) * 0.12,
      });
      got++;
      placed++;
    }
  }
  return placed;
}
