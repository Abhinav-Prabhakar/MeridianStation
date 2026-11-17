import * as THREE from "three";
import { state, type Ctx } from "../state";
import { brassPlate, box, canvasTex, cyl, mesh, paperLabel, token } from "./common";

/**
 * Boiler & Machine Room.
 *
 * Four valves, four pressures. Open them highest pressure first, or the boiler
 * dumps and resets. The room also holds the crank handle and the oil.
 */

const VALVES: { id: string; bar: number }[] = [
  { id: "A", bar: 1.8 },
  { id: "B", bar: 3.2 },
  { id: "C", bar: 0.6 },
  { id: "D", bar: 2.4 },
];

/** highest pressure first */
const ORDER = [...VALVES].sort((a, b) => b.bar - a.bar).map((v) => v.id);

export function buildMachine(ctx: Ctx) {
  const { kit, interact, ui, audio } = ctx;

  const manifold = new THREE.Group();
  manifold.position.set(5.34, 1.2, 15.5);
  manifold.rotation.y = -Math.PI / 2;
  kit.root.add(manifold);

  manifold.add(box(kit, 2.0, 1.0, 0.16, "steelDark", 0, 0, 0));
  manifold.add(box(kit, 1.92, 0.92, 0.04, "steel", 0, 0, 0.1));
  manifold.add(box(kit, 2.1, 0.08, 0.22, "rustDark", 0, 0.52, 0.02));
  manifold.add(box(kit, 2.1, 0.08, 0.22, "rustDark", 0, -0.52, 0.02));

  const plates: THREE.Mesh[] = [];
  void plates;

  const opened: Record<string, boolean> = { A: false, B: false, C: false, D: false };
  const progress: string[] = [];
  let blowOff = 0;

  const wheelHubs: { g: THREE.Group; target: number; spin: number }[] = [];

  VALVES.forEach((v, i) => {
    const lx = -0.72 + i * 0.48;

    const wheel = new THREE.Group();
    wheel.position.set(lx, 0.06, 0.16);
    manifold.add(wheel);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.016, 8, 24), kit.m("rustDark"));
    ring.castShadow = true;
    wheel.add(ring);
    for (let k = 0; k < 4; k++) {
      const sp = box(kit, 0.014, 0.23, 0.014, "rustDark", 0, 0, 0);
      sp.rotation.z = (k * Math.PI) / 4;
      wheel.add(sp);
    }
    wheel.add(cyl(kit, 0.03, 0.06, "steelDark", 0, 0, 0.02, 12, { x: Math.PI / 2 }));
    wheelHubs.push({ g: wheel, target: 0, spin: 0 });

    // letter plate
    const plate = brassPlate(kit, 0.09, 0.05, [v.id], lx, 0.33, 0.13);
    manifold.add(plate);

    // pressure gauge
    const gx = lx;
    const face = mesh(
      kit,
      new THREE.PlaneGeometry(0.17, 0.17),
      new THREE.MeshStandardMaterial({
        map: gaugeTex(v.bar),
        roughness: 0.55,
        metalness: 0.0,
      }),
      gx,
      -0.3,
      0.135
    );
    face.castShadow = false;
    manifold.add(face);
    manifold.add(cyl(kit, 0.095, 0.03, "brass", gx, -0.3, 0.11, 20, { x: Math.PI / 2 }));

    interact.add({
      root: wheel,
      label: `Valve ${v.id}`,
      verb: opened[v.id] ? "Open" : "Turn",
      enabled: () => !opened[v.id] && !state.channels.C,
      use: () => {
        if (blowOff > 0) return;
        const expected = ORDER[progress.length];
        if (v.id === expected) {
          opened[v.id] = true;
          progress.push(v.id);
          wheelHubs[i].spin += Math.PI * 2;
          audio.steam(0.7);
          audio.click();
          if (progress.length === ORDER.length) {
            state.channels.C = true;
            ctx.changed();
            audio.thunk();
            ui.toast("Full pressure. <em>The generator takes the load. Channel C is live.</em>", 5600);
          } else {
            ui.toast(`<em>Valve ${v.id}</em> open. The needle climbs.`, 2600);
          }
        } else {
          blowOff = 2.2;
          audio.steam(1.6);
          audio.thunk();
          for (const k of Object.keys(opened)) opened[k] = false;
          progress.length = 0;
          for (const h of wheelHubs) h.spin -= Math.PI * 2;
          ui.toast(
            "<em>The boiler dumps.</em> Every valve slams shut. <em>Read the gauges.</em>",
            5200
          );
        }
      },
      update: (dt) => {
        const h = wheelHubs[i];
        h.g.rotation.z += h.spin * Math.min(1, dt * 3);
        h.spin *= 1 - Math.min(1, dt * 3);
        if (blowOff > 0) blowOff -= dt;
      },
    });
  });

  // warning plate
  brassPlate(
    kit,
    0.66,
    0.2,
    ["VALVE ORDER", "BY PRESSURE", "HIGHEST FIRST"],
    5.3,
    1.96,
    15.5,
    -Math.PI / 2
  );

  // ---- crank handle on a peg ------------------------------------------
  const crank = new THREE.Group();
  crank.position.set(5.3, 1.35, 13.1);
  crank.rotation.y = -Math.PI / 2;
  kit.root.add(crank);
  crank.add(box(kit, 0.05, 0.42, 0.05, "steelPale", 0, 0, 0.04));
  crank.add(box(kit, 0.2, 0.05, 0.05, "steelPale", 0.09, 0.19, 0.04));
  crank.add(cyl(kit, 0.028, 0.07, "brassDark", 0, -0.2, 0.04, 12, { x: Math.PI / 2 }));
  crank.add(box(kit, 0.06, 0.06, 0.03, "rustDark", 0, 0.02, 0.02));

  interact.add({
    root: crank,
    label: "Crank handle",
    verb: "Take",
    enabled: () => !state.seen.crank,
    use: () => {
      state.seen.crank = true;
      state.carried.add("Crank handle");
      crank.visible = false;
      audio.click();
      ctx.changed();
      ui.toast("<em>Crank handle.</em> Heavy. It fits something.", 3200);
    },
  });

  // ---- oil can on the bench -------------------------------------------
  const oil = new THREE.Group();
  oil.position.set(-4.86, 0.9, 19.15);
  oil.rotation.y = 0.4;
  kit.root.add(oil);
  oil.add(cyl(kit, 0.07, 0.16, "steelPale", 0, 0.08, 0, 16));
  oil.add(cyl(kit, 0.02, 0.075, "brass", 0.03, 0.14, 0.05, 10, { z: -0.5 }));
  oil.add(box(kit, 0.09, 0.03, 0.09, "brassDark", 0, 0.005, 0));

  interact.add({
    root: oil,
    label: "Oil can",
    verb: "Take",
    enabled: () => !state.seen.oil,
    use: () => {
      state.seen.oil = true;
      state.carried.add("Oil can");
      oil.visible = false;
      audio.click();
      ctx.changed();
      ui.toast("<em>Oil can.</em> Half full.", 3000);
    },
  });

  // ---- token C, released when the boiler takes full pressure ------------
  const tokenC = new THREE.Group();
  tokenC.position.set(-3.02, 0.93, 19.2);
  tokenC.rotation.x = -Math.PI / 2;
  tokenC.visible = false;
  kit.root.add(tokenC);
  tokenC.add(token(kit, "wave", "9"));

  interact.add({
    root: tokenC,
    label: "Brass token · C",
    verb: "Take",
    enabled: () => state.channels.C && !state.carried.has("Token C"),
    use: () => {
      tokenC.visible = false;
      state.carried.add("Token C");
      audio.success();
      ctx.changed();
      ui.toast("Token C — <em>stamped 9</em>, still warm off the manifold.", 5200);
    },
    update: () => {
      if (state.channels.C && !state.carried.has("Token C")) tokenC.visible = true;
    },
  });

  // ---- pressure log ----------------------------------------------------
  const log = new THREE.Group();
  log.position.set(5.31, 1.5, 18.5);
  log.rotation.y = -Math.PI / 2;
  kit.root.add(log);
  log.add(box(kit, 0.34, 0.26, 0.02, "wood", 0, 0, 0));
  log.add(
    paperLabel(
      kit,
      0.3,
      0.22,
      (g, W, H) => {
        g.fillStyle = "#e5dcc4";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#1d1a12";
        g.font = `${Math.round(W * 0.1)}px "Courier New", monospace`;
        g.textAlign = "center";
        g.fillText("BOILER LOG", W / 2, H * 0.18);
        g.font = `${Math.round(W * 0.07)}px "Courier New", monospace`;
        g.fillText("do not rush", W / 2, H * 0.42);
        g.fillText("the valves", W / 2, H * 0.62);
        g.fillText("IV.61", W / 2, H * 0.84);
      },
      0,
      0,
      0.015
    )
  );
  void ui;
}

function gaugeTex(bar: number) {
  return canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = "#b9b09a";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#e6dcc2";
    g.beginPath();
    g.arc(W / 2, H / 2, W * 0.42, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#2a241a";
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = "#2a241a";
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
      const r0 = W * 0.3;
      const r1 = i % 2 === 0 ? W * 0.4 : W * 0.36;
      g.beginPath();
      g.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0);
      g.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1);
      g.stroke();
    }
    // needle
    const t = Math.min(1, bar / 4);
    const a = Math.PI * 0.75 + t * Math.PI * 1.5;
    g.strokeStyle = "#7a1f16";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(W / 2, H / 2);
    g.lineTo(W / 2 + Math.cos(a) * W * 0.33, H / 2 + Math.sin(a) * W * 0.33);
    g.stroke();
    g.fillStyle = "#2a241a";
    g.beginPath();
    g.arc(W / 2, H / 2, 6, 0, Math.PI * 2);
    g.fill();
    g.font = `${Math.round(W * 0.09)}px "Courier New", monospace`;
    g.textAlign = "center";
    g.fillText("BAR", W / 2, H * 0.78);
  });
}
