import * as THREE from "three";
import type { Kit } from "../../core/kit";
import { drawSymbol, mulberry } from "../docs";
import type { Sym } from "../state";

/** Dynamic (un-merged) mesh, the building block of every interactive device. */
export function mesh(
  kit: Kit,
  geo: THREE.BufferGeometry,
  mat: THREE.Material | string,
  x = 0,
  y = 0,
  z = 0,
  ry = 0
): THREE.Mesh {
  const m = new THREE.Mesh(geo, typeof mat === "string" ? kit.m(mat) : mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.dynamic = true;
  kit.root.add(m);
  return m;
}

export function box(
  kit: Kit,
  w: number,
  h: number,
  d: number,
  mat: string,
  x = 0,
  y = 0,
  z = 0,
  ry = 0
): THREE.Mesh {
  return mesh(kit, new THREE.BoxGeometry(w, h, d), mat, x, y, z, ry);
}

export function cyl(
  kit: Kit,
  r: number,
  h: number,
  mat: string,
  x = 0,
  y = 0,
  z = 0,
  seg = 18,
  rot?: { x?: number; y?: number; z?: number }
): THREE.Mesh {
  const m = mesh(kit, new THREE.CylinderGeometry(r, r, h, seg), mat, x, y, z);
  if (rot?.x) m.rotation.x = rot.x;
  if (rot?.y) m.rotation.y = rot.y;
  if (rot?.z) m.rotation.z = rot.z;
  return m;
}

// -------------------------------------------------------------------- labels
export function canvasTex(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { transparent?: boolean } = {}
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  if (!opts.transparent) {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
  }
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** An engraved brass plate. Text is dark, plate is metal. */
export function brassPlate(
  kit: Kit,
  w: number,
  h: number,
  lines: string[],
  x: number,
  y: number,
  z: number,
  ry = 0
): THREE.Mesh {
  const tex = canvasTex(
    512,
    Math.max(64, Math.round((512 * h) / w)),
    (g, W, H) => {
      const rnd = mulberry(4711);
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#7d663c");
      grad.addColorStop(0.45, "#a98c52");
      grad.addColorStop(1, "#6d5734");
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 700; i++) {
        g.fillStyle = `rgba(40,30,14,${rnd() * 0.07})`;
        g.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
      }
      g.strokeStyle = "rgba(30,22,10,0.5)";
      g.lineWidth = 4;
      g.strokeRect(7, 7, W - 14, H - 14);
      g.fillStyle = "#251c0e";
      g.textAlign = "center";
      const n = lines.length;
      const longest = Math.max(1, ...lines.map((l) => l.length));
      const size = Math.max(14, Math.min(H / (n + 0.9), (W * 0.84) / (longest * 0.62)));
      g.font = `600 ${size}px "Courier New", monospace`;
      lines.forEach((l, i) => {
        g.fillText(l, W / 2, H / 2 + (i - (n - 1) / 2) * size * 1.35 + size * 0.34);
      });
      g.fillStyle = "rgba(255,240,200,0.14)";
      g.fillRect(0, 0, W, H * 0.42);
    }
  );
  const face = mesh(kit, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.45,
    metalness: 0.7,
  }), x, y, z, ry);
  face.castShadow = false;
  return face;
}

/** A paper label or painted sign. */
export function paperLabel(
  kit: Kit,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, W: number, H: number) => void,
  x: number,
  y: number,
  z: number,
  ry = 0,
  emissive = false
): THREE.Mesh {
  const px = 512;
  const tex = canvasTex(px, Math.max(32, Math.round((px * h) / w)), draw, { transparent: true });
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    roughness: 0.85,
    depthWrite: false,
  });
  if (emissive) {
    mat.emissiveMap = tex;
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 1.1;
  }
  const m = mesh(kit, new THREE.PlaneGeometry(w, h), mat, x, y, z, ry);
  m.castShadow = false;
  return m;
}

/**
 * Brass channel token: a cast disc stamped with its symbol and the figure of
 * its watch. The face is the only place the two are shown together.
 */
export function tokenFace(
  kit: Kit,
  sym: Sym,
  digit: string,
  x: number,
  y: number,
  z: number,
  ry = 0
): THREE.Mesh {
  const tex = canvasTex(160, 160, (g, W, H) => {
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#7d6636");
    grad.addColorStop(0.42, "#bb9d5f");
    grad.addColorStop(0.75, "#93783f");
    grad.addColorStop(1, "#6d582c");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    const rnd = mulberry(1207);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(40,28,10,${rnd() * 0.08})`;
      g.fillRect(rnd() * W, rnd() * H, 2, 2);
    }
    g.strokeStyle = "rgba(38,26,8,0.55)";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(W / 2, H / 2, W * 0.44, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.arc(W / 2, H / 2, W * 0.36, 0, Math.PI * 2);
    g.stroke();
    drawSymbol(g, sym, W / 2, H * 0.4, W * 0.15, "#2b2009");
    g.fillStyle = "#2b2009";
    g.font = `600 ${Math.round(W * 0.26)}px "Courier New", monospace`;
    g.textAlign = "center";
    g.fillText(digit, W / 2, H * 0.86);
  });
  const m = mesh(
    kit,
    new THREE.CircleGeometry(0.055, 22),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.44, metalness: 0.5 }),
    x,
    y,
    z,
    ry
  );
  m.castShadow = false;
  return m;
}

/** Token face plus a cast rim, as one object you can move around. */
export function token(kit: Kit, sym: Sym, digit: string): THREE.Group {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.008, 8, 22), kit.m("brassDark"));
  rim.castShadow = true;
  g.add(rim);
  const face = tokenFace(kit, sym, digit, 0, 0, 0.006);
  face.parent?.remove(face);
  g.add(face);
  return g;
}

export function typed(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  lines: string[],
  opts: { size?: number; color?: string; align?: CanvasTextAlign; x?: number; y?: number } = {}
) {
  const size = opts.size ?? 22;
  g.textAlign = opts.align ?? "left";
  g.fillStyle = opts.color ?? "#e9e3d2";
  g.font = `${size}px "Courier New", monospace`;
  let y = opts.y ?? size * 1.4;
  for (const l of lines) {
    g.fillText(l, opts.x ?? 8, y);
    y += size * 1.3;
  }
}
