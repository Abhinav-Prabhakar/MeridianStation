import * as THREE from "three";
import { bearing } from "../../world/layout";
import { CIRCUITS, state, type Ctx } from "../state";
import { paperDoc } from "../docs";
import { brassPlate, box, cyl, mesh, paperLabel } from "./common";

/**
 * Act 1 — the fuse panel in the electrical cage.
 *
 * Four circuits, four ratings, four fuses hidden across the wings. The panel
 * says which *circuit* each holder serves; the schedule behind glass says which
 * rating that circuit wants. Throw the knife switch to close the mains.
 */
export function buildPower(ctx: Ctx) {
  const { kit, interact, ui, audio } = ctx;

  const dir = bearing((225 * Math.PI) / 180);
  const cx = dir[0] * 5.8;
  const cz = dir[1] * 5.8;
  const yaw = Math.atan2(-dir[0], -dir[1]);

  const g = new THREE.Group();
  g.position.set(cx, 1.62, cz);
  g.rotation.y = yaw;
  kit.root.add(g);

  g.add(box(kit, 1.4, 1.02, 0.08, "steelDark", 0, 0, 0));
  g.add(box(kit, 1.24, 0.88, 0.03, "bakelite", 0, 0, 0.055));
  g.add(box(kit, 1.16, 0.028, 0.02, "brassDark", 0, 0.37, 0.076));
  g.add(box(kit, 1.16, 0.028, 0.02, "brassDark", 0, -0.37, 0.076));

  const plate = brassPlate(kit, 0.46, 0.085, ["MAIN DISTRIBUTION"], 0, 0.41, 0.08);
  g.add(plate);

  const holderGroups: THREE.Group[] = [];

  CIRCUITS.forEach((c, i) => {
    const hx = -0.42 + (i % 2) * 0.84;
    const hy = 0.17 - Math.floor(i / 2) * 0.36;

    const holder = new THREE.Group();
    holder.position.set(hx, hy, 0.07);
    g.add(holder);
    holderGroups.push(holder);

    holder.add(cyl(kit, 0.05, 0.035, "steelPale", 0, 0, -0.01, 16, { x: Math.PI / 2 }));
    for (const s of [-1, 1]) holder.add(box(kit, 0.02, 0.072, 0.05, "brass", s * 0.062, 0, 0.008));
    holder.add(box(kit, 0.17, 0.032, 0.012, "steelDark", 0, -0.082, 0.018));

    const tag = paperLabel(
      kit,
      0.15,
      0.024,
      (c2, W, H) => {
        c2.fillStyle = "#e7dfc9";
        c2.fillRect(0, 0, W, H);
        c2.fillStyle = "#191712";
        c2.font = `600 ${Math.round(H * 0.7)}px "Courier New", monospace`;
        c2.textAlign = "center";
        c2.fillText(c.label, W / 2, H * 0.8);
      },
      0,
      -0.108,
      0.021
    );
    holder.add(tag);

    const seated = cyl(kit, 0.021, 0.09, "bakeliteBrown", 0, 0, 0.005, 12, { z: Math.PI / 2 });
    seated.visible = false;
    holder.add(seated);

    interact.add({
      root: holder,
      label: `${c.label} holder`,
      verb: "Insert fuse",
      enabled: () => !state.seated[c.id],
      use: () => {
        const want = c.rating;
        if (!state.found[want] || state.seated[c.id]) {
          audio.error();
          ui.toast(
            `The holder is stamped <em>${c.label}</em>. You have no <em>${want}A</em> fuse.`,
            3600
          );
          return;
        }
        state.seated[c.id] = true;
        state.carried.delete(`${want}A fuse`);
        seated.visible = true;
        audio.click();
        const left = CIRCUITS.filter((q) => !state.seated[q.id]).length;
        if (left === 0) {
          lever.visible = true;
          ui.toast("<em>Four holders loaded.</em> Throw the main switch.", 4000);
        } else {
          ui.toast(`<em>${want}A</em> seated in ${c.label.toLowerCase()}. ${left} to go.`, 3000);
        }
      },
      update: () => {
        seated.visible = state.seated[c.id];
      },
    });
  });

  // ---- knife switch -----------------------------------------------------
  const lever = new THREE.Group();
  lever.position.set(0.56, -0.06, 0.1);
  g.add(lever);
  const arm = box(kit, 0.045, 0.26, 0.045, "brass", 0, 0.11, 0.0);
  arm.rotation.x = -0.42;
  lever.add(arm);
  lever.add(mesh(kit, new THREE.SphereGeometry(0.036, 12, 10), "bakeliteBrown", 0, 0.24, 0.09));
  lever.add(box(kit, 0.13, 0.05, 0.13, "steelDark", 0, -0.02, 0.02));
  lever.visible = false;

  const ready = () => CIRCUITS.every((c) => state.seated[c.id]);
  interact.add({
    root: lever,
    label: "Main switch",
    verb: "Throw",
    enabled: () => ready() && !state.power,
    use: () => {
      audio.thunk();
      state.power = true;
      lever.rotation.x = -0.5;
      ctx.powerUp();
    },
  });

  // ---- the schedule, behind glass --------------------------------------
  const frame = new THREE.Group();
  frame.position.set(-1.02, 0.03, 0.02);
  frame.rotation.y = 0.05;
  g.add(frame);
  frame.add(box(kit, 0.42, 0.52, 0.035, "brassDark", 0, 0, 0));
  frame.add(
    paperLabel(
      kit,
      0.34,
      0.44,
      (c2, W, H) => {
        c2.fillStyle = "#e3dac2";
        c2.fillRect(0, 0, W, H);
        const rnd = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
        for (let i = 0; i < 500; i++) {
          c2.fillStyle = `rgba(120,96,58,${rnd(i) * 0.06})`;
          c2.fillRect(rnd(i + 99) * W, rnd(i + 7) * H, 2, 2);
        }
        c2.fillStyle = "#241f16";
        c2.font = `600 ${Math.round(W * 0.085)}px "Courier New", monospace`;
        c2.textAlign = "center";
        c2.fillText("CIRCUIT SCHEDULE", W / 2, H * 0.13);
        c2.textAlign = "left";
        c2.font = `${Math.round(W * 0.068)}px "Courier New", monospace`;
        let y = H * 0.3;
        for (const c of CIRCUITS) {
          c2.fillText(c.label, W * 0.1, y);
          c2.textAlign = "right";
          c2.fillText(`${c.rating}A`, W * 0.9, y);
          c2.textAlign = "left";
          y += H * 0.115;
        }
        c2.strokeStyle = "rgba(40,32,20,0.4)";
        c2.lineWidth = 3;
        c2.strokeRect(6, 6, W - 12, H - 12);
      },
      0,
      0,
      0.021
    )
  );
  frame.add(mesh(kit, new THREE.PlaneGeometry(0.36, 0.46), kit.m("glassDirty"), 0, 0, 0.03));

  interact.add({
    root: frame,
    label: "Circuit schedule",
    verb: "Read",
    enabled: () => true,
    use: () => {
      audio.paper();
      ui.inspect(
        paperDoc({
          heading: "Circuit Schedule",
          sub: "Meridian Station · Main Distribution Board",
          lines: [
            "## HOLDER ONE — LIGHTING",
            "# 5A",
            "",
            "## HOLDER TWO — MOTIVE",
            "# 10A",
            "",
            "## HOLDER THREE — INSTRUMENTS",
            "# 15A",
            "",
            "## HOLDER FOUR — HEATING",
            "# 20A",
            "",
            "--",
            "Spare elements are held in the workshop, the registry, the",
            "photographic store and the acoustic range.",
            "",
            "Replace like with like. Do not bridge a holder. The last man",
            "who bridged a holder is not with us.",
          ],
          stamp: { text: "REV C · 1961", x: 590, y: 906, rot: -8 },
          footer: "POST AT THE BOARD · DO NOT REMOVE",
        }),
        "Circuit schedule"
      );
    },
  });

  void holderGroups;
  void ui;
}

// --------------------------------------------------------------------- fuses
export function buildFuses(ctx: Ctx) {
  const { kit, interact, ui, audio } = ctx;

  const spots: {
    rating: string;
    x: number;
    y: number;
    z: number;
    where: string;
    blown?: boolean;
  }[] = [
    { rating: "10", x: -4.0, y: 0.94, z: 19.35, where: "machine-room workbench" },
    { rating: "15", x: -3.86, y: 0.31, z: -18.86, where: "floor beside the catalogue" },
    { rating: "20", x: -12.55, y: 0.9, z: 2.52, where: "darkroom icebox" },
    { rating: "5", x: 20.45, y: 1.02, z: -3.35, where: "ledge between the wedges" },
    { rating: "25", x: -3.02, y: 0.92, z: 19.52, where: "toolbox", blown: true },
    { rating: "8", x: 2.0, y: 0.64, z: 2.82, where: "crate", blown: true },
  ];

  for (const f of spots) {
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    g.rotation.y = (f.x + f.z) * 1.7;
    kit.root.add(g);
    g.add(cyl(kit, 0.021, 0.086, f.blown ? "black" : "bakeliteBrown", 0, 0, 0, 12, { z: Math.PI / 2 }));
    for (const s of [-1, 1])
      g.add(cyl(kit, 0.023, 0.014, f.blown ? "rustDark" : "brass", s * 0.05, 0, 0, 12, { z: Math.PI / 2 }));

    const id = f.blown ? `blown-${f.rating}` : f.rating;
    interact.add({
      root: g,
      label: f.blown ? `Blown ${f.rating}A fuse` : `${f.rating}A fuse`,
      verb: "Take",
      enabled: () => !state.found[id] && !state.seated[f.rating],
      use: () => {
        state.found[id] = true;
        if (f.blown) {
          state.carried.add(`Blown ${f.rating}A fuse`);
          ui.toast("Charred through. <em>No use to anyone.</em>", 3000);
        } else {
          state.carried.add(`${f.rating}A fuse`);
          audio.click();
          ui.toast(`<em>${f.rating}A fuse</em>, from the ${f.where}.`, 3200);
        }
        g.visible = false;
      },
    });
  }
}
