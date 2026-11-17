import * as THREE from "three";
import { Kit } from "../core/kit";
import { ROOMS, bearing } from "./layout";
import {
  PB,
  bucket,
  cabinet,
  cardCatalog,
  chair,
  crate,
  drum,
  extinguisher,
  gauge,
  hoseReel,
  noticeBoard,
  papers,
  pendant,
  shelf,
  table,
  troffer,
  bulkhead,
  ladder,
} from "./props";

export interface ZoneRig {
  zone: string;
  lights: THREE.Light[];
  /** widgets that animate (flicker, etc.) */
  tick?: (t: number) => void;
}

/** Builds every light in the station and returns per-zone rigs. */
export function buildLights(scene: THREE.Scene): ZoneRig[] {
  const rigs: ZoneRig[] = [];
  const add = (zone: string, lights: THREE.Light[], tick?: (t: number) => void) => {
    for (const l of lights) scene.add(l);
    rigs.push({ zone, lights, tick });
  };

  const point = (color: number, intensity: number, dist: number, x: number, y: number, z: number) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    return l;
  };

  const spot = (
    color: number,
    intensity: number,
    dist: number,
    angle: number,
    penumbra: number,
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    shadow = false,
    mapSize = 1024
  ) => {
    const l = new THREE.SpotLight(color, intensity, dist, angle, penumbra, 1.7);
    l.position.set(x, y, z);
    l.target.position.set(tx, ty, tz);
    scene.add(l.target);
    if (shadow) {
      l.castShadow = true;
      l.shadow.mapSize.set(mapSize, mapSize);
      l.shadow.bias = -0.0012;
      l.shadow.normalBias = 0.02;
      l.shadow.radius = 3;
      l.shadow.camera.near = 0.2;
      l.shadow.camera.far = dist;
    }
    return l;
  };

  // ---- rotunda ----------------------------------------------------------
  {
    const pend: THREE.Light[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + 0.6;
      const x = Math.sin(a) * 3.0;
      const z = -Math.cos(a) * 3.0;
      // bare opal globes: a small warm point for the ceiling haze, plus a
      // downward spot so the walls get a real gradient instead of a flat wash
      pend.push(point(0xffdcbb, 5.5, 9, x, 4.35, z));
      pend.push(point(0xffd8b2, 1.4, 2.4, x, 4.85, z));
      pend.push(spot(0xffdcbc, 44, 9.5, 0.55, 0.88, x, 4.7, z, x, 0, z));
    }
    // one shadow caster so the pillars throw real shadows across the floor
    pend.push(spot(0xffd2a4, 26, 12, 0.95, 0.95, 0.9, 4.72, 1.25, 0.9, 0, 1.25, true, 1024));
    // door lamp: the blast door is the hero of the room, so it gets its own
    // fixture washing it from above and throwing the crank's shadow below
    const dd = bearing(Math.PI / 4);
    pend.push(
      spot(0xffd6b0, 17, 5.5, 0.9, 0.75, dd[0] * 4.95, 2.95, dd[1] * 4.95, dd[0] * 5.9, 1.25, dd[1] * 5.9, true, 1024)
    );
    const fill = point(0xffe2c6, 2.0, 10, 0, 3.2, 0);
    // a cold fill from the vents: keeps the shadows from going pure sepia
    const hemi = new THREE.HemisphereLight(0x4a5f78, 0x1b140e, 0.32);
    const leak = spot(0x8fb4ff, 26, 9, 0.42, 0.62, 4.15, 0.3, -4.15, 2.0, 1.2, -2.0, true, 512);
    add("rotunda", [...pend, fill, hemi, leak]);
  }

  // ---- corridors --------------------------------------------------------
  const corridorLamp = (zone: string, x: number, z: number) =>
    add(zone, [spot(0xffc48a, 16, 7, 0.95, 0.75, x, 3.05, z, x, 0, z, false)]);
  corridorLamp("corr_n", 0, -9);
  corridorLamp("corr_e", 9, 0);
  corridorLamp("corr_s", 0, 9);
  corridorLamp("corr_w", -9, 0);

  // ---- records ----------------------------------------------------------
  {
    const t1 = spot(0xcfe0f2, 74, 8, 1.15, 0.85, -1.6, 3.42, -14.2, -1.6, 0, -14.2, true, 1024);
    const t3 = spot(0xd6e6f4, 52, 8, 1.1, 0.88, 0, 3.42, -16.2, 0, 0, -16.2);
    const t2 = spot(0xcfe0f2, 60, 8, 1.15, 0.85, 1.6, 3.42, -18.0, 1.6, 0, -18.0, false);
    const lamp = point(0xffab52, 14, 4.6, 0.2, 1.16, -16.1);
    const reader = point(0xffbe78, 1.6, 2.2, -3.5, 1.2, -14.1);
    const amb = point(0xffe2c8, 11, 15, 0, 2.7, -16.0);
    // bracket lamp over the wall safe so the wheels read from across the room
    const safeLamp = spot(0xffca96, 8, 3.2, 0.85, 0.8, 4.25, 2.72, -17.4, 5.0, 1.35, -17.4);
    add("records", [t1, t2, t3, lamp, reader, safeLamp, amb], (t) => {
      const flick = t % 17 < 0.12 || (t % 17 > 0.6 && t % 17 < 0.68);
      t1.intensity = flick ? 16 : 74;
    });
  }

  // ---- dome -------------------------------------------------------------
  {
    const lamp = point(0xffa552, 7.0, 6, -1.7, 5.5, -16.3);
    const slit = spot(0x9fc0ff, 90, 14, 0.34, 0.55, 0, 9.2, -18.9, 0, 4.0, -14.2, true, 2048);
    add("dome", [lamp, slit]);
  }

  // ---- anechoic ---------------------------------------------------------
  {
    // wall washers raking down the wedge fields, so the cones read as cones
    const w1 = spot(0xffd6b0, 40, 6.5, 0.7, 0.55, 13.0, 3.7, -2.6, 12.4, 1.1, -2.6, true, 1024);
    const w2 = spot(0xffd6b0, 34, 6.5, 0.7, 0.55, 13.0, 3.7, 2.4, 12.4, 1.1, 2.4, false);
    const w3 = spot(0xffd0a4, 34, 6.5, 0.7, 0.55, 20.0, 3.7, -2.6, 20.6, 1.1, -2.6, false);
    const w4 = spot(0xffd0a4, 30, 6.5, 0.7, 0.55, 20.0, 3.7, 2.4, 20.6, 1.1, 2.4, false);
    const scope = point(0x5cff9e, 0.9, 1.8, 18.7, 1.05, -2.35);
    add("anechoic", [w1, w2, w3, w4, scope]);
  }

  // ---- machine ----------------------------------------------------------
  {
    const f1 = spot(0xc4d6ea, 52, 9, 1.0, 0.7, -2.4, 4.62, 14.4, -2.4, 0, 14.4, true, 1024);
    const f2 = spot(0xc4d6ea, 40, 9, 1.0, 0.7, 2.2, 4.62, 18.8, 2.2, 0, 18.8, false);
    const bench = point(0xffa855, 4.2, 4.2, -3.4, 1.35, 19.3);
    // cage lamp over the valve gallery on the east wall
    const valves = spot(0xffd0a0, 26, 6, 0.9, 0.85, 4.4, 4.0, 15.4, 5.4, 1.7, 15.4, true, 1024);
    const god = spot(0xa8c8ff, 70, 11, 0.26, 0.85, 3.6, 4.85, 18.6, 3.0, 0, 16.9, true, 1024);
    add("machine", [f1, f2, bench, god, valves], (t) => {
      const flick = t % 11 < 0.22 || (t % 11 > 1.05 && t % 11 < 1.13);
      f2.intensity = flick ? 9 : 40;
    });
  }

  // ---- darkroom ---------------------------------------------------------
  {
    const safe = point(0xff2a0c, 5.4, 5.0, -15.5, 2.5, 1.62);
    const safe2 = point(0xff2a0c, 2.6, 4.2, -15.5, 2.5, -1.6);
    // dim work light over the developing bench so the trays read
    const bench = point(0xff5a30, 1.5, 2.6, -15.6, 1.6, -2.3);
    add("darkroom", [safe, safe2, bench]);
  }

  // ---- tunnel -----------------------------------------------------------
  add("tunnel_a", [point(0xffb173, 1.6, 4, 2.6, -1.45, 15.1)]);
  add("tunnel_b", []);
  add("tunnel_c", [point(0x9bb3c6, 0.55, 3.4, -16.1, -1.45, 6)]);
  add("crawl", []);

  return rigs;
}

/** Furniture and set dressing, per room. */
export function buildDressing(kit: Kit) {
  rotundaProps(kit);
  recordsProps(kit);
  machineProps(kit);
  darkroomProps(kit);
  anechoicProps(kit);
  domeProps(kit);
  tunnelProps(kit);
}

function valwheel(kit: Kit, x: number, y: number, z: number, r = 0.22) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  kit.root.add(g);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 8, 22), kit.m("rustDark"));
  ring.rotation.y = Math.PI / 2;
  ring.castShadow = true;
  g.add(ring);
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.018, r * 2, 0.018), kit.m("rustDark"));
    sp.rotation.x = (i * Math.PI) / 4;
    sp.castShadow = true;
    g.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), kit.m("steelDark"));
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
}

function rotundaProps(kit: Kit) {
  // pendants (meshes)
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + 0.4;
    pendant(kit, Math.sin(a) * 3.1, 4.9, -Math.cos(a) * 3.1, 0.3);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const r = ROOMS.rotunda.apothem - 0.22;
    if (i % 2 === 0) continue;
    bulkhead(kit, Math.sin(a) * r, 2.55, -Math.cos(a) * r, -a + Math.PI);
  }

  noticeBoard(kit, -1.9, 2.0, 4.32, Math.PI);
  hoseReel(kit, 3.3, 2.0, 4.3, 0);

  // chairs + crates, casually placed
  chair(kit, -2.6, 1.9, 0.7);
  chair(kit, -3.1, 2.6, -0.4);
  chair(kit, 3.4, -1.2, 2.2);
  crate(kit, 2.2, 0, 2.9, 0.62, 0.4);
  crate(kit, 2.2, 0.62, 2.9, 0.5, 0.15);
  crate(kit, 1.5, 0, 3.3, 0.55, -0.2);
  bucket(kit, -3.7, 3.4);
  extinguisher(kit, 1.2, 1.35, -5.55);

  // floor plan in a brass frame on the SE face
  const plan = new PB(kit, 4.2, 2.0, 4.2, (-135 * Math.PI) / 180);
  plan.b(1.0, 0.72, 0.05, "brassDark", 0, 0, 0);
  plan.b(0.9, 0.62, 0.01, "paper", 0, 0, 0.035, 0, 0.5);

  // first-aid box
  const aid = new PB(kit, -4.0, 1.5, -4.0, (135 * Math.PI) / 180);
  aid.b(0.34, 0.26, 0.12, "steelPale", 0, 0, 0);
  aid.b(0.3, 0.22, 0.02, "paper", 0, 0, 0.065, 0, 0.2);
  aid.b(0.1, 0.02, 0.03, "brass", 0, -0.06, 0.075);

  // coat rack
  const rack = new PB(kit, -1.6, 0, -3.9, 0.3);
  rack.c(0.02, 0.02, 1.8, "wood", 0, 0.9, 0, 8);
  rack.c(0.06, 0.06, 0.06, "wood", 0, 1.72, 0, 8);
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3;
    const h = rack.b(0.03, 0.03, 0.24, "wood", Math.sin(a) * 0.1, 1.66, Math.cos(a) * 0.1);
    h.rotation.y = a;
  }
  // a coat on it
  const coat = rack.b(0.42, 0.85, 0.3, "fabric", 0, 1.1, 0.03, 0, 1.2);
  coat.scale.set(1, 1, 0.8);

  // two filing cabinets flanking the south doorway (the doorway must stay clear)
  cabinet(kit, -2.35, 5.25, Math.PI, 0.92, 1.55, 0.55, 4);
  cabinet(kit, 2.35, 5.25, Math.PI, 0.92, 1.55, 0.55, 4);

  // wall clock over the south opening
  const clk = new PB(kit, 0, 2.86, 5.86, Math.PI);
  clk.c(0.2, 0.2, 0.06, "bakelite", 0, 0, 0, 22, { x: Math.PI / 2 });
  clk.c(0.17, 0.17, 0.01, "paper", 0, 0, 0.04, 22, { x: Math.PI / 2 });
  clk.b(0.008, 0.12, 0.006, "black", 0, 0.05, 0.05);
  clk.b(0.09, 0.008, 0.006, "black", 0.04, 0, 0.05);
}

function recordsProps(kit: Kit) {
  const R = ROOMS.records;
  cardCatalog(kit, -3.4, -19.4, 0);
  for (let i = 0; i < 4; i++) cabinet(kit, 2.2 + i * 0.66, -19.5, 0, 0.62, 1.34, 0.62, 4);
  cabinet(kit, 4.5, -15.5, Math.PI / 2, 0.62, 1.34, 0.62, 4);

  table(kit, 0.6, -16.2, 1.8, 0.9, 0.78, 0.1);
  chair(kit, -0.1, -16.2, 1.4);
  chair(kit, 1.3, -17.0, -0.6);
  papers(kit, 0.7, 0.79, -16.2, 7, 0.5, 0.1);

  // banker's lamp — built from explicit meshes so the shade reads as a cone
  {
    const lamp = new THREE.Group();
    lamp.position.set(0, 0.78, -16.0);
    kit.root.add(lamp);
    const add = (geo: THREE.BufferGeometry, mat: string) => {
      const m = new THREE.Mesh(geo, kit.m(mat));
      m.castShadow = true;
      m.receiveShadow = true;
      lamp.add(m);
      return m;
    };
    add(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 20), "brass").position.y = 0.015;
    add(new THREE.CylinderGeometry(0.014, 0.014, 0.36, 8), "brass").position.y = 0.2;
    const shadeMat = kit.m("brassDark").clone();
    shadeMat.side = THREE.DoubleSide;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.2, 24, 1, true), shadeMat);
    shade.position.y = 0.44;
    shade.castShadow = true;
    lamp.add(shade);
    add(new THREE.SphereGeometry(0.062, 14, 10), "bulb").position.y = 0.4;
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), "brass").position.y = 0.325;
  }

  // adding machine
  const add = new PB(kit, -1.9, 0.78, -15.6, -0.5);
  add.b(0.38, 0.24, 0.34, "bakelite", 0, 0.12, 0, 0, 0.6);
  add.b(0.3, 0.06, 0.2, "steelPale", 0, 0.26, 0.04);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++)
      add.c(0.022, 0.022, 0.02, "paper", -0.1 + i * 0.06, 0.3, -0.02 + j * 0.07, 8);

  // typewriter
  const tw = new PB(kit, 2.0, 0.78, -15.9, 0.4);
  tw.b(0.42, 0.14, 0.32, "bakelite", 0, 0.1, 0);
  tw.b(0.34, 0.02, 0.05, "steelPale", 0, 0.18, -0.12);
  for (let i = 0; i < 10; i++)
    for (let j = 0; j < 3; j++)
      tw.b(0.026, 0.014, 0.026, "paper", -0.15 + i * 0.033, 0.185, 0.02 + j * 0.03);

  // map on the east wall
  const map = new PB(kit, 4.86, 1.9, -15.0, -Math.PI / 2);
  map.b(1.9, 1.35, 0.06, "wood", 0, 0, 0);
  map.b(1.78, 1.24, 0.01, "paper", 0, 0, 0.04, 0, 0.8);
  for (let i = 0; i < 18; i++) {
    const x = (Math.random() - 0.5) * 1.5;
    const y = (Math.random() - 0.5) * 1.0;
    map.c(0.012, 0.012, 0.02, "brass", x, y, 0.055, 6, { x: Math.PI / 2 });
  }

  // microfilm reader
  const mr = new PB(kit, -3.6, 0.78, -14.0, 0.9);
  mr.b(0.5, 0.1, 0.5, "steelDark", 0, 0.05, 0);
  mr.b(0.34, 0.22, 0.34, "steelPale", 0, 0.2, 0);
  mr.b(0.3, 0.2, 0.03, "glassDirty", 0, 0.36, -0.16);
  mr.c(0.08, 0.08, 0.02, "bakelite", 0.2, 0.24, 0.1, 10, { z: Math.PI / 2 });

  shelf(kit, 4.6, -13.0, Math.PI / 2, 1.5, 1.9, 0.32, 5);
  shelf(kit, -4.7, -12.9, 0, 1.4, 1.9, 0.34, 5);

  // pneumatic tube station
  const tube = new PB(kit, 2.9, 0, -12.6, Math.PI);
  tube.b(0.5, 1.6, 0.35, "brassDark", 0, 0.8, 0, 0, 1.2);
  tube.c(0.09, 0.09, 0.5, "brass", 0, 1.72, 0, 12);
  tube.c(0.1, 0.1, 0.04, "bakelite", 0, 1.96, 0, 12);
  tube.b(0.3, 0.1, 0.2, "steelPale", 0, 1.5, 0.2);

  // armchairs
  chair(kit, -3.4, -16.6, 1.1);
  chair(kit, -4.0, -17.5, 2.4);
}

function machineProps(kit: Kit) {
  const M = ROOMS.machine;
  // Lancashire boiler
  const b = new PB(kit, -1.4, 0, 16.6, 0);
  b.c(0.95, 0.95, 4.4, "rustDark", 0, 1.25, 0, 28, { z: Math.PI / 2 });
  b.c(0.95, 0.95, 0.06, "steelDark", -2.22, 1.25, 0, 28, { z: Math.PI / 2 });
  b.c(0.95, 0.95, 0.06, "steelDark", 2.22, 1.25, 0, 28, { z: Math.PI / 2 });
  // rivet bands
  for (let i = -2; i <= 2; i++) b.t(0.96, 0.03, "rust", i * 0.8, 1.25, 0, Math.PI / 2);
  // plinth
  b.b(4.6, 0.55, 2.1, "brick", 0, 0.27, 0, 0, 1.4);
  // furnace door
  b.b(0.8, 0.7, 0.1, "steelDark", 0.4, 0.95, 1.0);
  b.b(0.7, 0.6, 0.06, "black", 0.4, 0.95, 1.06);
  // chimney
  b.c(0.34, 0.34, 3.2, "rust", 0.6, 3.2, 0, 16);
  // gauges
  gauge(kit, -0.55, 1.62, 15.62, Math.PI, 0.085);
  gauge(kit, 0.05, 1.62, 15.62, Math.PI, 0.085);
  gauge(kit, 0.55, 1.62, 15.62, Math.PI, 0.07);
  kit.box(1.6, 0.06, 0.12, "steelDark", 1, { x: 0.03, y: 1.42, z: 15.62 });

  // valve wheels on the pipe gallery
  for (let i = 0; i < 4; i++) {
    const z = 13.6 + i * 1.7;
    kit.cyl(0.02, 0.02, 0.3, "steel", M.x0 + 0.35, 3.4, z, 8, { z: Math.PI / 2 });
    valwheel(kit, M.x0 + 0.62, 3.4, z);
    gauge(kit, M.x0 + 0.45, 3.0, z, Math.PI / 2, 0.08);
  }

  // generator set
  const gen = new PB(kit, 3.4, 0, 19.4, 0.2);
  gen.b(1.6, 0.16, 0.9, "steelDark", 0, 0.08, 0);
  gen.b(0.9, 0.7, 0.6, "rust", -0.2, 0.5, 0, 0, 1.2);
  gen.c(0.22, 0.22, 0.8, "steel", 0.5, 0.5, 0, 16, { z: Math.PI / 2 });
  gen.c(0.28, 0.28, 0.3, "steelDark", -0.75, 0.55, 0, 12, { z: Math.PI / 2 });
  gen.b(0.1, 0.9, 0.1, "steelPale", -0.95, 0.55, 0.2);
  gen.b(0.4, 0.06, 0.3, "bakelite", 0.85, 0.85, 0);

  // workbench
  table(kit, -4.0, 19.3, 2.4, 0.85, 0.86, 0, "wood");
  const bench = new PB(kit, -3.4, 0.9, 19.4, 0.1);
  bench.b(0.3, 0.08, 0.12, "steelDark", 0, 0.02, 0);
  for (let i = 0; i < 7; i++)
    bench.b(0.03, 0.02, 0.16 + i * 0.01, "steelPale", -0.3 + i * 0.1, 0.04, 0.1);
  bench.b(0.24, 0.2, 0.18, "rustDark", 0.7, 0.1, 0);
  const vise = new PB(kit, -4.9, 0.92, 19.3, 0);
  vise.b(0.2, 0.14, 0.24, "steelDark", 0, 0, 0);
  vise.b(0.06, 0.1, 0.06, "steelPale", 0.14, 0, 0);

  drum(kit, 4.4, 15.2, "rust");
  drum(kit, 4.6, 16.1, "rustDark");
  drum(kit, -4.6, 13.2, "steelDark");

  // coal pile
  const coal = new PB(kit, 3.9, 0, 13.2, 0);
  for (let i = 0; i < 24; i++) {
    const r = 0.9 * Math.random();
    const a = Math.random() * Math.PI * 2;
    const s = 0.07 + Math.random() * 0.09;
    coal.b(s, s * 0.7, s, "black", Math.sin(a) * r, 0.05 + Math.random() * 0.22, Math.cos(a) * r * 0.7, Math.random() * 3);
  }
  // shovel
  const sh = new PB(kit, 3.0, 0, 13.8, 0.6);
  sh.b(0.03, 0.03, 1.1, "wood", 0, 0.55, 0.2);
  sh.b(0.2, 0.02, 0.26, "steelDark", 0, 0.06, -0.3);
  sh.g.rotation.z = 0.32;

  // chain hoist + gantry
  kit.box(5.4, 0.18, 0.18, "steelDark", 1, { x: 1, y: 4.3, z: 0 });
  kit.box(5.4, 0.12, 0.12, "steelDark", 1, { x: -1, y: 4.3, z: 0 });
  kit.pipe(
    [
      [-0.6, 4.3, -1.4],
      [-0.6, 2.2, -1.4],
    ],
    0.02,
    "steelPale",
    6
  );
  kit.cyl(0.09, 0.09, 0.16, "steelDark", -0.6, 2.1, -1.4, 10);
  kit.pipe(
    [
      [-0.6, 2.0, -1.4],
      [-0.6, 1.35, -1.4],
    ],
    0.014,
    "steelPale",
    6
  );
  kit.cyl(0.1, 0.1, 0.05, "steelDark", -0.6, 1.3, -1.4, 10);

  // parts rack
  shelf(kit, -4.9, 15.0, Math.PI / 2, 1.8, 1.7, 0.35, 4);
  ladder(kit, 1.2, 20.2, 2.6, 0.1);
}

function darkroomProps(kit: Kit) {
  const D = ROOMS.darkroom;
  // trays in the sink
  for (let i = 0; i < 3; i++) {
    const t = new PB(kit, -16.6 + i * 0.85, 0.7, -2.6, 0);
    t.b(0.5, 0.11, 0.4, "steelPale", 0, 0.06, 0);
    t.b(0.46, 0.01, 0.36, i === 0 ? "steelDark" : "steelPale", 0, 0.005, 0);
  }
  // enlarger
  const e = new PB(kit, -13.4, 0.8, -1.4, -1.2);
  e.b(0.3, 0.04, 0.3, "steelDark", 0, 0.02, 0);
  e.b(0.06, 0.9, 0.06, "steelPale", 0, 0.45, 0);
  e.b(0.26, 0.24, 0.26, "steelDark", 0, 0.94, 0.06);
  e.c(0.06, 0.06, 0.16, "bakelite", 0, 0.78, 0.06, 10);
  e.b(0.2, 0.03, 0.2, "steelPale", 0, 0.66, 0.06);
  // hanging wire + prints
  kit.pipe(
    [
      [-18.6, 2.25, -0.9],
      [-13.2, 2.25, -0.9],
    ],
    0.008,
    "steelPale",
    6
  );
  for (let i = 0; i < 7; i++) {
    const x = -18.2 + i * 0.72;
    const pr = new PB(kit, x, 1.72, -0.9, 0.1);
    pr.b(0.3, 0.38, 0.004, "paper", 0, 0, 0, 0, 0.4);
    pr.c(0.008, 0.008, 0.06, "steelPale", 0, 0.2, 0.02, 6);
  }
  // chemical shelves
  shelf(kit, -18.6, 1.6, Math.PI / 2, 1.6, 1.9, 0.32, 4);
  for (let i = 0; i < 10; i++) {
    const bcol = i % 3 === 0 ? "vaseline" : "black";
    void bcol;
    kit.cyl(0.04, 0.045, 0.16 + (i % 3) * 0.04, "glassDirty", -18.5, 1.0 + (i % 4) * 0.36, -2.0 + (i % 5) * 0.35, 8);
  }
  // icebox
  const ice = new PB(kit, -12.6, 0, 2.4, -0.4);
  ice.b(0.7, 1.0, 0.6, "steelPale", 0, 0.5, 0);
  ice.b(0.66, 0.44, 0.02, "steelDark", 0, 0.72, 0.31);
  ice.b(0.1, 0.03, 0.03, "brass", 0.18, 0.72, 0.33);
  // stool
  const st = new PB(kit, -15.0, 0, -1.6, 0.3);
  st.c(0.17, 0.17, 0.05, "wood", 0, 0.62, 0, 12);
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3;
    st.b(0.03, 0.62, 0.03, "wood", Math.sin(a) * 0.12, 0.31, Math.cos(a) * 0.12).rotation.z = Math.sin(a) * 0.08;
  }
  // timer clock
  const cl = new PB(kit, -13.6, 1.72, -2.9, 0.2);
  cl.b(0.24, 0.24, 0.06, "bakelite", 0, 0, 0, 0, 0.3);
  cl.c(0.1, 0.1, 0.01, "paper", 0, 0, 0.035, 14, { x: Math.PI / 2 });
  // safelight
  const safe = new PB(kit, -15.5, 2.55, 1.6, Math.PI);
  safe.b(0.3, 0.18, 0.18, "steelDark", 0, 0, 0);
  safe.b(0.22, 0.12, 0.02, "safelight", 0, 0, 0.1);
  void D;
}

function anechoicProps(kit: Kit) {
  const A = ROOMS.anechoic;
  // catwalk
  kit.box(1.2, 0.08, 7.6, "steelDark", 1, { x: 16.5, y: 0.04, z: 0 });
  // control desk
  table(kit, 18.8, -2.6, 1.8, 0.7, 0.78, 0);
  const desk = new PB(kit, 18.8, 0.78, -2.6, 0);
  desk.b(0.5, 0.34, 0.4, "steelDark", -0.4, 0.2, 0);
  desk.b(0.4, 0.26, 0.03, "glassDirty", -0.4, 0.2, 0.2);
  desk.b(0.3, 0.02, 0.24, "bulb", -0.4, 0.2, 0.19);
  desk.b(0.5, 0.18, 0.35, "bakelite", 0.4, 0.12, 0);
  for (let i = 0; i < 3; i++)
    desk.c(0.045, 0.045, 0.03, "steelPale", 0.28 + i * 0.13, 0.22, 0.02, 10, { x: Math.PI / 2 });
  // tape machine
  const tape = new PB(kit, 17.2, 0.78, 2.4, 0);
  tape.b(0.6, 0.22, 0.4, "steelDark", 0, 0.11, 0);
  for (const dx of [-0.14, 0.14]) tape.c(0.12, 0.12, 0.03, "bakelite", dx, 0.28, 0, 18, { x: Math.PI / 2 });
  // mic boom
  kit.pipe(
    [
      [16.4, 0.0, 1.0],
      [16.4, 1.9, 1.0],
      [15.6, 1.75, 0.4],
    ],
    0.02,
    "steelDark",
    8
  );
  const mic = new PB(kit, 15.45, 1.7, 0.3, 0.4);
  mic.c(0.035, 0.035, 0.16, "steelPale", 0, 0, 0, 10, { x: Math.PI / 2 });
  // fork case
  const fc = new PB(kit, 19.4, 1.6, 1.4, 0);
  fc.b(0.5, 0.1, 0.3, "leather", 0, 0, 0);
  fc.b(0.46, 0.03, 0.26, "felt", 0, 0.05, 0);
  for (let i = 0; i < 4; i++) {
    fc.b(0.02, 0.18, 0.02, "steelPale", -0.16 + i * 0.1, 0.12, 0);
    fc.b(0.05, 0.03, 0.02, "steelPale", -0.16 + i * 0.1, 0.21, 0);
  }
  // caged work lamps
  for (const [x, z] of [
    [13.6, -3.2],
    [19.6, 3.0],
  ]) {
    kit.pipe(
      [
        [x, 0, z],
        [x, 2.4, z],
      ],
      0.018,
      "steelDark",
      6
    );
    const l = new PB(kit, x, 2.4, z, 0);
    l.c(0.16, 0.16, 0.2, "steelPale", 0, 0, 0, 14);
    l.b(0.2, 0.06, 0.2, "bulb", 0, -0.11, 0);
  }
  void A;
}

function domeProps(kit: Kit) {
  const D = ROOMS.dome;
  // star projector / armillary sphere on a cast pedestal
  const o = new PB(kit, 0.3, D.floor, D.cz + 0.4, 0);
  o.c(0.34, 0.46, 0.12, "brassDark", 0, 0.06, 0, 20);
  o.c(0.2, 0.24, 0.5, "brassDark", 0, 0.36, 0, 16);
  o.c(0.045, 0.045, 0.34, "brass", 0, 0.72, 0, 12);
  o.c(0.09, 0.09, 0.09, "brass", 0, 0.89, 0, 14);
  // three nested rings, tilted, like a real armillary
  const ringDefs: [number, number, number][] = [
    [0.30, 0.0, 0.0],
    [0.24, Math.PI / 2, 0.24],
    [0.19, 0.35, -0.5],
  ];
  for (const [r, rz, rx] of ringDefs) {
    const t = o.t(r, 0.007, "brass", 0, 0.9, 0, 0);
    t.rotation.set(Math.PI / 2 + rx, 0, rz);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8;
    o.s(0.014, "brass", Math.sin(a) * 0.3, 0.9 + Math.cos(a) * 0.22, Math.cos(a) * 0.06, 6);
  }
  // desk + log
  table(kit, -2.2, -16.6, 1.4, 0.8, 0.78, 0.2, "wood");
  const lg = new PB(kit, -2.2, 0.79, -16.6, 0.2);
  lg.b(0.34, 0.06, 0.26, "leather", 0, 0.03, 0);
  lg.b(0.32, 0.02, 0.24, "paper", 0, 0.065, 0);
  // gooseneck lamp
  const gl = new PB(kit, -1.7, 0.78, -16.3, 0);
  gl.c(0.09, 0.1, 0.03, "steelDark", 0, 0.01, 0, 12);
  gl.c(0.012, 0.012, 0.6, "steelDark", 0, 0.3, 0, 6);
  gl.c(0.12, 0.06, 0.12, "steelPale", 0, 0.62, 0.06, 12);
  // pigeonholes
  const ph = new PB(kit, 2.9, D.floor, -16.6, -Math.PI / 2);
  ph.b(0.28, 1.5, 1.3, "wood", 0, 0.75, 0, 0, 1.2);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      ph.b(0.24, 0.3, 0.28, i % 2 ? "wood" : "black", 0.03, 0.2 + j * 0.34, -0.48 + i * 0.32);
  // telescope on a pier
  const tele = new PB(kit, -2.6, D.floor, -14.2, 0.6);
  tele.c(0.16, 0.2, 1.1, "steelDark", 0, 0.55, 0, 14);
  tele.c(0.13, 0.13, 1.5, "brassDark", 0, 1.6, 0.1, 18, { x: 0.9 });
  tele.c(0.16, 0.13, 0.1, "brass", 0, 1.9, 0.68, 16, { x: 0.9 });
  // night sky beyond the slit
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 7),
    new THREE.MeshBasicMaterial({ color: 0x05080f })
  );
  sky.position.set(0, 7.4, -21.6);
  kit.root.add(sky);
  const stars = new THREE.Points(
    (() => {
      const g = new THREE.BufferGeometry();
      const n = 260;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 8;
        pos[i * 3 + 1] = 4.6 + Math.random() * 5;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
      }
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      return g;
    })(),
    new THREE.PointsMaterial({ color: 0xb9cbe8, size: 0.018, sizeAttenuation: true })
  );
  stars.position.set(0, 0, -21.4);
  kit.root.add(stars);

  // canvas cover crank on the north slit
  const cr = new PB(kit, 0, 5.1, -18.4, 0);
  cr.c(0.03, 0.03, 0.5, "steelPale", 0, 0, 0, 8, { z: Math.PI / 2 });
  cr.t(0.12, 0.02, "steelPale", 0.25, 0, 0, 0);
}

function tunnelProps(kit: Kit) {
  const y = ROOMS.tunnelY;
  // junction box
  const jb = new PB(kit, -16.8, y + 1.2, 4.0, Math.PI / 2);
  jb.b(0.5, 0.7, 0.18, "steelDark", 0, 0, 0);
  for (let i = 0; i < 6; i++) jb.b(0.06, 0.1, 0.02, "bakelite", -0.18 + (i % 3) * 0.18, 0.16 - Math.floor(i / 3) * 0.24, 0.1);
  // satchel on the floor
  const sat = new PB(kit, -15.9, y + 0.05, 9.0, 0.7);
  sat.b(0.42, 0.3, 0.22, "leather", 0, 0.15, 0, 0, 0.6);
  sat.b(0.3, 0.05, 0.2, "leather", 0, 0.32, 0);
  sat.b(0.04, 0.3, 0.04, "steelPale", -0.1, 0.3, 0);
  // crates + debris
  crate(kit, 2.2, y + 0.1, 14.4, 0.5, 0.3);
  crate(kit, 2.6, y + 0.1, 15.4, 0.42, -0.4);
  // caged lamps
  for (const [x, z] of [
    [2.6, 14.2],
    [-6.0, 15.1],
    [-16.1, 4.0],
  ]) {
    kit.box(0.2, 0.24, 0.2, "steelDark", 1, { x, y: y + 1.85, z });
    kit.box(0.14, 0.16, 0.02, "bulb", 1, { x, y: y + 1.85, z: z + 0.1 });
  }
}
