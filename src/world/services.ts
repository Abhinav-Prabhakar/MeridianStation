import * as THREE from "three";
import type { Kit } from "../core/kit";
import { ZONES } from "./layout";

/**
 * Building services.
 *
 * Real plant rooms are not empty boxes: there is a copper conduit loop running
 * the walls at shoulder height, a bundle of black iron pipes under every
 * ceiling, junction boxes with lid screws, air bricks, drop cables. That
 * clutter is the single cheapest way to make an interior read as *built*
 * rather than *modelled*, because it breaks every long clean line with a
 * repeating rhythm of small shadows.
 *
 * Everything here is real geometry (not decals), so it casts and receives
 * shadow, and it is generated from each zone's own floor polygon — inset by a
 * little — so the runs follow the room exactly.
 */

/** Move every vertex toward the centroid, for a convex polygon. */
function inset(poly: number[][], d: number): number[][] {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of poly) {
    cx += x;
    cz += z;
  }
  cx /= poly.length;
  cz /= poly.length;
  return poly.map(([x, z]) => {
    const dx = cx - x;
    const dz = cz - z;
    const l = Math.hypot(dx, dz) || 1;
    return [x + (dx / l) * d, z + (dz / l) * d];
  });
}

function centroid(poly: number[][]): [number, number] {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p[0];
    z += p[1];
  }
  return [x / poly.length, z / poly.length];
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALL_INSET = 0.34;

export interface ServiceOptions {
  /** how much clutter this room gets, 0..1 */
  density?: number;
}

export function buildServices(kit: Kit, opts: ServiceOptions = {}) {
  const rnd = mulberry32(3311);
  let runs = 0;

  // Wall faces, tagged by kit.wall(), so a run can be cut where a doorway is:
  // a point with no wall behind it within 1.6 m is an opening, not a wall.
  kit.root.updateMatrixWorld(true);
  const wallMeshes: THREE.Object3D[] = [];
  kit.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.wall) wallMeshes.push(o);
  });
  const ray = new THREE.Raycaster();
  ray.far = 1.6;
  const probe = new THREE.Vector3();
  const away = new THREE.Vector3();
  const walled = (x: number, z: number, y: number, cx: number, cz: number) => {
    away.set(x - cx, 0, z - cz);
    if (away.lengthSq() < 1e-6) return true;
    away.normalize();
    probe.set(x - away.x * 0.05, y, z - away.z * 0.05);
    ray.set(probe, away);
    return ray.intersectObjects(wallMeshes, false).length > 0;
  };

  for (const zone of ZONES) {
    // tunnels and the crawlspace keep their bare industrial look
    if (zone.id.startsWith("tunnel") || zone.id === "crawl") continue;
    const density = opts.density ?? 1;
    if (density <= 0) continue;

    const floorY = zone.floorY;
    const ceil = zone.ceilY;
    const inner = inset(zone.poly, WALL_INSET);
    const [cx, cz] = centroid(zone.poly);

    // ---- wall conduit loop at shoulder height --------------------------
    const wallY = Math.min(ceil - 0.55, floorY + 2.42);
    if (wallY > floorY + 1.2) {
      // draw the loop as short spans and drop the ones over a doorway
      for (let e = 0; e < inner.length; e++) {
        const a = inner[e];
        const b = inner[(e + 1) % inner.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(2, Math.round(len / 0.45));
        let open: [number, number, number] | null = null;
        for (let i = 0; i < n; i++) {
          const t0 = i / n;
          const t1 = (i + 1) / n;
          const x0 = a[0] + (b[0] - a[0]) * t0;
          const z0 = a[1] + (b[1] - a[1]) * t0;
          const x1 = a[0] + (b[0] - a[0]) * t1;
          const z1 = a[1] + (b[1] - a[1]) * t1;
          const ok =
            walled((x0 + x1) / 2, (z0 + z1) / 2, wallY, cx, cz) &&
            walled(x0, z0, wallY, cx, cz);
          if (ok) {
            if (!open) open = [x0, wallY, z0];
          } else if (open) {
            const end: [number, number, number] = [x0, wallY, z0];
            if (Math.hypot(end[0] - open[0], end[2] - open[2]) > 0.3) {
              kit.pipe([open, end], 0.022, "copper", 7);
              runs++;
            }
            open = null;
          }
        }
        if (open) {
          const end: [number, number, number] = [b[0], wallY, b[1]];
          kit.pipe([open, end], 0.022, "copper", 7);
          runs++;
        }
      }

      // saddles holding the conduit off the wall, and a drop into a box
      for (let e = 0; e < inner.length; e++) {
        const a = inner[e];
        const b = inner[(e + 1) % inner.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.round(len / 1.5));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const x = a[0] + (b[0] - a[0]) * t;
          const z = a[1] + (b[1] - a[1]) * t;
          if (!walled(x, z, wallY, cx, cz)) continue;
          const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
          kit.box(0.055, 0.055, 0.03, "steelDark", 0.3, { x, y: wallY, z, ry, shadow: false });
        }
      }

      // junction boxes: one per corner on average, with a drop cable
      for (let e = 0; e < inner.length; e++) {
        if (rnd() > 0.42 * density) continue;
        const a = inner[e];
        const dx = cx - a[0];
        const dz = cz - a[1];
        const l = Math.hypot(dx, dz) || 1;
        const x = a[0] + (dx / l) * 0.05;
        const z = a[1] + (dz / l) * 0.05;
        const ry = Math.atan2(dx, dz);
        if (!walled(x, z, wallY, cx, cz)) continue;
        kit.box(0.22, 0.3, 0.09, "steelDark", 0.6, { x, y: wallY - 0.02, z, ry, shadow: false });
        kit.box(0.19, 0.26, 0.012, "steelPale", 0.5, {
          x: x + (dx / l) * 0.045,
          y: wallY - 0.02,
          z: z + (dz / l) * 0.045,
          ry,
          shadow: false,
        });
        // cable down to a socket
        kit.pipe(
          [
            [x, wallY - 0.16, z],
            [x + (dx / l) * 0.03, floorY + 0.85, z + (dz / l) * 0.03],
          ],
          0.012,
          "rubber",
          6
        );
        kit.box(0.1, 0.15, 0.05, "bakelite", 0.3, {
          x: x + (dx / l) * 0.03,
          y: floorY + 0.8,
          z: z + (dz / l) * 0.03,
          ry,
          shadow: false,
        });
      }
    }

    // ---- ceiling pipe bundle -------------------------------------------
    if (ceil - floorY > 2.6) {
      const n = zone.id === "rotunda" ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 0.28;
        const y = ceil - 0.3 - (i % 2) * 0.06;
        const pts = inset(zone.poly, WALL_INSET + 0.55 + i * 0.05).map(
          ([x, z]) => [x + off * 0.4, y, z + off * 0.4] as [number, number, number]
        );
        kit.pipe(pts.concat([pts[0]]), i === 1 ? 0.062 : 0.042, i === 2 ? "rustDark" : "steelDark", 8);
        runs++;
        // hangers
        for (let e = 0; e < pts.length; e++) {
          const a = pts[e];
          kit.box(0.03, 0.3, 0.03, "steelDark", 0.4, {
            x: a[0],
            y: y + 0.16,
            z: a[2],
            shadow: false,
          });
        }
      }
    }

    // ---- air bricks, low on the wall, one per long run -----------------
    if (zone.id !== "rotunda") {
      for (let e = 0; e < inner.length; e++) {
        if (rnd() > 0.34 * density) continue;
        const a = inner[e];
        const b = inner[(e + 1) % inner.length];
        const t = 0.3 + rnd() * 0.4;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        const dx = cx - x;
        const dz = cz - z;
        const l = Math.hypot(dx, dz) || 1;
        const ry = Math.atan2(dx, dz);
        kit.box(0.46, 0.3, 0.05, "steelDark", 0.6, { x, y: floorY + 0.36, z, ry, shadow: false });
        for (let k = 0; k < 5; k++) {
          kit.box(0.36, 0.022, 0.06, "black", 0.3, {
            x: x + (dx / l) * 0.012,
            y: floorY + 0.26 + k * 0.05,
            z: z + (dz / l) * 0.012,
            ry,
            shadow: false,
          });
        }
      }
    }
  }

  return runs;
}
