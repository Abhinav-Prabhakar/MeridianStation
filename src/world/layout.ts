/**
 * MERIDIAN — station layout.
 *
 * One source of truth. The shell builder, the walkable polygons, the light
 * rigs and the bake exporter all read from these numbers, so nothing drifts.
 *
 * +X = east, -Z = north, Y = up. Units are metres.
 */

export type Pt = [number, number];
export type Poly = Pt[];

export interface Zone {
  id: string;
  label: string;
  poly: Poly;
  floorY: number;
  ceilY: number;
  /** optional walking ramp: height interpolates along Z */
  ramp?: { z0: number; z1: number; y0: number; y1: number };
  /** approximate centre, used for light probes and audio */
  centre: Pt;
}

export const WALL_T = 0.24;
export const CORR_W = 2.4;

// ---- room extents -------------------------------------------------------
export const ROOMS = {
  rotunda: { apothem: 6.0, height: 5.5 },
  records: { x0: -5, x1: 5, z0: -20, z1: -12, h: 3.6 },
  anechoic: { x0: 12, x1: 21, z0: -4.5, z1: 4.5, h: 4.2 },
  machine: { x0: -5.5, x1: 5.5, z0: 12, z1: 21, h: 5.0 },
  darkroom: { x0: -19, x1: -12, z0: -3, z1: 3, h: 3.0 },
  dome: { cz: -15, apothem: 3.6, floor: 4.0, drum: 5.7, apex: 9.4 },
  stair: { x0: -4.9, x1: -3.5, z0: -18.6, z1: -13.2, top: 4.0 },
  landing: { x0: -5.0, x1: -2.4, z0: -16.0, z1: -13.0, y: 4.0 },
  tunnelY: -3.4,
  tunnelH: 2.2,
};

export function rect(x0: number, z0: number, x1: number, z1: number): Poly {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}

export function octagon(cx: number, cz: number, apothem: number): Poly {
  const R = apothem / Math.cos(Math.PI / 8);
  const pts: Poly = [];
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    pts.push([cx + R * Math.sin(a), cz - R * Math.cos(a)]);
  }
  return pts;
}

/** Bearing (radians, 0 = north/-Z) to a direction vector. */
export function bearing(a: number): Pt {
  return [Math.sin(a), -Math.cos(a)];
}

// ---- walkable zones -----------------------------------------------------
export const ZONES: Zone[] = [
  {
    id: "rotunda",
    label: "The Rotunda",
    poly: octagon(0, 0, ROOMS.rotunda.apothem),
    floorY: 0,
    ceilY: ROOMS.rotunda.height,
    centre: [0, 0],
  },
  {
    id: "corr_n",
    label: "North Corridor",
    poly: rect(-1.25, -5.9, 1.25, -12.1),
    floorY: 0,
    ceilY: 3.2,
    centre: [0, -9],
  },
  {
    id: "records",
    label: "Records & Cipher Room",
    poly: rect(-5, -12, 5, -20),
    floorY: 0,
    ceilY: ROOMS.records.h,
    centre: [0, -16],
  },
  {
    id: "stair",
    label: "Dome Stair",
    poly: rect(ROOMS.stair.x0, ROOMS.stair.z0, ROOMS.stair.x1, ROOMS.stair.z1),
    floorY: 0,
    ceilY: 7.5,
    ramp: { z0: ROOMS.stair.z0, z1: ROOMS.stair.z1, y0: 0, y1: ROOMS.stair.top },
    centre: [-4.2, -15.9],
  },
  {
    id: "landing",
    label: "Dome Landing",
    poly: rect(ROOMS.landing.x0, ROOMS.landing.z0, ROOMS.landing.x1, ROOMS.landing.z1),
    floorY: 4.0,
    ceilY: 6.6,
    centre: [-3.7, -14.5],
  },
  {
    id: "dome",
    label: "Observation Dome",
    poly: octagon(0, ROOMS.dome.cz, ROOMS.dome.apothem),
    floorY: 4.0,
    ceilY: ROOMS.dome.drum,
    centre: [0, -15],
  },
  {
    id: "corr_e",
    label: "East Corridor",
    poly: rect(5.9, -1.25, 12.1, 1.25),
    floorY: 0,
    ceilY: 3.2,
    centre: [9, 0],
  },
  {
    id: "anechoic",
    label: "Anechoic Chamber",
    poly: rect(12, -4.5, 21, 4.5),
    floorY: 0,
    ceilY: ROOMS.anechoic.h,
    centre: [16.5, 0],
  },
  {
    id: "corr_s",
    label: "South Corridor",
    poly: rect(-1.25, 5.9, 1.25, 12.1),
    floorY: 0,
    ceilY: 3.2,
    centre: [0, 9],
  },
  {
    id: "machine",
    label: "Boiler & Machine Room",
    poly: rect(-5.5, 12, 5.5, 21),
    floorY: 0,
    ceilY: ROOMS.machine.h,
    centre: [0, 16.5],
  },
  {
    id: "corr_w",
    label: "West Corridor",
    poly: rect(-12.1, -1.25, -5.9, 1.25),
    floorY: 0,
    ceilY: 3.2,
    centre: [-9, 0],
  },
  {
    id: "darkroom",
    label: "Darkroom & Photo Lab",
    poly: rect(-19, -3, -12, 3),
    floorY: 0,
    ceilY: ROOMS.darkroom.h,
    centre: [-15.5, 0],
  },
  {
    id: "tunnel_a",
    label: "Drainage Tunnel",
    poly: rect(1.6, 13.4, 3.6, 16.8),
    floorY: ROOMS.tunnelY,
    ceilY: ROOMS.tunnelY + ROOMS.tunnelH,
    centre: [2.6, 15.1],
  },
  {
    id: "tunnel_b",
    label: "Drainage Tunnel",
    poly: rect(-16.2, 13.4, 3.6, 16.8),
    floorY: ROOMS.tunnelY,
    ceilY: ROOMS.tunnelY + ROOMS.tunnelH,
    centre: [-6, 15.1],
  },
  {
    id: "tunnel_c",
    label: "Drainage Tunnel",
    poly: rect(-17.8, -1.2, -14.4, 15.0),
    floorY: ROOMS.tunnelY,
    ceilY: ROOMS.tunnelY + ROOMS.tunnelH,
    centre: [-16.1, 7],
  },
  {
    id: "crawl",
    label: "Crawlspace",
    poly: rect(-19.2, -1.1, -16.6, 1.1),
    floorY: ROOMS.tunnelY,
    ceilY: ROOMS.tunnelY + 1.1,
    centre: [-17.9, 0],
  },
];

export function zoneById(id: string): Zone {
  const z = ZONES.find((q) => q.id === id);
  if (!z) throw new Error("no zone " + id);
  return z;
}

/**
 * Walking height at a point, or null if outside the walkable set.
 *
 * Rooms stack vertically (the dome sits above Records, the tunnel below the
 * machine room), so the query is height-aware: only floors within a step of
 * `fromY` count. That keeps you on the storey you are actually standing on.
 */
export const STEP_UP = 0.62;

export function floorAt(x: number, z: number, fromY = Infinity): { y: number; zone: Zone } | null {
  let best: { y: number; zone: Zone } | null = null;
  for (const zn of ZONES) {
    if (!pointInPoly(x, z, zn.poly)) continue;
    let y = zn.floorY;
    if (zn.ramp) {
      const t = Math.min(1, Math.max(0, (z - zn.ramp.z0) / (zn.ramp.z1 - zn.ramp.z0)));
      y = zn.ramp.y0 + (zn.ramp.y1 - zn.ramp.y0) * t;
    }
    if (y > fromY + STEP_UP) continue;
    if (!best || y > best.y) best = { y, zone: zn };
  }
  return best;
}

export function pointInPoly(x: number, z: number, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0],
      zi = poly[i][1];
    const xj = poly[j][0],
      zj = poly[j][1];
    const hit = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Which zone the player is in (deepest / highest floor wins). */
export function zoneAt(x: number, z: number, fromY = Infinity): Zone | null {
  return floorAt(x, z, fromY)?.zone ?? null;
}

export const START = { x: 0, z: 4.3, yaw: 0 };
