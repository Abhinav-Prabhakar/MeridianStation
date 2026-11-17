import * as THREE from "three";
import { state, type Ctx } from "../state";
import { brassPlate, box, cyl, mesh, paperLabel, token } from "./common";

/**
 * Anechoic Chamber — the resonance rig.
 *
 * Hold the knob to sweep the oscillator. The room answers when the tone sits
 * in its null; the meter and the readout make it solvable with sound off.
 */

const TARGET = 601.6;
const TOL = 1.0;
const MIN_F = 200;
const MAX_F = 900;

export function buildAnechoic(ctx: Ctx) {
  const { kit, interact, ui, audio } = ctx;

  const console_ = new THREE.Group();
  console_.position.set(20.72, 1.28, 0);
  console_.rotation.y = -Math.PI / 2;
  kit.root.add(console_);

  console_.add(box(kit, 0.94, 0.66, 0.18, "bakelite", 0, 0, 0.02));
  console_.add(box(kit, 1.0, 0.06, 0.24, "steelDark", 0, 0.36, 0.03));
  console_.add(box(kit, 1.0, 0.05, 0.24, "steelDark", 0, -0.34, 0.03));
  console_.add(box(kit, 0.9, 0.5, 0.02, "steelDark", 0, 0, 0.115));

  // ---- display ---------------------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;
  const g2 = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  let freq = 300;
  const drawDisplay = () => {
    g2.fillStyle = "#0a0c09";
    g2.fillRect(0, 0, 320, 96);
    g2.strokeStyle = "rgba(120,110,70,0.25)";
    g2.lineWidth = 2;
    g2.strokeRect(4, 4, 312, 88);
    const locked = Math.abs(freq - TARGET) <= TOL;
    g2.fillStyle = locked ? "#8dffb0" : "#ffb454";
    g2.font = '600 58px "Courier New", monospace';
    g2.textAlign = "right";
    g2.fillText(freq.toFixed(1), 240, 70);
    g2.font = '600 26px "Courier New", monospace';
    g2.textAlign = "left";
    g2.fillText("Hz", 252, 70);
    g2.font = '16px "Courier New", monospace';
    g2.fillStyle = "rgba(200,190,150,0.5)";
    g2.fillText("OSCILLATOR B", 16, 28);
    tex.needsUpdate = true;
  };
  drawDisplay();

  const screen = mesh(
    kit,
    new THREE.PlaneGeometry(0.4, 0.12),
    new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.5,
      roughness: 0.35,
    }),
    0.18,
    0.16,
    0.128
  );
  screen.castShadow = false;
  console_.add(screen);

  // ---- knob ------------------------------------------------------------
  const knob = new THREE.Group();
  knob.position.set(-0.28, -0.05, 0.13);
  console_.add(knob);
  knob.add(cyl(kit, 0.085, 0.05, "steelDark", 0, 0, 0.02, 20, { x: Math.PI / 2 }));
  knob.add(cyl(kit, 0.07, 0.06, "bakeliteBrown", 0, 0, 0.045, 20, { x: Math.PI / 2 }));
  const pointer = box(kit, 0.012, 0.06, 0.012, "paper", 0, 0.04, 0.075);
  knob.add(pointer);

  // scale ring
  for (let i = 0; i <= 20; i++) {
    const a = -Math.PI * 0.75 + (i / 20) * Math.PI * 1.5;
    const t = box(kit, 0.006, 0.018, 0.004, i % 5 === 0 ? "paper" : "steelPale",
      Math.sin(a) * 0.115, Math.cos(a) * 0.115, 0.008);
    t.rotation.z = -a;
    console_.add(t);
    t.position.x += -0.28;
    t.position.y += -0.05;
  }

  // ---- meter -----------------------------------------------------------
  const needle = new THREE.Group();
  needle.position.set(0.2, -0.14, 0.13);
  console_.add(needle);
  needle.add(box(kit, 0.005, 0.075, 0.004, "rustDark", 0, 0.03, 0.01));
  needle.add(cyl(kit, 0.012, 0.01, "brass", 0, 0, 0.012, 12, { x: Math.PI / 2 }));

  const meterFace = paperLabel(
    kit,
    0.2,
    0.16,
    (g, W, H) => {
      g.fillStyle = "#2a2b26";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#e9e2cb";
      g.beginPath();
      g.arc(W / 2, H * 0.92, W * 0.42, Math.PI, 0);
      g.fill();
      g.strokeStyle = "#22201a";
      g.lineWidth = 2;
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        const r0 = W * 0.33;
        const r1 = i % 5 === 0 ? W * 0.42 : W * 0.38;
        g.beginPath();
        g.moveTo(W / 2 + Math.cos(a) * r0, H * 0.92 + Math.sin(a) * r0);
        g.lineTo(W / 2 + Math.cos(a) * r1, H * 0.92 + Math.sin(a) * r1);
        g.stroke();
      }
      g.fillStyle = "#7a1f16";
      g.beginPath();
      g.moveTo(W * 0.5, H * 0.92);
      g.lineTo(W * 0.5 - 6, H * 0.92 - W * 0.36);
      g.lineTo(W * 0.5 + 6, H * 0.92 - W * 0.36);
      g.closePath();
      g.fill();
      g.fillStyle = "#22201a";
      g.font = `${Math.round(W * 0.09)}px "Courier New", monospace`;
      g.textAlign = "center";
      g.fillText("NULL", W / 2, H * 0.42);
    },
    0.2,
    -0.14,
    0.09
  );
  console_.add(meterFace);

  const lockLampMat = new THREE.MeshStandardMaterial({
    color: 0x1b2a1c,
    emissive: 0x000000,
    roughness: 0.4,
  });
  const lockLamp = mesh(kit, new THREE.CircleGeometry(0.026, 16), lockLampMat, 0.36, 0.16, 0.13);
  lockLamp.castShadow = false;
  console_.add(lockLamp);

  // ---- interaction -----------------------------------------------------
  let holdAcc = 0;
  let lockedFor = 0;
  let engaged = false;

  const updateVisuals = () => {
    pointer.rotation.z = -((freq - 200) / 700) * Math.PI * 1.5 + Math.PI * 0.75;
    const d = Math.abs(freq - TARGET);
    const swing = Math.min(1, d / 22);
    needle.rotation.z = swing * 0.95 - 0.48;
    drawDisplay();
  };
  updateVisuals();

  let knobEntry: any;
  knobEntry = interact.add({
    root: knob,
    label: "Resonance knob",
    verb: "Sweep (hold)",
    enabled: () => !state.channels.B,
    // a tap is a fine step; holding sweeps the dial
    use: () => {
      freq += 0.4;
      if (freq > MAX_F) freq = MIN_F;
      updateVisuals();
      audio.detent();
    },
    hold: (dt) => {
      holdAcc += dt;
      freq += 26 * dt;
      if (freq > MAX_F) freq = MIN_F;
      updateVisuals();
      if (Math.random() < dt * 12) audio.detent();
    },
    update: (dt) => {
      engaged = ctx.interact.current === knobEntry;
      if (state.channels.B) {
        audio.oscOff();
        return;
      }
      if (engaged) audio.oscOn(freq);
      else audio.oscOff();

      // pass through the null and the chamber takes the tone
      const d = Math.abs(freq - TARGET);
      if (d <= TOL) {
        lockedFor += dt;
        if (lockedFor > 0.02) {
          state.channels.B = true;
          lockLampMat.emissive.setHex(0x35ff72);
          lockLampMat.emissiveIntensity = 1.6;
          audio.relay();
          audio.clunk();
          ctx.changed();
          ui.toast("The chamber takes the tone. <em>Channel B is live.</em>", 5200);
          audio.oscOff();
        }
      } else {
        lockedFor = 0;
        lockLampMat.emissive.setHex(0x000000);
      }
    },
  });
  void knobEntry;

  // ---- token B, released when the chamber takes the tone -----------------
  const tokenB = new THREE.Group();
  tokenB.position.set(20.56, 1.67, 0.62);
  tokenB.rotation.x = -Math.PI / 2;
  tokenB.visible = false;
  kit.root.add(tokenB);
  tokenB.add(token(kit, "triangle", "2"));

  interact.add({
    root: tokenB,
    label: "Brass token · B",
    verb: "Take",
    enabled: () => state.channels.B && !state.carried.has("Token B"),
    use: () => {
      tokenB.visible = false;
      state.carried.add("Token B");
      audio.success();
      ctx.changed();
      ui.toast("Token B — <em>stamped 2</em>. A channel wakes in the wall.", 5200);
    },
    update: () => {
      if (state.channels.B && !state.carried.has("Token B")) tokenB.visible = true;
    },
  });

  // ---- plate -----------------------------------------------------------
  brassPlate(
    kit,
    0.5,
    0.18,
    ["CHAMBER NULL", "601.6 Hz", "MEASURED IV.61"],
    20.74,
    2.05,
    0,
    -Math.PI / 2
  );

  // a scope: green trace that blooms near the null
  const scope = new THREE.Group();
  scope.position.set(20.7, 1.05, -1.5);
  scope.rotation.y = -Math.PI / 2;
  kit.root.add(scope);
  scope.add(box(kit, 0.44, 0.34, 0.22, "steelDark", 0, 0, 0));
  const scopeFace = paperLabel(
    kit,
    0.34,
    0.24,
    (g, W, H) => {
      g.fillStyle = "#08110b";
      g.fillRect(0, 0, W, H);
      g.strokeStyle = "rgba(80,220,130,0.32)";
      g.lineWidth = 1;
      for (let x = 0; x < W; x += 12) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      }
      for (let y = 0; y < H; y += 12) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      g.strokeStyle = "#6bffa0";
      g.lineWidth = 3;
      g.beginPath();
      for (let x = 0; x < W; x++) {
        const y = H / 2 + Math.sin(x * 0.06) * H * 0.22;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    },
    0,
    0,
    0.115
  );
  scope.add(scopeFace);
  void scopeFace;

  // reset the console if it is ever re-entered after the puzzle
  interact.add({
    root: console_,
    label: "Resonance oscillator",
    verb: "Inspect",
    enabled: () => state.channels.B,
    use: () => ui.toast("The needle rests at 601.6. <em>The relay is held in.</em>", 3200),
  });
}
