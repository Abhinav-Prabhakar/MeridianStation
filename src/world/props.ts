import * as THREE from "three";
import { Kit } from "../core/kit";

/** Tiny local-space builder so props can be authored in their own coordinates. */
let shadowTex: THREE.Texture | null = null;
function getShadowTex(): THREE.Texture {
  if (shadowTex) return shadowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grd.addColorStop(0, "rgba(0,0,0,0.92)");
  grd.addColorStop(0.42, "rgba(0,0,0,0.42)");
  grd.addColorStop(0.75, "rgba(0,0,0,0.12)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  shadowTex = t;
  return t;
}

let shadowMat: THREE.Material | null = null;
function getShadowMat(): THREE.Material {
  if (shadowMat) return shadowMat;
  shadowMat = new THREE.MeshBasicMaterial({
    map: getShadowTex(),
    color: 0x000000,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  return shadowMat;
}

export class PB {
  g = new THREE.Group();
  kit: Kit;
  constructor(kit: Kit, x = 0, y = 0, z = 0, rot = 0) {
    this.kit = kit;
    this.g.position.set(x, y, z);
    this.g.rotation.y = rot;
    kit.root.add(this.g);
  }
  b(
    w: number,
    h: number,
    d: number,
    mat: string,
    x = 0,
    y = 0,
    z = 0,
    ry = 0,
    uv = 1
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.kit.m(mat));
    setBoxUV(mesh.geometry, w, h, d, uv);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.g.add(mesh);
    return mesh;
  }
  c(
    rt: number,
    rb: number,
    h: number,
    mat: string,
    x = 0,
    y = 0,
    z = 0,
    seg = 14,
    rot?: { x?: number; y?: number; z?: number }
  ) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), this.kit.m(mat));
    mesh.position.set(x, y, z);
    if (rot?.x) mesh.rotation.x = rot.x;
    if (rot?.y) mesh.rotation.y = rot.y;
    if (rot?.z) mesh.rotation.z = rot.z;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.g.add(mesh);
    return mesh;
  }
  s(r: number, mat: string, x = 0, y = 0, z = 0, seg = 12) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg * 0.66), this.kit.m(mat));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.g.add(mesh);
    return mesh;
  }
  /** Soft contact shadow on the floor beneath a prop. */
  shadow(rx: number, rz = rx, y = 0.006, opacity = 0.82) {
    const g = new THREE.PlaneGeometry(rx * 2, rz * 2);
    const m = new THREE.Mesh(g, getShadowMat());
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.renderOrder = 1;
    m.userData.noShadow = true;
    this.g.add(m);
    void opacity;
    return m;
  }

  t(r: number, tube: number, mat: string, x = 0, y = 0, z = 0, rx = Math.PI / 2) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 24), this.kit.m(mat));
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    this.g.add(mesh);
    return mesh;
  }
}

export function setBoxUV(g: THREE.BoxGeometry, w: number, h: number, d: number, s = 1) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    let su = 1;
    let sv = 1;
    if (i < 8) {
      su = d / s;
      sv = h / s;
    } else if (i < 16) {
      su = w / s;
      sv = d / s;
    } else {
      su = w / s;
      sv = h / s;
    }
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
}

// ------------------------------------------------------------------ table
export function table(kit: Kit, x: number, z: number, w: number, d: number, h = 0.76, rot = 0, mat = "wood") {
  const p = new PB(kit, x, 0, z, rot);
  p.b(w, 0.05, d, mat, 0, h, 0, 0, 1.4);
  p.b(w - 0.1, 0.05, d - 0.1, mat, 0, h - 0.09, 0, 0, 1.4);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      p.b(0.06, h - 0.05, 0.06, mat, (sx * (w - 0.16)) / 2, (h - 0.05) / 2, (sz * (d - 0.16)) / 2);
  p.shadow(w * 0.62, d * 0.62);
  return p.g;
}

// ------------------------------------------------------------------ chair
export function chair(kit: Kit, x: number, z: number, rot = 0, mat = "leather") {
  // institutional stacking chair: welded tube frame, vinyl pad, plywood shell
  const p = new PB(kit, x, 0, z, rot);
  p.b(0.43, 0.07, 0.42, "wood", 0, 0.44, 0, 0, 1.2);
  p.b(0.37, 0.045, 0.36, mat, 0, 0.48, 0.01, 0, 1.2);
  p.b(0.4, 0.42, 0.03, "wood", 0, 0.72, -0.2, 0, 1.2);
  p.b(0.34, 0.34, 0.035, mat, 0, 0.72, -0.175, 0, 1);
  for (const sx of [-1, 1]) {
    p.b(0.028, 0.44, 0.028, "steelDark", sx * 0.19, 0.22, -0.16);
    p.b(0.028, 0.44, 0.028, "steelDark", sx * 0.19, 0.22, 0.16);
    p.b(0.028, 0.028, 0.34, "steelDark", sx * 0.19, 0.05, 0);
  }
  // the welded back hoop
  p.b(0.41, 0.028, 0.028, "steelDark", 0, 0.93, -0.2);
  p.shadow(0.34, 0.34);
  return p.g;
}

// --------------------------------------------------------------- cabinet
export function cabinet(
  kit: Kit,
  x: number,
  z: number,
  rot = 0,
  w = 0.62,
  h = 1.32,
  d = 0.62,
  drawers = 4
) {
  const p = new PB(kit, x, 0, z, rot);
  p.b(w, h, d, "steelDark", 0, h / 2, 0, 0, 1.2);
  const dh = (h - 0.16) / drawers;
  for (let i = 0; i < drawers; i++) {
    const y = 0.1 + dh * (i + 0.5);
    p.b(w - 0.06, dh - 0.03, 0.03, "steelPale", 0, y, d / 2 + 0.012, 0, 1.2);
    p.b(0.14, 0.025, 0.035, "steel", 0, y + dh * 0.28, d / 2 + 0.035);
    // label holder
    p.b(0.16, 0.05, 0.006, "paper", 0, y + 0.02, d / 2 + 0.03);
  }
  p.shadow(w * 0.62, d * 0.62);
  kit.blockers.push({
    minX: x - w / 2 - 0.02,
    maxX: x + w / 2 + 0.02,
    minZ: z - d / 2 - 0.02,
    maxZ: z + d / 2 + 0.02,
  });
  return p.g;
}

// ---------------------------------------------------------- card catalog
export function cardCatalog(kit: Kit, x: number, z: number, rot = 0) {
  const p = new PB(kit, x, 0, z, rot);
  const w = 1.9;
  const h = 2.15;
  const d = 0.72;
  p.b(w, h, d, "wood", 0, h / 2, 0, 0, 1.6);
  p.b(w + 0.12, 0.1, d + 0.1, "wood", 0, h + 0.05, 0, 0, 1.6);
  p.b(w + 0.1, 0.16, d + 0.08, "wood", 0, 0.08, 0, 0, 1.6);
  const cols = 5;
  const rows = 6;
  const cw = (w - 0.1) / cols;
  const ch = (h - 0.35) / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const dx = -w / 2 + 0.05 + cw * (i + 0.5);
      const dy = 0.18 + ch * (j + 0.5);
      p.b(cw - 0.03, ch - 0.035, 0.02, "wood", dx, dy, d / 2 - 0.005, 0, 0.6);
      p.b(cw * 0.28, 0.028, 0.024, "brassDark", dx, dy, d / 2 + 0.01);
      p.b(cw * 0.42, 0.05, 0.004, "paper", dx, dy - ch * 0.3, d / 2 + 0.016);
      // gap shadow line
      p.b(cw - 0.02, 0.008, 0.03, "black", dx, dy - ch / 2 + 0.012, d / 2 - 0.01);
    }
  }
  kit.blockers.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  return p.g;
}

// -------------------------------------------------------------- shelving
export function shelf(
  kit: Kit,
  x: number,
  z: number,
  rot = 0,
  w = 1.2,
  h = 1.9,
  d = 0.34,
  levels = 5
) {
  const p = new PB(kit, x, 0, z, rot);
  for (const sx of [-1, 1]) p.b(0.04, h, d, "steelDark", (sx * (w - 0.04)) / 2, h / 2, 0);
  for (let i = 0; i < levels; i++) {
    const y = 0.12 + ((h - 0.15) / (levels - 1)) * i;
    p.b(w, 0.03, d, "steelDark", 0, y, 0, 0, 1);
  }
  p.b(w, 0.02, d, "steelDark", 0, h, 0, 0, 1);
  // stuff on shelves
  let seed = 1;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < levels - 1; i++) {
    const y = 0.12 + ((h - 0.15) / (levels - 1)) * i + 0.03;
    let cx = -w / 2 + 0.08;
    while (cx < w / 2 - 0.12) {
      const bw = 0.05 + rnd() * 0.09;
      const bh = 0.16 + rnd() * 0.14;
      if (rnd() > 0.35) {
        p.b(bw, bh, d * 0.62, rnd() > 0.7 ? "paper" : rnd() > 0.4 ? "wood" : "leather", cx, y + bh / 2, 0, 0, 0.4);
      }
      cx += bw + 0.006;
    }
  }
  p.shadow(w * 0.6, d * 0.7);
  kit.blockers.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  return p.g;
}

// ----------------------------------------------------------------- crate
export function crate(kit: Kit, x: number, y: number, z: number, s = 0.6, rot = 0) {
  const p = new PB(kit, x, y, z, rot);
  p.b(s, s, s, "woodDark", 0, s / 2, 0, 0, 0.8);
  for (const sy of [0.12, 0.88]) {
    p.b(s + 0.01, 0.06, s + 0.01, "woodDark", 0, s * sy, 0, 0, 0.8);
  }
  p.b(s * 0.8, 0.02, 0.1, "rustDark", 0, s + 0.005, 0);
  p.shadow(s * 0.6, s * 0.6, -y + 0.006);
  return p.g;
}

// ------------------------------------------------------------------ drum
export function drum(kit: Kit, x: number, z: number, mat = "rust") {
  const p = new PB(kit, x, 0, z, 0);
  p.c(0.29, 0.29, 0.88, mat, 0, 0.44, 0, 18);
  p.t(0.3, 0.022, "steelDark", 0, 0.26, 0);
  p.t(0.3, 0.022, "steelDark", 0, 0.62, 0);
  p.c(0.28, 0.28, 0.02, "steelDark", 0, 0.885, 0, 18);
  p.c(0.05, 0.05, 0.04, "brassDark", 0.14, 0.9, 0, 10);
  p.shadow(0.42, 0.42);
  kit.blockers.push({ minX: x - 0.32, maxX: x + 0.32, minZ: z - 0.32, maxZ: z + 0.32 });
  return p.g;
}

// ------------------------------------------------------------------ valve
export function valveWheel(kit: Kit, x: number, y: number, z: number, axis: "x" | "y" | "z", r = 0.22) {
  const p = new PB(kit, x, y, z, 0);
  const rot = axis === "y" ? { x: Math.PI / 2 } : axis === "x" ? { z: Math.PI / 2 } : { x: 0 };
  p.t(r, 0.022, "rustDark", 0, 0, 0, rot.x ?? 0);
  if (axis === "x") p.g.children[p.g.children.length - 1].rotation.set(0, Math.PI / 2, 0);
  // spokes
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    const sp = p.b(0.02, r * 2, 0.02, "rustDark", 0, 0, 0);
    sp.rotation.set(0, 0, a);
    if (axis === "x") sp.rotation.set(0, Math.PI / 2, a);
    if (axis === "y") sp.rotation.set(Math.PI / 2, 0, a);
  }
  p.c(0.05, 0.05, 0.12, "steelDark", 0, 0, 0, 10, rot);
  return p.g;
}

// ------------------------------------------------------------------ gauge
export function gauge(kit: Kit, x: number, y: number, z: number, rot = 0, r = 0.11) {
  const p = new PB(kit, x, y, z, rot);
  p.c(r, r, 0.06, "brassDark", 0, 0, 0, 18, { x: Math.PI / 2 });
  p.c(r * 0.86, r * 0.86, 0.02, "paper", 0, 0, 0.035, 18, { x: Math.PI / 2 });
  const needle = p.b(0.006, r * 0.7, 0.008, "black", 0, r * 0.18, 0.05);
  needle.rotation.z = -0.6;
  p.c(0.012, 0.012, 0.02, "brass", 0, 0, 0.055, 8, { x: Math.PI / 2 });
  return p.g;
}

// ----------------------------------------------------------------- fixture
export function pendant(kit: Kit, x: number, y: number, z: number, shadeR = 0.28) {
  const p = new PB(kit, x, 0, z, 0);
  p.c(0.007, 0.007, Math.max(0.05, 5.5 - y), "black", 0, (5.5 + y) / 2, 0, 6);
  p.b(0.14, 0.06, 0.14, "bakelite", 0, y + 0.03, 0);
  const shadeMat = kit.m("steelPale").clone();
  shadeMat.side = THREE.DoubleSide;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(shadeR, 0.22, 28, 1, true), shadeMat);
  shade.position.set(0, y - 0.14, 0);
  shade.castShadow = false;
  shade.castShadow = true;
  p.g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), kit.m("bulb"));
  bulb.position.set(0, y - 0.2, 0);
  p.g.add(bulb);
  return p.g;
}

export function bulkhead(kit: Kit, x: number, y: number, z: number, ry: number) {
  const p = new PB(kit, x, y, z, ry);
  p.b(0.26, 0.34, 0.14, "steelDark", 0, 0, 0);
  p.b(0.2, 0.26, 0.02, "bulb", 0, 0, 0.075);
  for (let i = 0; i < 5; i++) p.b(0.24, 0.012, 0.05, "steelPale", 0, -0.14 + i * 0.07, 0.09);
  return p.g;
}

export function troffer(kit: Kit, x: number, y: number, z: number, rot = 0, len = 1.2) {
  const p = new PB(kit, x, y, z, rot);
  p.b(len, 0.1, 0.3, "steelPale", 0, 0, 0);
  p.b(len - 0.08, 0.02, 0.24, "bulb", 0, -0.055, 0);
  return p.g;
}

// --------------------------------------------------------------- others
export function bucket(kit: Kit, x: number, z: number) {
  const p = new PB(kit, x, 0, z, 0);
  p.c(0.14, 0.17, 0.3, "steelPale", 0, 0.15, 0, 16);
  p.t(0.17, 0.012, "steelPale", 0, 0.3, 0);
  return p.g;
}

export function extinguisher(kit: Kit, x: number, y: number, z: number) {
  const p = new PB(kit, x, y, z, 0);
  p.c(0.09, 0.09, 0.44, "rust", 0, 0, 0, 14);
  p.c(0.04, 0.04, 0.1, "steelDark", 0, 0.26, 0, 10);
  p.b(0.03, 0.14, 0.03, "black", 0.06, 0.22, 0);
  p.b(0.05, 0.03, 0.03, "brass", -0.05, 0.24, 0);
  return p.g;
}

export function papers(kit: Kit, x: number, y: number, z: number, n = 5, spread = 0.2, rot = 0) {
  const p = new PB(kit, x, y, z, rot);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < n; i++) {
    const m = p.b(0.21, 0.003, 0.297, "paper", (rnd() - 0.5) * spread, 0.002 + i * 0.003, (rnd() - 0.5) * spread, (rnd() - 0.5) * 0.9, 0.3);
    m.castShadow = false;
  }
  return p.g;
}

export function ladder(kit: Kit, x: number, z: number, h: number, rot = 0) {
  const p = new PB(kit, x, 0, z, rot);
  for (const sx of [-1, 1]) p.b(0.05, h, 0.05, "wood", sx * 0.22, h / 2, 0);
  for (let i = 1; i < Math.floor(h / 0.3); i++) p.b(0.44, 0.035, 0.04, "wood", 0, i * 0.3, 0);
  return p.g;
}

export function hoseReel(kit: Kit, x: number, y: number, z: number, rot = 0) {
  const p = new PB(kit, x, y, z, rot);
  p.c(0.3, 0.3, 0.28, "rustDark", 0, 0, 0, 18, { z: Math.PI / 2 });
  for (let i = 0; i < 6; i++) p.t(0.29, 0.035, "rubber", 0, 0, -0.12 + i * 0.05, Math.PI / 2);
  p.c(0.04, 0.04, 0.5, "brass", 0.1, 0.34, 0, 8, { z: 0.4 });
  return p.g;
}

export function noticeBoard(kit: Kit, x: number, y: number, z: number, rot = 0) {
  const p = new PB(kit, x, y, z, rot);
  p.b(1.5, 1.0, 0.05, "wood", 0, 0, 0);
  p.b(1.4, 0.9, 0.02, "felt", 0, 0, 0.04);
  let seed = 3;
  const rnd = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 11; i++) {
    const w = 0.1 + rnd() * 0.12;
    const h = 0.13 + rnd() * 0.1;
    p.b(w, h, 0.004, "paper", (rnd() - 0.5) * 1.15, (rnd() - 0.5) * 0.68, 0.056, (rnd() - 0.5) * 0.14, 0.28);
    p.c(0.008, 0.008, 0.012, "brass", (rnd() - 0.5) * 1.1, 0.4, 0.062, 6);
  }
  return p.g;
}
