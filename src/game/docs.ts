/**
 * Document art.
 *
 * Every readable object in MERIDIAN is a real sheet: rendered to a canvas once,
 * then shown full screen in the inspect overlay. No HTML "notes" floating in
 * the fiction — the paper looks like paper because it is drawn like paper.
 */

export type Sym = "cross" | "triangle" | "wave" | "star";

const PAPER = "#e6ddc6";

export function paperDoc(opts: {
  heading: string;
  sub?: string;
  lines: string[];
  footer?: string;
  stamp?: { text: string; color?: string; rot?: number; x?: number; y?: number };
  ruled?: boolean;
  w?: number;
  h?: number;
}): string {
  const W = opts.w ?? 780;
  const H = opts.h ?? 1020;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  // ---- paper
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  const rnd = mulberry(9137);
  for (let i = 0; i < 2600; i++) {
    const a = rnd() * 0.05;
    g.fillStyle = rnd() > 0.5 ? `rgba(120,96,60,${a})` : `rgba(255,250,235,${a})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // foxing
  for (let i = 0; i < 26; i++) {
    const r = 3 + rnd() * 26;
    const grd = g.createRadialGradient(rnd() * W, rnd() * H, 0, 0, 0, 1);
    void grd;
    g.fillStyle = `rgba(140,104,58,${0.02 + rnd() * 0.05})`;
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2);
    g.fill();
  }
  // edge darkening
  const edge = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.78);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(92,66,34,0.3)");
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);

  if (opts.ruled) {
    g.strokeStyle = "rgba(96,108,128,0.22)";
    g.lineWidth = 1;
    for (let y = 300; y < H - 90; y += 34) {
      g.beginPath();
      g.moveTo(70, y);
      g.lineTo(W - 70, y);
      g.stroke();
    }
    g.strokeStyle = "rgba(150,60,60,0.25)";
    g.beginPath();
    g.moveTo(120, 250);
    g.lineTo(120, H - 90);
    g.stroke();
  }

  let y = 96;
  g.textAlign = "center";
  g.fillStyle = "#2a2418";
  g.font = '600 30px "Courier New", monospace';
  g.fillText(opts.heading.toUpperCase(), W / 2, y);
  y += 30;
  if (opts.sub) {
    g.font = '15px "Courier New", monospace';
    g.fillStyle = "rgba(42,36,24,0.62)";
    g.fillText(opts.sub.toUpperCase(), W / 2, y);
  }
  y += 26;
  g.strokeStyle = "rgba(42,36,24,0.35)";
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(78, y);
  g.lineTo(W - 78, y);
  g.stroke();
  y += 46;

  g.textAlign = "left";
  for (const raw of opts.lines) {
    if (raw === "") {
      y += 18;
      continue;
    }
    if (raw === "--") {
      g.strokeStyle = "rgba(42,36,24,0.28)";
      g.beginPath();
      g.moveTo(78, y - 6);
      g.lineTo(W - 78, y - 6);
      g.stroke();
      y += 20;
      continue;
    }
    if (raw.startsWith("@sym")) {
      const sym = raw.split(/\s+/)[1] as Sym;
      drawSymbol(g, sym, W / 2, y + 26, 26, "#2a2418");
      y += 76;
      continue;
    }
    if (raw.startsWith("@center ")) {
      g.textAlign = "center";
      g.fillStyle = "#2a2418";
      g.font = '600 26px "Courier New", monospace';
      g.fillText(raw.slice(8), W / 2, y);
      g.textAlign = "left";
      y += 44;
      continue;
    }
    const heading = raw.startsWith("## ");
    const mono = raw.startsWith("# ");
    const text = heading ? raw.slice(3) : mono ? raw.slice(2) : raw;
    g.fillStyle = heading ? "#241f14" : "rgba(34,29,20,0.93)";
    g.font = heading
      ? '600 17px "Courier New", monospace'
      : mono
        ? '19px "Courier New", monospace'
        : '18px "Courier New", monospace';
    const indent = heading ? 78 : 86;
    const maxW = W - indent - 82;
    for (const line of wrap(g, text, maxW)) {
      g.fillText(line, indent, y);
      y += heading ? 26 : 28;
    }
    if (heading) y += 4;
  }

  if (opts.footer) {
    g.fillStyle = "rgba(42,36,24,0.5)";
    g.font = '13px "Courier New", monospace';
    g.textAlign = "center";
    g.fillText(opts.footer, W / 2, H - 46);
  }

  if (opts.stamp) {
    const st = opts.stamp;
    g.save();
    g.translate(st.x ?? W - 210, st.y ?? H - 150);
    g.rotate(((st.rot ?? -12) * Math.PI) / 180);
    g.strokeStyle = st.color ?? "rgba(150,42,30,0.72)";
    g.lineWidth = 3;
    const pad = 12;
    g.font = '600 22px "Courier New", monospace';
    const tw = g.measureText(st.text).width;
    g.strokeRect(-tw / 2 - pad, -26, tw + pad * 2, 46);
    g.fillStyle = st.color ?? "rgba(150,42,30,0.72)";
    g.textAlign = "center";
    g.fillText(st.text, 0, 6);
    g.restore();
  }

  return c.toDataURL("image/png");
}

/** A darkroom print: silver-gelatin, soft edges, grain, chalk annotation. */
export function photoPrint(opts: {
  caption?: string;
  chalk?: string[];
  seed?: number;
  w?: number;
  h?: number;
}): string {
  const W = opts.w ?? 760;
  const H = opts.h ?? 560;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const rnd = mulberry(opts.seed ?? 4242);

  g.fillStyle = "#e7e4dd";
  g.fillRect(0, 0, W, H);
  // print area with a white border, like a real enlargement
  const m = 34;
  const img = g.createLinearGradient(0, m, 0, H - m);
  img.addColorStop(0, "#2b2b2c");
  img.addColorStop(0.5, "#4a4a48");
  img.addColorStop(1, "#15161a");
  g.fillStyle = img;
  g.fillRect(m, m, W - m * 2, H - m * 2);

  // suggestion of a wall + a door outline
  g.strokeStyle = "rgba(220,220,210,0.16)";
  g.lineWidth = 3;
  g.strokeRect(W * 0.3, H * 0.22, W * 0.4, H * 0.66);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(W * 0.3, H * 0.22, W * 0.4, H * 0.66);

  // grain + soft vignette
  for (let i = 0; i < 9000; i++) {
    const v = rnd();
    g.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 245 : 0},${rnd() * 0.09})`;
    g.fillRect(m + rnd() * (W - m * 2), m + rnd() * (H - m * 2), 1.4, 1.4);
  }
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.8);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.62)");
  g.fillStyle = vig;
  g.fillRect(m, m, W - m * 2, H - m * 2);

  if (opts.chalk) {
    g.save();
    g.translate(W * 0.5, H * 0.56);
    g.rotate(-0.04);
    g.fillStyle = "rgba(246,242,228,0.9)";
    g.textAlign = "center";
    g.font = '600 54px "Courier New", monospace';
    opts.chalk.forEach((line, i) => {
      g.fillText(line, 0, i * 62);
    });
    g.restore();
  }

  if (opts.caption) {
    g.fillStyle = "rgba(40,34,26,0.62)";
    g.font = '15px "Courier New", monospace';
    g.textAlign = "center";
    g.fillText(opts.caption, W / 2, H - 10);
  }
  return c.toDataURL("image/png");
}

// ------------------------------------------------------------------ helpers
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > maxW && line) {
      out.push(line);
      line = w;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

export function drawSymbol(
  g: CanvasRenderingContext2D,
  sym: Sym,
  x: number,
  y: number,
  r: number,
  color: string
) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = Math.max(2, r * 0.13);
  g.beginPath();
  if (sym === "cross") {
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.moveTo(-r * 0.66, 0);
    g.lineTo(r * 0.66, 0);
    g.moveTo(0, -r * 0.66);
    g.lineTo(0, r * 0.66);
  } else if (sym === "triangle") {
    g.moveTo(0, -r);
    g.lineTo(r * 0.92, r * 0.72);
    g.lineTo(-r * 0.92, r * 0.72);
    g.closePath();
  } else if (sym === "wave") {
    g.moveTo(-r, r * 0.2);
    g.bezierCurveTo(-r * 0.4, -r * 0.9, r * 0.1, r * 1.1, r, -r * 0.2);
    g.moveTo(-r, r * 0.55);
    g.bezierCurveTo(-r * 0.4, -r * 0.55, r * 0.1, r * 1.45, r, r * 0.15);
  } else {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const rr = i % 2 ? r * 0.42 : r;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  }
  g.stroke();
  g.restore();
}

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
