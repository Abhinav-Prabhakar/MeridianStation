import * as THREE from "three";
import type { MatLib } from "./materials";

/** Axis-aligned blocker used by the player's capsule sweep. */
export interface Blocker {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** optional: only blocks if player feet are below this */
  top?: number;
}

/**
 * Geometry kit.
 *
 * All UVs are authored in metres so a 2.2 m texture tile is 2.2 m on every
 * surface regardless of object size — the single most important rule for a
 * believable interior.
 */
export class Kit {
  mat: MatLib;
  root: THREE.Group;
  blockers: Blocker[] = [];

  constructor(mat: MatLib, root: THREE.Group) {
    this.mat = mat;
    this.root = root;
  }

  m(name: string): THREE.MeshStandardMaterial {
    const mm = this.mat[name];
    if (!mm) throw new Error(`unknown material ${name}`);
    return mm;
  }

  /** Box with UVs measured in metres. */
  box(
    w: number,
    h: number,
    d: number,
    matName: string,
    uv = 1,
    opts: { x?: number; y?: number; z?: number; ry?: number; rx?: number; rz?: number; shadow?: boolean } = {}
  ): THREE.Mesh {
    const g = new THREE.BoxGeometry(w, h, d);
    const uvAttr = g.attributes.uv as THREE.BufferAttribute;
    const s = uv;
    for (let i = 0; i < uvAttr.count; i++) {
      let su = 1;
      let sv = 1;
      if (i < 4) {
        su = d / s;
        sv = h / s;
      } else if (i < 8) {
        su = d / s;
        sv = h / s;
      } else if (i < 12) {
        su = w / s;
        sv = d / s;
      } else if (i < 16) {
        su = w / s;
        sv = d / s;
      } else {
        su = w / s;
        sv = h / s;
      }
      uvAttr.setXY(i, uvAttr.getX(i) * su, uvAttr.getY(i) * sv);
    }
    uvAttr.needsUpdate = true;
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.m(matName));
    mesh.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    if (opts.ry) mesh.rotation.y = opts.ry;
    if (opts.rx) mesh.rotation.x = opts.rx;
    if (opts.rz) mesh.rotation.z = opts.rz;
    mesh.castShadow = opts.shadow ?? true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /** Box that also blocks the player (axis aligned). */
  solidBox(
    w: number,
    h: number,
    d: number,
    matName: string,
    x: number,
    y: number,
    z: number,
    uv = 1,
    ry = 0
  ): THREE.Mesh {
    const m = this.box(w, h, d, matName, uv, { x, y, z, ry });
    if (!ry) {
      this.blockers.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
      });
    } else {
      const r = Math.max(w, d) / 2;
      this.blockers.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
    }
    return m;
  }

  cyl(
    rTop: number,
    rBot: number,
    h: number,
    matName: string,
    x: number,
    y: number,
    z: number,
    seg = 16,
    rot?: { x?: number; y?: number; z?: number }
  ): THREE.Mesh {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    const mesh = new THREE.Mesh(g, this.m(matName));
    mesh.position.set(x, y, z);
    if (rot?.x) mesh.rotation.x = rot.x;
    if (rot?.y) mesh.rotation.y = rot.y;
    if (rot?.z) mesh.rotation.z = rot.z;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /** Pipe run through a list of [x,y,z] points, with sphere elbows. */
  pipe(points: [number, number, number][], radius: number, matName: string, seg = 12) {
    const mat = this.m(matName);
    for (let i = 0; i < points.length - 1; i++) {
      const a = new THREE.Vector3(...points[i]);
      const b = new THREE.Vector3(...points[i + 1]);
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 1e-4) continue;
      const g = new THREE.CylinderGeometry(radius, radius, len, seg, 1, true);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    for (let i = 1; i < points.length - 1; i++) {
      const g = new THREE.SphereGeometry(radius * 1.06, seg, seg * 0.6);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(...points[i]);
      mesh.castShadow = true;
      this.root.add(mesh);
    }
  }

  /** Horizontal slab from a 2D polygon (x,z). Used for floors. */
  floor(points: number[][], y: number, matName: string, uv = 1): THREE.Mesh {
    const g = this.flatShape(points, false);
    this.projectUV(g, uv);
    const mesh = new THREE.Mesh(g, this.m(matName));
    mesh.position.y = y;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /** Ceiling slab from the same polygon, facing down. */
  ceiling(points: number[][], y: number, matName: string, uv = 1): THREE.Mesh {
    const g = this.flatShape(points, true);
    this.projectUV(g, uv);
    const mesh = new THREE.Mesh(g, this.m(matName));
    mesh.position.y = y;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  private flatShape(points: number[][], flip: boolean): THREE.BufferGeometry {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    if (flip) {
      const idx = g.index!;
      const a = idx.array as Uint16Array | Uint32Array;
      for (let i = 0; i < a.length; i += 3) {
        const t = a[i + 1];
        a[i + 1] = a[i + 2];
        a[i + 2] = t;
      }
      idx.needsUpdate = true;
      g.computeVertexNormals();
    }
    return g;
  }

  private projectUV(g: THREE.BufferGeometry, scale: number) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / scale;
      uv[i * 2 + 1] = pos.getZ(i) / scale;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }

  /**
   * A wall run from A to B with optional doorway gaps.
   * `gaps` are [t0,t1] fractions or metres along the run.
   */
  wall(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    opts: {
      y0?: number;
      height: number;
      thickness?: number;
      mat?: string;
      uv?: number;
      /** openings in metres from A: [start, end, sillHeight, headHeight] */
      gaps?: [number, number, number?, number?][];
      cap?: boolean;
      collide?: boolean;
    }
  ): void {
    const y0 = opts.y0 ?? 0;
    const t = opts.thickness ?? 0.24;
    const matName = opts.mat ?? "plaster";
    const uv = opts.uv ?? 2.6;
    const dx = bx - ax;
    const dz = bz - az;
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) return;
    const ang = Math.atan2(-dz, dx);
    const ux = dx / L;
    const uz = dz / L;
    const gaps = (opts.gaps ?? []).slice().sort((a, b) => a[0] - b[0]);

    const place = (s0: number, s1: number, hy0: number, hy1: number) => {
      const len = s1 - s0;
      const h = hy1 - hy0;
      if (len <= 1e-3 || h <= 1e-3) return;
      const midS = (s0 + s1) / 2;
      const mesh = this.box(len, h, t, matName, uv, {
        x: ax + ux * midS,
        y: y0 + hy0 + h / 2,
        z: az + uz * midS,
        ry: ang,
      });
      mesh.castShadow = true;
      // tagged so the decal pass knows which surfaces are walls
      mesh.userData.wall = true;
    };

    let cursor = 0;
    for (const [g0, g1, sill = 0, head = 2.15] of gaps) {
      if (g0 > cursor) place(cursor, g0, 0, opts.height);
      if (sill > 0) place(g0, g1, 0, sill);
      if (head < opts.height) place(g0, g1, head, opts.height);
      cursor = Math.max(cursor, g1);
    }
    if (cursor < L) place(cursor, L, 0, opts.height);

    if (opts.collide !== false) {
      // one blocker per solid span
      let c = 0;
      const push = (s0: number, s1: number) => {
        const mx = ax + ux * ((s0 + s1) / 2);
        const mz = az + uz * ((s0 + s1) / 2);
        const halfLen = (s1 - s0) / 2;
        const ex = Math.abs(ux) * halfLen + Math.abs(uz) * (t / 2);
        const ez = Math.abs(uz) * halfLen + Math.abs(ux) * (t / 2);
        this.blockers.push({ minX: mx - ex, maxX: mx + ex, minZ: mz - ez, maxZ: mz + ez });
      };
      for (const [g0, g1] of gaps) {
        if (g0 > c) push(c, g0);
        c = Math.max(c, g1);
      }
      if (c < L) push(c, L);
    }
  }

  /** Skirting board along a wall run. */
  skirting(ax: number, az: number, bx: number, bz: number, height = 0.11, mat = "wood", inset = 0.06) {
    const dx = bx - ax;
    const dz = bz - az;
    const L = Math.hypot(dx, dz);
    const ang = Math.atan2(-dz, dx);
    this.box(L, height, inset, mat, 1.2, {
      x: (ax + bx) / 2,
      y: height / 2,
      z: (az + bz) / 2,
      ry: ang,
    });
  }

  /** Door frame: two jambs and a lintel inside an opening. */
  frame(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    s0: number,
    s1: number,
    head: number,
    mat = "wood",
    depth = 0.3
  ) {
    const dx = bx - ax;
    const dz = bz - az;
    const L = Math.hypot(dx, dz);
    if (L < 1e-5) return;
    const ux = dx / L;
    const uz = dz / L;
    const ang = Math.atan2(-dz, dx);
    const jw = 0.09;
    for (const s of [s0 + jw / 2, s1 - jw / 2]) {
      this.box(jw, head, depth, mat, 1, {
        x: ax + ux * s,
        y: head / 2,
        z: az + uz * s,
        ry: ang,
      });
    }
    const mid = (s0 + s1) / 2;
    this.box(s1 - s0, 0.1, depth, mat, 1, {
      x: ax + ux * mid,
      y: head - 0.05,
      z: az + uz * mid,
      ry: ang,
    });
  }

  /** Recessed coffer / trim strip. */
  trim(ax: number, az: number, bx: number, bz: number, y: number, h = 0.09, d = 0.07, mat = "plasterCeil") {
    const dx = bx - ax;
    const dz = bz - az;
    const L = Math.hypot(dx, dz);
    const ang = Math.atan2(-dz, dx);
    this.box(L, h, d, mat, 1.4, { x: (ax + bx) / 2, y, z: (az + bz) / 2, ry: ang });
  }

  /** Instanced copies of a small geometry (wedges, rivets, bolts). */
  instance(
    geo: THREE.BufferGeometry,
    matName: string,
    xforms: { p: THREE.Vector3 | [number, number, number]; q?: THREE.Quaternion | [number, number, number, number]; s?: number }[]
  ): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(geo, this.m(matName), xforms.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    xforms.forEach((xf, i) => {
      const p = xf.p instanceof THREE.Vector3 ? xf.p : new THREE.Vector3(...xf.p);
      if (xf.q instanceof THREE.Quaternion) q.copy(xf.q);
      else if (Array.isArray(xf.q)) q.set(...xf.q);
      else q.identity();
      const sc = xf.s ?? 1;
      s.set(sc, sc, sc);
      m4.compose(p, q, s);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    this.root.add(im);
    return im;
  }
}

/** Merge a list of meshes into one geometry to cut draw calls. */
export function mergeMeshes(meshes: THREE.Mesh[]): THREE.Mesh | null {
  if (!meshes.length) return null;
  const geos: THREE.BufferGeometry[] = [];
  let mat: THREE.Material | null = null;
  for (const m of meshes) {
    const g = m.geometry.clone();
    m.updateMatrix();
    g.applyMatrix4(m.matrix);
    // keep only attributes present on all
    geos.push(g);
    mat = m.material as THREE.Material;
  }
  // naive merge
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const merged = new THREE.BufferGeometry();
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute | undefined;
    const u = g.attributes.uv as THREE.BufferAttribute | undefined;
    for (let i = 0; i < p.count; i++) {
      pos[(o + i) * 3] = p.getX(i);
      pos[(o + i) * 3 + 1] = p.getY(i);
      pos[(o + i) * 3 + 2] = p.getZ(i);
      if (n) {
        nor[(o + i) * 3] = n.getX(i);
        nor[(o + i) * 3 + 1] = n.getY(i);
        nor[(o + i) * 3 + 2] = n.getZ(i);
      }
      if (u) {
        uv[(o + i) * 2] = u.getX(i);
        uv[(o + i) * 2 + 1] = u.getY(i);
      }
    }
    o += p.count;
  }
  merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(merged, mat!);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
