import * as THREE from "three";
import { bearing } from "../../world/layout";
import {
  CHANNEL_DIGIT,
  DOOR_CODE,
  SYMBOL_OF,
  patchedCount,
  state,
  type ChannelId,
  type Ctx,
} from "../state";
import { drawSymbol } from "../docs";
import { brassPlate, box, cyl, mesh, paperLabel, tokenFace } from "./common";

/**
 * The blast door on the north-east face of the rotunda.
 *
 *   lamps      four, one per channel: dark → amber (live) → green (patched)
 *   sockets    four, stamped with the channel *symbols* only
 *   tokens     one brass disc per wing, stamped with symbol + figure
 *   crank      needs the handle, then oil, then eight full turns
 *   dial       four wheels; the order comes off the developed plate
 *
 * The board is also the code display: once all four tokens are seated, the
 * socket row reads 7 2 9 4 left to right, by symbol. The print says which
 * order to read them in.
 */

const LETTERS: ChannelId[] = ["A", "B", "C", "D"];
const TURNS = 8;

export function buildBlastDoor(ctx: Ctx) {
  const { kit, interact, ui, audio } = ctx;

  const dir = bearing(Math.PI / 4);
  const yaw = Math.atan2(-dir[0], -dir[1]);
  const g = new THREE.Group();
  g.position.set(dir[0] * 5.76, 0, dir[1] * 5.76);
  g.rotation.y = yaw;
  kit.root.add(g);

  // ---------------------------------------------------------------- shell
  g.add(box(kit, 3.0, 2.78, 0.12, "steelDark", 0, 1.39, -0.05));
  const leaf = box(kit, 2.3, 2.24, 0.16, "steel", 0, 1.3, 0.06);
  g.add(leaf);
  for (const y of [0.42, 1.3, 2.18]) g.add(box(kit, 2.12, 0.07, 0.03, "steelDark", 0, y, 0.155));
  for (let i = 0; i < 7; i++) {
    for (const s of [-1, 1]) {
      g.add(cyl(kit, 0.022, 0.026, "rustDark", s * 1.44, 0.22 + i * 0.36, 0.02, 10, { x: Math.PI / 2 }));
    }
  }
  // rivets down both edges of the leaf
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      g.add(cyl(kit, 0.019, 0.02, "steelPale", s * 1.09, 0.34 + i * 0.36, 0.145, 8, { x: Math.PI / 2 }));
    }
  }
  // hazard skirt + chevrons
  g.add(box(kit, 2.94, 0.2, 0.07, "rustDark", 0, 0.12, 0.055));
  for (let i = 0; i < 9; i++) {
    const mat = i % 2 === 0 ? "brassDark" : "black";
    g.add(box(kit, 0.13, 0.13, 0.012, mat, -1.28 + i * 0.32, 0.12, 0.095));
  }

  // bulkhead fixture above the frame (the light itself lives in the rig)
  g.add(cyl(kit, 0.1, 0.11, "steelDark", 0, 2.62, 0.06, 14, { x: Math.PI / 2 }));
  g.add(cyl(kit, 0.078, 0.04, "bulb", 0, 2.62, 0.12, 14, { x: Math.PI / 2 }));

  const title = brassPlate(kit, 0.9, 0.1, ["CHANNEL PATCHING", "BY SYMBOL ONLY"], 0, 1.94, 0.145);
  g.add(title);

  const crest = brassPlate(
    kit,
    0.98,
    0.36,
    ["MERIDIAN", "DEEP LISTENING STATION", "EST. 1962"],
    0,
    1.16,
    0.145
  );
  g.add(crest);

  // ---------------------------------------------------------------- lamps
  const lampMat: Record<string, THREE.MeshStandardMaterial> = {};
  const lampLens: Record<string, THREE.Mesh> = {};
  LETTERS.forEach((L, i) => {
    const x = -0.9 + i * 0.6;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x161512,
      emissive: new THREE.Color(0x000000),
      roughness: 0.35,
    });
    lampMat[L] = mat;
    g.add(cyl(kit, 0.062, 0.05, "brassDark", x, 2.28, 0.17, 14, { x: Math.PI / 2 }));
    const lens = mesh(kit, new THREE.CircleGeometry(0.044, 16), mat, x, 2.28, 0.198);
    lens.castShadow = false;
    g.add(lens);
    lampLens[L] = lens;
  });

  // -------------------------------------------------------------- sockets
  const tokenAt = (L: ChannelId) => `Token ${L}`;

  LETTERS.forEach((L, i) => {
    const x = -0.9 + i * 0.6;
    const socket = new THREE.Group();
    socket.position.set(x, 1.6, 0.15);
    g.add(socket);

    socket.add(cyl(kit, 0.072, 0.02, "brassDark", 0, 0, 0, 18, { x: Math.PI / 2 }));
    socket.add(cyl(kit, 0.054, 0.03, "black", 0, 0, 0.004, 16, { x: Math.PI / 2 }));

    // the symbol that is stamped beside the socket
    socket.add(
      paperLabel(
        kit,
        0.09,
        0.09,
        (c2, W, H) => {
          drawSymbol(c2, SYMBOL_OF[L], W / 2, H * 0.52, W * 0.34, "rgba(214,180,116,0.95)");
        },
        0,
        0.105,
        0.03
      )
    );

    const face = tokenFace(kit, SYMBOL_OF[L], CHANNEL_DIGIT[L], 0, 0, 0.02);
    face.parent?.remove(face);
    face.visible = false;
    socket.add(face);

    interact.add({
      root: socket,
      label: `Symbol socket · ${SYMBOL_OF[L]}`,
      verb: "Seat token",
      enabled: () => !state.patched[L],
      use: () => {
        if (!state.channels[L]) {
          audio.error();
          ui.toast("Dead socket. <em>No current on this channel yet.</em>", 3400);
          return;
        }
        if (!state.carried.has(tokenAt(L))) {
          audio.error();
          ui.toast(
            `A bare socket, stamped <em>${SYMBOL_OF[L]}</em>. You have no token to seat.`,
            3800
          );
          return;
        }
        state.patched[L] = true;
        state.carried.delete(tokenAt(L));
        face.visible = true;
        audio.relay();
        ctx.changed();
        const n = patchedCount();
        ui.toast(
          n === 4
            ? "<em>Four channels made up.</em> The board reads left to right. Now the crank."
            : `Token seated. <em>${n} of 4</em> channels live.`,
          4400
        );
      },
    });
  });

  // ---------------------------------------------------------------- crank
  const crankMount = new THREE.Group();
  crankMount.position.set(1.28, 1.05, 0.12);
  g.add(crankMount);
  crankMount.add(box(kit, 0.4, 0.56, 0.34, "steelDark", 0, 0, 0));
  crankMount.add(box(kit, 0.34, 0.06, 0.06, "rustDark", 0, 0.3, 0.02));
  crankMount.add(box(kit, 0.34, 0.06, 0.06, "rustDark", 0, -0.3, 0.02));
  crankMount.add(cyl(kit, 0.075, 0.06, "brassDark", 0, 0, 0.19, 16, { x: Math.PI / 2 }));
  const socketHole = box(kit, 0.062, 0.062, 0.02, "black", 0, 0, 0.225);
  crankMount.add(socketHole);

  const crank = new THREE.Group();
  crank.position.set(0, 0, 0.22);
  crank.visible = false;
  crankMount.add(crank);
  crank.add(box(kit, 0.055, 0.34, 0.055, "steelPale", 0, 0.17, 0));
  crank.add(box(kit, 0.24, 0.055, 0.055, "steelPale", 0.1, 0.34, 0));
  crank.add(cyl(kit, 0.03, 0.14, "bakeliteBrown", 0.205, 0.34, 0.02, 12, { x: Math.PI / 2 }));
  crank.add(cyl(kit, 0.035, 0.05, "brassDark", 0, 0, 0, 12, { x: Math.PI / 2 }));

  let held = 0;
  let turning = 0;
  let spinning = 0;

  const crankReady = () => patchedCount() === 4;

  interact.add({
    root: crankMount,
    label: "Door crank",
    verb: "Take hold (hold)",
    enabled: () => !state.doorOpen,
    use: () => {
      if (!crank.visible) {
        if (!state.carried.has("Crank handle")) {
          audio.error();
          ui.toast("A square socket, empty. <em>It wants a handle.</em>", 3400);
          return;
        }
        state.carried.delete("Crank handle");
        crank.visible = true;
        audio.click();
        ctx.changed();
        ui.toast("<em>Handle seated.</em> It turns a quarter and seizes.", 3600);
        return;
      }
      if (!state.oiled) {
        if (state.carried.has("Oil can")) {
          state.carried.delete("Oil can");
          state.oiled = true;
          audio.click();
          ctx.changed();
          ui.toast("Oil into the trunnion. <em>It frees.</em>", 3400);
        } else {
          audio.error();
          ui.toast("<em>Seized.</em> Fifty years of rust. It wants oil.", 3600);
        }
        return;
      }
      if (!crankReady()) {
        audio.error();
        ui.toast(
          `<em>The dog clutch is out.</em> ${patchedCount()} of 4 solenoids made up.`,
          3800
        );
      }
    },
    hold: (dt) => {
      if (!crank.visible || !state.oiled || !crankReady() || state.doorOpen) return;
      if (state.crankTurns >= TURNS) return;
      held += dt;
      spinning = Math.min(1, spinning + dt * 6);
      if (held < 0.62) return;
      held -= 0.62;
      state.crankTurns++;
      audio.detent();
      spinning = 1;
      if (state.crankTurns % 2 === 0) audio.click();
      if (state.crankTurns === TURNS) {
        state.solenoids = true;
        audio.thunk();
        audio.relay();
        ctx.changed();
        ui.toast("<em>Eight turns.</em> The bolts are drawn. The dial is live.", 6000);
      }
    },
    update: (dt) => {
      const target = (state.crankTurns * Math.PI) / 4;
      turning += (target - turning) * Math.min(1, dt * 7);
      crank.rotation.z = turning;
      spinning *= 1 - Math.min(1, dt * 3);
      void spinning;
      if (!crank.visible) held = 0;
    },
  });

  // -------------------------------------------------------- crank status
  const statusPlate = brassPlate(
    kit,
    0.36,
    0.1,
    ["8 TURNS", "TO DRAW BOLTS"],
    1.28,
    1.55,
    0.3
  );
  g.add(statusPlate);

  // ----------------------------------------------------------------- dial
  const dial = new THREE.Group();
  dial.position.set(-0.1, 0.86, 0.15);
  g.add(dial);
  dial.add(box(kit, 1.1, 0.34, 0.05, "steelDark", 0, 0, 0.01));
  dial.add(box(kit, 1.02, 0.26, 0.02, "bakelite", 0, 0, 0.04));

  const digits = [0, 0, 0, 0];
  const setDigit: ((d: number) => void)[] = [];

  for (let i = 0; i < 4; i++) {
    const wheel = new THREE.Group();
    wheel.position.set(-0.36 + i * 0.24, 0, 0.05);
    dial.add(wheel);
    wheel.add(cyl(kit, 0.085, 0.03, "brass", 0, 0, 0, 18, { x: Math.PI / 2 }));
    wheel.add(cyl(kit, 0.066, 0.036, "black", 0, 0, 0.014, 16, { x: Math.PI / 2 }));

    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 96;
    const g2 = c.getContext("2d")!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const set = (d: number) => {
      digits[i] = d;
      g2.fillStyle = "#0b0a08";
      g2.fillRect(0, 0, 96, 96);
      g2.fillStyle = "#f7ecd2";
      g2.font = '600 70px "Courier New", monospace';
      g2.textAlign = "center";
      g2.fillText(String(d), 48, 76);
      tex.needsUpdate = true;
    };
    set(0);
    setDigit.push(set);

    const face = mesh(
      kit,
      new THREE.PlaneGeometry(0.075, 0.075),
      new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.32,
        roughness: 0.6,
      }),
      0,
      0,
      0.033
    );
    face.castShadow = false;
    wheel.add(face);

    let acc = 0;
    interact.add({
      root: wheel,
      label: `Door dial ${i + 1}`,
      verb: "Turn (hold)",
      enabled: () => !state.doorOpen,
      use: () => {
        if (!state.solenoids) {
          audio.error();
          ui.toast("<em>The dial is dead.</em> Draw the bolts first.", 3000);
          return;
        }
        set((digits[i] + 1) % 10);
        audio.detent();
      },
      hold: (dt) => {
        if (!state.solenoids || state.doorOpen) return;
        acc += dt;
        while (acc > 0.12) {
          acc -= 0.12;
          set((digits[i] + 1) % 10);
          if (digits[i] === 0) audio.detent();
        }
      },
    });
  }

  // dial lever
  const lever = new THREE.Group();
  lever.position.set(0.62, 0, 0.05);
  dial.add(lever);
  lever.add(cyl(kit, 0.05, 0.04, "brassDark", 0, 0, 0, 16, { x: Math.PI / 2 }));
  const leverArm = box(kit, 0.035, 0.19, 0.035, "brass", 0, 0.09, 0.04);
  lever.add(leverArm);
  lever.add(cyl(kit, 0.03, 0.06, "bakeliteBrown", 0, 0.18, 0.06, 10, { x: Math.PI / 2 }));

  let leverT = 0;
  let leverTarget = 0;
  let leaving = false;

  interact.add({
    root: lever,
    label: "Dial lever",
    verb: "Pull",
    enabled: () => !state.doorOpen,
    use: () => {
      if (!state.solenoids) {
        audio.error();
        ui.toast("<em>Nothing behind it.</em> The bolts are still home.", 3200);
        return;
      }
      if (digits.join("") === DOOR_CODE) {
        leaving = true;
        leverTarget = -1.1;
        audio.thunk();
        ui.toast("<em>The bolts withdraw.</em>", 6000);
        ctx.fade(true);
        window.setTimeout(() => ctx.onEscape(), 2300);
      } else {
        audio.error();
        digits.forEach((_, i) => setDigit[i](0));
        leverTarget = 0.22;
        ui.toast("<em>No.</em> The wheels drop back to zero.", 3600);
        window.setTimeout(() => (leverTarget = 0), 600);
      }
    },
    update: (dt) => {
      leverT += (leverTarget - leverT) * Math.min(1, dt * 6);
      lever.rotation.z = leverT;
      if (leaving) {
        leaf.position.x += dt * 0.55;
        leaf.position.z -= dt * 0.5;
      }
    },
  });

  // ------------------------------------------------------------ the whole
  interact.add({
    root: leaf,
    label: "Blast door",
    verb: "Inspect",
    enabled: () => true,
    use: () => {
      const parts: string[] = [];
      if (!state.power) parts.push("Dead. <em>No power, no solenoids.</em>");
      else {
        parts.push(`<em>${patchedCount()} of 4</em> channels made up.`);
        if (!crank.visible) parts.push("The crank socket is empty.");
        else if (!state.oiled) parts.push("The crank is seized.");
        else parts.push(`Crank: <em>${state.crankTurns} of ${TURNS}</em> turns.`);
        if (state.solenoids) parts.push("The dial is live.");
      }
      ui.toast(parts.join(" "), 5000);
      audio.paper();
    },
  });

  // ------------------------------------------------------------- statuses
  function paintLamps() {
    LETTERS.forEach((L) => {
      const m = lampMat[L];
      if (state.patched[L]) {
        m.emissive.setHex(0x2cff77);
        m.emissiveIntensity = 1.9;
        (lampLens[L].material as THREE.MeshStandardMaterial).color.setHex(0x0d2417);
      } else if (state.channels[L]) {
        m.emissive.setHex(0xff9a34);
        m.emissiveIntensity = 1.35;
        (lampLens[L].material as THREE.MeshStandardMaterial).color.setHex(0x2a1a08);
      } else {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
        (lampLens[L].material as THREE.MeshStandardMaterial).color.setHex(0x161512);
      }
    });
  }
  paintLamps();

  // a slow pulse while the board is waiting on a channel: the lamps breathe
  let pulse = 0;
  interact.add({
    root: g,
    label: "Patching board",
    verb: "Inspect",
    enabled: () => false,
    use: () => undefined,
    update: (dt) => {
      pulse += dt;
      paintLamps();
      const k = 0.82 + Math.sin(pulse * 2.1) * 0.18;
      for (const L of LETTERS) {
        if (state.channels[L] && !state.patched[L]) lampMat[L].emissiveIntensity = 1.35 * k;
      }
      if (state.solenoids && !state.doorOpen) {
        for (const L of LETTERS) lampMat[L].emissiveIntensity = 1.9 * k;
      }
    },
  });

  void socketHole;
  void tokenFace;
}
