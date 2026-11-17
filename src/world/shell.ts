import * as THREE from "three";
import { Kit } from "../core/kit";
import { ROOMS, WALL_T, octagon, bearing, type Poly } from "./layout";

const D2R = Math.PI / 180;

/** Build the static architecture: every wall, floor, ceiling, trim and pipe. */
export function buildShell(kit: Kit) {
  rotunda(kit);
  corridors(kit);
  records(kit);
  dome(kit);
  anechoic(kit);
  machine(kit);
  darkroom(kit);
  tunnel(kit);
  blastDoor(kit);
  cage(kit);
  lift(kit);
}

// ---------------------------------------------------------------- rotunda
function rotunda(kit: Kit) {
  const ap = ROOMS.rotunda.apothem;
  const H = ROOMS.rotunda.height;
  const poly = octagon(0, 0, ap);
  const R = ap / Math.cos(Math.PI / 8);

  kit.floor(poly, 0, "terrazzo", 2.4);
  kit.ceiling(poly, H, "plasterCeil", 3.0);

  // brass survey mark inlay
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.62, 2.7, 72), kit.m("brass"));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.006;
  kit.root.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(1.16, 1.2, 56), kit.m("brass"));
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.006;
  kit.root.add(ring2);
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const long = i % 4 === 0;
    const tick = kit.box(long ? 0.42 : 0.2, 0.004, 0.022, "brass", 1, {
      x: Math.sin(a) * (long ? 2.3 : 2.52),
      y: 0.007,
      z: -Math.cos(a) * (long ? 2.3 : 2.52),
      ry: a,
    });
    tick.castShadow = false;
  }
  const medallion = kit.cyl(0.34, 0.34, 0.006, "brassDark", 0, 0.006, 0, 24);
  medallion.castShadow = false;

  const gapsFor = (edge: number): [number, number, number?, number?][] => {
    const len = 2 * R * Math.sin(Math.PI / 8);
    const c = len / 2;
    const openings: Record<number, number> = { 7: 2.4, 1: 2.4, 3: 2.4, 5: 2.4 };
    const w = openings[edge];
    if (!w) return [];
    // non-north faces get a narrower opening (fire door)
    const width = edge === 7 ? 2.4 : 2.0;
    return [[c - width / 2, c + width / 2, 0, 2.2]];
  };

  for (let e = 0; e < 8; e++) {
    const a = poly[e];
    const b = poly[(e + 1) % 8];
    const gaps = gapsFor(e);
    // tiled dado to 1.25 m, plaster above
    kit.wall(a[0], a[1], b[0], b[1], {
      height: 1.25,
      thickness: WALL_T,
      mat: "tileGreen",
      uv: 1.4,
      gaps,
    });
    kit.wall(a[0], a[1], b[0], b[1], {
      y0: 1.25,
      height: H - 1.25,
      thickness: WALL_T,
      mat: "plaster",
      uv: 2.6,
      gaps,
      collide: false,
    });
    // dado cap
    const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    kit.box(L, 0.05, WALL_T + 0.05, "brassDark", 1, {
      x: (a[0] + b[0]) / 2,
      y: 1.25,
      z: (a[1] + b[1]) / 2,
      ry: ang,
    });
    // picture rail / cornice
    kit.box(L, 0.16, WALL_T + 0.09, "plasterCeil", 2, {
      x: (a[0] + b[0]) / 2,
      y: H - 0.1,
      z: (a[1] + b[1]) / 2,
      ry: ang,
    });
  }

  // pilasters at each vertex
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    const px = Math.sin(a) * (R - 0.1);
    const pz = -Math.cos(a) * (R - 0.1);
    kit.box(0.42, H, 0.34, "plasterCeil", 2.2, {
      x: px,
      y: H / 2,
      z: pz,
      ry: -a,
    });
    kit.box(0.56, 0.14, 0.46, "plasterCeil", 2, { x: px, y: H - 0.2, z: pz, ry: -a });
    kit.box(0.52, 0.12, 0.42, "tileGreen", 1.4, { x: px, y: 1.2, z: pz, ry: -a });
    kit.box(0.5, 0.1, 0.42, "terrazzo", 1.2, { x: px, y: 0.05, z: pz, ry: -a });
  }

  // radial ceiling coffers
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    kit.box(2.2, 0.22, 0.26, "plasterCeil", 2, {
      x: Math.sin(a) * 4.4,
      y: H - 0.18,
      z: -Math.cos(a) * 4.4,
      ry: a,
    });
  }
  // outer ceiling ring
  const ringGeo = new THREE.TorusGeometry(4.6, 0.11, 8, 48);
  const ringMesh = new THREE.Mesh(ringGeo, kit.m("plasterCeil"));
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.position.y = H - 0.18;
  kit.root.add(ringMesh);

  // conduit ring at 3.4 m
  for (let i = 0; i < 8; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % 8];
    const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    kit.box(L, 0.07, 0.07, "steelDark", 1, {
      x: (a[0] + b[0]) / 2,
      y: 3.42,
      z: (a[1] + b[1]) / 2,
      ry: ang,
    });
  }

  // floor drain at centre-ish
  kit.cyl(0.16, 0.16, 0.02, "steelDark", 1.2, 0.008, 1.6, 16);
}

// -------------------------------------------------------------- corridors
function corridors(kit: Kit) {
  const H = 3.2;
  const seg = (x0: number, z0: number, x1: number, z1: number, alongX: boolean) => {
    const poly: Poly = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ];
    kit.floor(poly, 0, "wood", 2.0);
    kit.ceiling(poly, H, "plasterCeil", 3.0);
    const w = 1.2;
    if (alongX) {
      kit.wall(x0, z0, x1, z0, { height: H, mat: "plaster", uv: 2.6 });
      kit.wall(x0, z1, x1, z1, { height: H, mat: "plaster", uv: 2.6 });
      kit.skirting(x0, z0 + 0.01, x1, z0 + 0.01, 0.12, "wood");
      kit.skirting(x0, z1 - 0.01, x1, z1 - 0.01, 0.12, "wood");
    } else {
      kit.wall(x0, z0, x0, z1, { height: H, mat: "plaster", uv: 2.6 });
      kit.wall(x1, z0, x1, z1, { height: H, mat: "plaster", uv: 2.6 });
      kit.skirting(x0 + 0.01, z0, x0 + 0.01, z1, 0.12, "wood");
      kit.skirting(x1 - 0.01, z0, x1 - 0.01, z1, 0.12, "wood");
    }
    void w;
    // conduit along the ceiling
    if (alongX) {
      kit.pipe(
        [
          [x0, H - 0.22, z0 + 0.3],
          [x1, H - 0.22, z0 + 0.3],
        ],
        0.035,
        "steelDark",
        8
      );
      kit.pipe(
        [
          [x0, H - 0.18, z1 - 0.28],
          [x1, H - 0.18, z1 - 0.28],
        ],
        0.028,
        "rust",
        8
      );
    } else {
      kit.pipe(
        [
          [x0 + 0.3, H - 0.22, z0],
          [x0 + 0.3, H - 0.22, z1],
        ],
        0.035,
        "steelDark",
        8
      );
      kit.pipe(
        [
          [x1 - 0.28, H - 0.18, z0],
          [x1 - 0.28, H - 0.18, z1],
        ],
        0.028,
        "rust",
        8
      );
    }
  };

  seg(-1.2, -6.0, 1.2, -12.0, false); // north
  seg(6.0, -1.2, 12.0, 1.2, true); // east
  seg(-1.2, 6.0, 1.2, 12.0, false); // south
  seg(-12.0, -1.2, -6.0, 1.2, true); // west

  // corridor door frames at the rotunda end
  const rotate = (a: number, len: number) => [Math.sin(a) * len, -Math.cos(a) * len];
  for (const a of [0, 90, 180, 270].map((d) => d * D2R)) {
    const [dx, dz] = rotate(a, 5.88);
    const [tx, tz] = rotate(a + Math.PI / 2, 1.0);
    kit.frame(dx - tx, dz - tz, dx + tx, dz + tz, 0, 2.0, 2.2);
  }
}

// ---------------------------------------------------------------- records
function records(kit: Kit) {
  const R = ROOMS.records;
  const H = R.h;
  const poly: Poly = [
    [R.x0, R.z0],
    [R.x1, R.z0],
    [R.x1, R.z1],
    [R.x0, R.z1],
  ];
  kit.floor(poly, 0, "wood", 2.2);

  // ceiling with an aperture for the stair and the dome
  kit.ceiling(
    [
      [-3.4, R.z0],
      [R.x1, R.z0],
      [R.x1, R.z1],
      [-3.4, R.z1],
    ],
    H,
    "plasterCeil",
    3
  );
  kit.ceiling(
    [
      [R.x0, R.z0],
      [-3.4, R.z0],
      [-3.4, -18.7],
      [R.x0, -18.7],
    ],
    H,
    "plasterCeil",
    3
  );
  kit.ceiling(
    [
      [R.x0, -13.1],
      [-3.4, -13.1],
      [-3.4, R.z1],
      [R.x0, R.z1],
    ],
    H,
    "plasterCeil",
    3
  );

  // walls: south wall has the corridor opening
  kit.wall(R.x0, R.z1, R.x1, R.z1, {
    height: H,
    mat: "plaster",
    gaps: [[4.0, 6.4, 0, 2.2]],
  });
  kit.wall(R.x0, R.z0, R.x1, R.z0, { height: H, mat: "plaster" });
  kit.wall(R.x0, R.z0, R.x0, R.z1, { height: H, mat: "brick" });
  kit.wall(R.x1, R.z0, R.x1, R.z1, { height: H, mat: "brick" });

  kit.skirting(R.x0 + 0.02, R.z1 - 0.02, R.x1 - 0.02, R.z1 - 0.02, 0.12, "wood");
  kit.skirting(R.x0 + 0.02, R.z0 + 0.02, R.x1 - 0.02, R.z0 + 0.02, 0.12, "wood");
  kit.skirting(R.x0 + 0.02, R.z0 + 0.02, R.x0 + 0.02, R.z1 - 0.02, 0.12, "wood");
  kit.skirting(R.x1 - 0.02, R.z0 + 0.02, R.x1 - 0.02, R.z1 - 0.02, 0.12, "wood");

  // painted-over windows on the north wall
  for (const wx of [-2.6, 0, 2.6]) {
    kit.box(1.5, 1.7, 0.06, "steelDark", 1, { x: wx, y: 2.15, z: R.z0 + 0.16 });
    kit.box(1.34, 1.54, 0.05, "glassDirty", 1, { x: wx, y: 2.15, z: R.z0 + 0.19 });
    kit.box(1.6, 0.08, 0.12, "wood", 1, { x: wx, y: 1.26, z: R.z0 + 0.2 });
  }

  // stair
  const S = ROOMS.stair;
  const steps = 20;
  const run = (S.z1 - S.z0) / steps;
  const rise = S.top / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    kit.box(1.5, rise, run + 0.02, "steelDark", 1, {
      x: (S.x0 + S.x1) / 2,
      y: rise * (i + 0.5),
      z: S.z0 + run * (i + 0.5),
    });
    void t;
  }
  // stair stringers + rail
  const ang = Math.atan2(S.top, S.z1 - S.z0);
  for (const sx of [S.x0 + 0.06, S.x1 - 0.06]) {
    const len = Math.hypot(S.top, S.z1 - S.z0);
    kit.box(0.05, 0.3, len, "steelDark", 1, {
      x: sx,
      y: S.top / 2 + 0.05,
      z: (S.z0 + S.z1) / 2,
      rx: ang,
    });
  }
  kit.pipe(
    [
      [S.x0 + 0.04, 1.0, S.z0 + 0.2],
      [S.x0 + 0.04, S.top + 0.95, S.z1 - 0.1],
    ],
    0.028,
    "brassDark",
    8
  );

  // landing
  const L = ROOMS.landing;
  kit.floor(
    [
      [L.x0, L.z0],
      [L.x1, L.z0],
      [L.x1, L.z1],
      [L.x0, L.z1],
    ],
    L.y,
    "wood",
    2
  );
  kit.box(
    L.x1 - L.x0,
    0.18,
    L.z1 - L.z0,
    "steelDark",
    1,
    { x: (L.x0 + L.x1) / 2, y: L.y - 0.1, z: (L.z0 + L.z1) / 2 }
  );
  kit.pipe(
    [
      [L.x0 + 0.05, L.y + 0.95, L.z0 + 0.05],
      [L.x0 + 0.05, L.y + 0.95, L.z1 - 0.05],
    ],
    0.028,
    "brassDark",
    8
  );
}

// ------------------------------------------------------------------- dome
function dome(kit: Kit) {
  const D = ROOMS.dome;
  const poly = octagon(0, D.cz, D.apothem);
  const R = D.apothem / Math.cos(Math.PI / 8);
  kit.floor(poly, D.floor, "wood", 2.0);
  // timber deck planks
  for (let i = -5; i <= 5; i++) {
    kit.box(6.4, 0.02, 0.06, "steelDark", 1, { x: 0, y: D.floor + 0.011, z: D.cz + i * 0.7 });
  }

  const drumH = D.drum - D.floor;
  for (let e = 0; e < 8; e++) {
    const a = poly[e];
    const b = poly[(e + 1) % 8];
    // edge 7 is north — leave a slit
    if (e === 7) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      const w = 0.3;
      const stub = (L - w) / 2;
      for (const sgn of [-1, 1]) {
        const off = sgn * (w / 2 + stub / 2);
        kit.box(stub, drumH, WALL_T, "copperPatina", 1.6, {
          x: (a[0] + b[0]) / 2 + Math.cos(ang) * off,
          y: D.floor + drumH / 2,
          z: (a[1] + b[1]) / 2 - Math.sin(ang) * off,
          ry: ang,
        });
      }
      continue;
    }
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    kit.wall(a[0], a[1], b[0], b[1], {
      y0: D.floor,
      height: drumH,
      mat: "copperPatina",
      uv: 1.6,
      gaps: e === 5 ? [[L / 2 - 0.7, L / 2 + 0.7, 0, 2.3]] : undefined,
      collide: false,
    });
  }

  // dome cap: eight triangular panels, the north one omitted for the slit
  const apex = new THREE.Vector3(0, D.apex, D.cz);
  const mat = kit.m("copperPatina");
  for (let e = 0; e < 8; e++) {
    if (e === 7) continue;
    const a = poly[e];
    const b = poly[(e + 1) % 8];
    const va = new THREE.Vector3(a[0], D.drum, a[1]);
    const vb = new THREE.Vector3(b[0], D.drum, b[1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [va.x, va.y, va.z, vb.x, vb.y, vb.z, apex.x, apex.y, apex.z],
        3
      )
    );
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    g.setIndex([0, 2, 1]);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.material.side = THREE.DoubleSide;
    mesh.receiveShadow = true;
    kit.root.add(mesh);
  }

  // catwalk ring at the drum
  const ringGeo = new THREE.TorusGeometry(R - 0.18, 0.06, 6, 48);
  const rm = new THREE.Mesh(ringGeo, kit.m("brassDark"));
  rm.rotation.x = Math.PI / 2;
  rm.position.set(0, D.drum - 0.06, D.cz);
  kit.root.add(rm);
}

// --------------------------------------------------------------- anechoic
function anechoic(kit: Kit) {
  const A = ROOMS.anechoic;
  const H = A.h;
  const poly: Poly = [
    [A.x0, A.z0],
    [A.x1, A.z0],
    [A.x1, A.z1],
    [A.x0, A.z1],
  ];
  kit.floor(poly, 0, "plate", 1.2);
  kit.ceiling(poly, H, "black", 2);

  kit.wall(A.x0, A.z1, A.x1, A.z1, {
    height: H,
    mat: "concreteWall",
    gaps: [[4.5 - 1.0, 4.5 + 1.0, 0, 2.4]],
  });
  kit.wall(A.x0, A.z0, A.x1, A.z0, { height: H, mat: "concreteWall" });
  kit.wall(A.x0, A.z0, A.x0, A.z1, { height: H, mat: "concreteWall" });
  kit.wall(A.x1, A.z0, A.x1, A.z1, { height: H, mat: "concreteWall" });

  // wedge cladding — one instanced mesh for the whole room
  const wedgeGeo = new THREE.ConeGeometry(0.185, 0.34, 4, 1);
  wedgeGeo.rotateX(Math.PI / 2);

  const A_ = A;
  const midX = (A_.x0 + A_.x1) / 2;
  const midZ = (A_.z0 + A_.z1) / 2;
  const push = (
    out: { p: [number, number, number]; q: [number, number, number, number] }[],
    p: [number, number, number],
    nrm: THREE.Vector3
  ) => {
    const inward = new THREE.Vector3(midX - p[0], 0, midZ - p[2]);
    if (nrm.dot(inward) < 0) nrm.negate();
    const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
    out.push({ p, q: [qq.x, qq.y, qq.z, qq.w] });
  };

  const wallXf: { p: [number, number, number]; q: [number, number, number, number] }[] = [];
  const step = 0.27;
  const inset = 0.16;
  // north + south walls
  for (const z of [A_.z0 + inset, A_.z1 - inset]) {
    for (let x = A_.x0 + 0.4; x < A_.x1 - 0.3; x += step) {
      for (let y = 0.32; y < H - 0.5; y += step) {
        push(wallXf, [x, y, z], new THREE.Vector3(0, 0, 1));
      }
    }
  }
  // east + west walls
  for (const x of [A_.x0 + inset, A_.x1 - inset]) {
    for (let z = A_.z0 + 0.4; z < A_.z1 - 0.3; z += step) {
      for (let y = 0.32; y < H - 0.5; y += step) {
        push(wallXf, [x, y, z], new THREE.Vector3(1, 0, 0));
      }
    }
  }
  const inst = kit.instance(wedgeGeo, "foam", wallXf);
  inst.castShadow = false;

  // ceiling wedges (cones point down)
  const ceilXf: { p: [number, number, number]; q: [number, number, number, number] }[] = [];
  for (const [x, z] of (() => {
    const pts: [number, number][] = [];
    for (let x = A_.x0 + 0.4; x < A_.x1 - 0.3; x += step)
      for (let z = A_.z0 + 0.4; z < A_.z1 - 0.3; z += step) pts.push([x, z]);
    return pts;
  })()) {
    push(ceilXf, [x, H - 0.17, z], new THREE.Vector3(0, -1, 0));
  }
  const inst2 = kit.instance(wedgeGeo, "foam", ceilXf);
  inst2.castShadow = false;
}

// ---------------------------------------------------------------- machine
function machine(kit: Kit) {
  const M = ROOMS.machine;
  const H = M.h;
  const poly: Poly = [
    [M.x0, M.z0],
    [M.x1, M.z0],
    [M.x1, M.z1],
    [M.x0, M.z1],
  ];
  kit.floor(poly, 0, "plate", 1.4);
  kit.ceiling(poly, H, "concreteWall", 3.0);

  kit.wall(M.x0, M.z1, M.x1, M.z1, { height: H, mat: "brick" });
  kit.wall(M.x0, M.z0, M.x1, M.z0, {
    height: H,
    mat: "brick",
    gaps: [[5.5 - 1.0, 5.5 + 1.0, 0, 2.4]],
  });
  kit.wall(M.x0, M.z0, M.x0, M.z1, { height: H, mat: "brick" });
  kit.wall(M.x1, M.z0, M.x1, M.z1, { height: H, mat: "brick" });

  // roof trusses
  for (let i = 0; i < 5; i++) {
    const z = M.z0 + 1.4 + i * 2.1;
    kit.box(M.x1 - M.x0, 0.2, 0.16, "steelDark", 1, { x: 0, y: H - 0.2, z });
    kit.box(M.x1 - M.x0, 0.08, 0.08, "steelDark", 1, { x: 0, y: H - 0.75, z });
    for (let k = -3; k <= 3; k++) {
      const x = k * 1.5;
      kit.box(0.06, 0.72, 0.06, "steelDark", 1, { x, y: H - 0.55, z });
    }
  }

  // pipe gallery along the west wall
  const runs: [number, number, number][] = [
    [M.x0 + 0.35, 3.4, M.z0 + 0.4],
    [M.x0 + 0.35, 3.4, M.z1 - 0.4],
  ];
  kit.pipe(runs, 0.13, "rust", 10);
  kit.pipe(
    [
      [M.x0 + 0.72, 3.05, M.z0 + 0.4],
      [M.x0 + 0.72, 3.05, M.z1 - 0.4],
    ],
    0.09,
    "steel",
    10
  );
  kit.pipe(
    [
      [M.x0 + 1.02, 2.7, M.z0 + 0.4],
      [M.x0 + 1.02, 2.7, M.z1 - 0.4],
    ],
    0.06,
    "rustDark",
    8
  );
  // brackets
  for (let i = 0; i < 8; i++) {
    const z = M.z0 + 0.9 + i * 1.05;
    kit.box(0.9, 0.06, 0.08, "steelDark", 1, { x: M.x0 + 0.6, y: 3.4, z });
  }

  // floor grating around the boiler dais
  kit.box(4.8, 0.04, 3.4, "plate", 1, { x: -1.2, y: 0.02, z: 16.6 });

  // ceiling grating to the outside (god ray source)
  kit.box(1.4, 0.06, 1.4, "steelDark", 1, { x: 3.6, y: H - 0.28, z: 18.6 });

  // hatch to the tunnel
  kit.box(1.4, 0.12, 1.4, "steelDark", 1, { x: 2.6, y: 0.06, z: 15.1 });
  kit.box(1.2, 0.1, 1.2, "rustDark", 1, { x: 2.6, y: 0.12, z: 15.1 });
  for (const [dx, dz] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ]) {
    kit.cyl(0.045, 0.045, 0.09, "brassDark", 2.6 + dx, 0.2, 15.1 + dz, 8);
  }
}

// --------------------------------------------------------------- darkroom
function darkroom(kit: Kit) {
  const D = ROOMS.darkroom;
  const H = D.h;
  const poly: Poly = [
    [D.x0, D.z0],
    [D.x1, D.z0],
    [D.x1, D.z1],
    [D.x0, D.z1],
  ];
  kit.floor(poly, 0, "tile", 1.6);
  kit.ceiling(poly, H, "plasterCeil", 3.0);

  kit.wall(D.x0, D.z1, D.x1, D.z1, { height: H, mat: "tile", uv: 1.6 });
  kit.wall(D.x0, D.z0, D.x1, D.z0, { height: H, mat: "tile", uv: 1.6 });
  kit.wall(D.x0, D.z0, D.x0, D.z1, { height: H, mat: "tile", uv: 1.6 });
  kit.wall(D.x1, D.z0, D.x1, D.z1, {
    height: H,
    mat: "tile",
    uv: 1.6,
    gaps: [[3.0 - 1.0, 3.0 + 1.0, 0, 2.2]],
  });

  // sloped floor to centre drain
  kit.cyl(0.18, 0.18, 0.02, "steelDark", -15.5, 0.012, 0.2, 16);

  // blackout curtain over the corridor door
  kit.box(2.0, 2.2, 0.05, "felt", 1, { x: D.x1 - 0.16, y: 1.1, z: 0 });

  // sink
  kit.box(2.6, 0.5, 0.6, "steelPale", 1, { x: -15.6, y: 0.45, z: -2.6 });
  kit.box(2.4, 0.08, 0.44, "steelDark", 1, { x: -15.6, y: 0.68, z: -2.6 });
  kit.pipe(
    [
      [-16.9, 0.2, -2.6],
      [-16.9, 0.95, -2.6],
      [-16.6, 0.95, -2.6],
    ],
    0.022,
    "brass",
    8
  );
}

// ----------------------------------------------------------------- tunnel
function tunnel(kit: Kit) {
  const y = ROOMS.tunnelY;
  const H = ROOMS.tunnelH;
  const rects: [number, number, number, number][] = [
    [1.6, 13.4, 3.6, 16.8],
    [-16.2, 13.4, 3.6, 16.8],
    [-17.8, -1.2, -14.4, 15.0],
    [-19.2, -1.1, -16.6, 1.1],
  ];
  for (const [x0, z0, x1, z1] of rects) {
    const poly: Poly = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ];
    kit.floor(poly, y, "concreteWet", 2.0);
    kit.ceiling(poly, y + H, "concrete", 2.4);
    kit.wall(x0, z0, x1, z0, { y0: y, height: H, mat: "concreteWet", uv: 2.2 });
    kit.wall(x0, z1, x1, z1, { y0: y, height: H, mat: "concreteWet", uv: 2.2 });
    kit.wall(x0, z0, x0, z1, { y0: y, height: H, mat: "concreteWet", uv: 2.2 });
    kit.wall(x1, z0, x1, z1, { y0: y, height: H, mat: "concreteWet", uv: 2.2 });
    // pipes
    kit.pipe(
      [
        [x0 + 0.3, y + H - 0.25, z0 + 0.2],
        [x0 + 0.3, y + H - 0.25, z1 - 0.2],
      ],
      0.08,
      "rust",
      8
    );
    kit.pipe(
      [
        [x1 - 0.3, y + H - 0.32, z0 + 0.2],
        [x1 - 0.3, y + H - 0.32, z1 - 0.2],
      ],
      0.05,
      "steelDark",
      8
    );
  }
}

// ------------------------------------------------------------- blast door
function blastDoor(kit: Kit) {
  const dir = bearing(Math.PI / 4);
  const ap = ROOMS.rotunda.apothem;
  const cx = dir[0] * (ap + 0.16);
  const cz = dir[1] * (ap + 0.16);
  const ang = Math.atan2(-(dir[1]), dir[0]) + Math.PI / 2;

  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = ang;
  kit.root.add(g);

  const add = (mesh: THREE.Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  const b = (w: number, h: number, d: number, mat: string, x: number, y: number, z: number) =>
    add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), kit.m(mat))).position.set(x, y, z) as any;

  // frame
  b(0.3, 2.9, 0.5, "steelDark", -1.15, 1.45, -0.1);
  b(0.3, 2.9, 0.5, "steelDark", 1.15, 1.45, -0.1);
  b(2.6, 0.4, 0.5, "steelDark", 0, 2.85, -0.1);

  // slab
  const slab = add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.7, 0.42), kit.m("steel")));
  slab.position.set(0, 1.35, 0);

  // rivet field
  const rivet = new THREE.SphereGeometry(0.022, 8, 6);
  const rx: { p: [number, number, number] }[] = [];
  for (let ix = -4; ix <= 4; ix++) {
    for (let iy = 0; iy <= 10; iy++) {
      rx.push({ p: [ix * 0.22, 0.25 + iy * 0.22, 0.215] });
    }
  }
  const rim = new THREE.InstancedMesh(rivet, kit.m("steelPale"), rx.length);
  const m4 = new THREE.Matrix4();
  rx.forEach((xf, i) => {
    m4.makeTranslation(xf.p[0], xf.p[1], xf.p[2]);
    rim.setMatrixAt(i, m4);
  });
  rim.instanceMatrix.needsUpdate = true;
  rim.castShadow = false;
  g.add(rim);

  // dogging bolts around the perimeter
  for (let i = 0; i < 3; i++) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 10), kit.m("steelPale"))).position.set(
      -0.92,
      0.6 + i * 0.75,
      0.25
    );
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 10), kit.m("steelPale"))).position.set(
      0.92,
      0.6 + i * 0.75,
      0.25
    );
  }

  // gear box
  b(0.36, 0.36, 0.3, "steelDark", 0.72, 1.35, 0.34);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 14), kit.m("brass"))).position.set(
    0.72,
    1.35,
    0.53
  );
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), kit.m("steelPale"))).position.set(
    0.72,
    1.35,
    0.6
  );

  // dial
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 20), kit.m("brassDark"))).position.set(
    -0.55,
    1.42,
    0.24
  );
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20), kit.m("brass"))).position.set(
    -0.55,
    1.42,
    0.28
  );

  // four solenoid lamps
  for (let i = 0; i < 4; i++) {
    const lamp = add(
      new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), kit.m("bakelite"))
    );
    lamp.position.set(-0.9 + i * 0.28, 2.42, 0.24);
  }

  // gasket + light leak
  const leak = add(new THREE.Mesh(new THREE.PlaneGeometry(1.98, 0.05), kit.m("bulb")));
  leak.position.set(0, 0.02, 0.24);
  leak.scale.setScalar(1);

  kit.blockers.push({ minX: cx - 1.2, maxX: cx + 1.2, minZ: cz - 1.2, maxZ: cz + 1.2 });
}

// ------------------------------------------------------- electrical cage
function cage(kit: Kit) {
  const dir = bearing((225 * Math.PI) / 180);
  const ap = ROOMS.rotunda.apothem;
  const cx = dir[0] * (ap - 0.35);
  const cz = dir[1] * (ap - 0.35);
  const ang = Math.atan2(-dir[1], dir[0]);

  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = ang;
  kit.root.add(g);

  const mesh = (geo: THREE.BufferGeometry, mat: string, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, kit.m(mat));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // chain-link panels drawn as alpha-tested grids would need a texture; use thin bars
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 12; j++) {
      mesh(new THREE.BoxGeometry(0.012, 2.2, 0.012), "steelPale", -0.95 + i * 1.9, 1.1, -0.9 + j * 0.16);
    }
  }
  for (let i = 0; i < 13; i++) {
    for (const side of [-0.9, 0.9]) {
      void side;
    }
    mesh(new THREE.BoxGeometry(1.9, 0.012, 0.012), "steelPale", 0, 0.25 + i * 0.16, -0.9);
  }
  // posts
  for (const [x, z] of [
    [-0.95, -0.9],
    [0.95, -0.9],
  ]) {
    mesh(new THREE.BoxGeometry(0.06, 2.4, 0.06), "steelDark", x, 1.2, z);
  }
  mesh(new THREE.BoxGeometry(2.0, 0.06, 0.06), "steelDark", 0, 2.4, -0.9);
  // side panels
  for (const x of [-0.95, 0.95]) {
    for (let j = 0; j < 8; j++) {
      mesh(new THREE.BoxGeometry(0.012, 2.2, 0.012), "steelPale", x, 1.1, -0.9 + j * 0.25);
    }
  }

  // fuse panel on the wall
  mesh(new THREE.BoxGeometry(1.5, 1.1, 0.22), "bakelite", 0, 1.65, 0.72);
  mesh(new THREE.BoxGeometry(1.36, 0.96, 0.04), "steelDark", 0, 1.65, 0.85);
}

// ---------------------------------------------------------------- lift
function lift(kit: Kit) {
  const dir = bearing((315 * Math.PI) / 180);
  const ap = ROOMS.rotunda.apothem;
  const cx = dir[0] * (ap - 0.2);
  const cz = dir[1] * (ap - 0.2);
  const ang = Math.atan2(-dir[1], dir[0]);
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = ang;
  kit.root.add(g);
  const mesh = (geo: THREE.BufferGeometry, mat: string, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, kit.m(mat));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  mesh(new THREE.BoxGeometry(2.4, 3.0, 0.3), "steelDark", 0, 1.5, 0.1);
  // lift car stalled above
  mesh(new THREE.BoxGeometry(2.2, 2.2, 1.6), "rustDark", 0, 4.4, 0.9);
  mesh(new THREE.BoxGeometry(2.3, 0.12, 1.7), "steelPale", 0, 3.3, 0.9);
  // inspection hatch at 2.6 m
  mesh(new THREE.BoxGeometry(0.8, 0.8, 0.06), "steel", 0, 2.6, 0.26);
}
