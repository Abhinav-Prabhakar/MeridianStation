import * as THREE from "three";
import { ROOMS } from "../../world/layout";
import { ROSTER, SAFE_CODE, state, type Ctx } from "../state";
import { paperDoc } from "../docs";
import { brassPlate, box, cyl, mesh, paperLabel, token } from "./common";

/**
 * Records & Cipher Room.
 *
 * Shift order (roster) → surnames → catalogue cards → one figure per code →
 * four digits on the safe. The safe holds the symbol memo and the first
 * channel token.
 */
export function buildRecords(ctx: Ctx) {
  const { kit, interact, ui, audio } = ctx;
  const R = ROOMS.records;

  // ---------------------------------------------------------------- roster
  const roster = new THREE.Group();
  roster.position.set(R.x0 + 0.14, 1.55, -14.1);
  roster.rotation.y = Math.PI / 2;
  kit.root.add(roster);
  roster.add(box(kit, 1.1, 0.8, 0.05, "wood", 0, 0, 0));
  roster.add(box(kit, 1.0, 0.7, 0.01, "felt", 0, 0, 0.03));
  roster.add(
    paperLabel(
      kit,
      1.0,
      0.7,
      (g, W, H) => {
        g.fillStyle = "#e8e0c8";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#1e1a12";
        g.font = `600 ${Math.round(W * 0.045)}px "Courier New", monospace`;
        g.textAlign = "center";
        g.fillText("WATCH BILL", W / 2, H * 0.1);
        g.strokeStyle = "rgba(30,26,18,0.4)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(W * 0.08, H * 0.14);
        g.lineTo(W * 0.92, H * 0.14);
        g.stroke();
        g.textAlign = "left";
        ROSTER.forEach((r, i) => {
          const y = H * (0.28 + i * 0.16);
          g.font = `${Math.round(W * 0.038)}px "Courier New", monospace`;
          g.fillText(`${r.shift}${ordinal(r.shift)}`, W * 0.1, y);
          g.font = `600 ${Math.round(W * 0.042)}px "Courier New", monospace`;
          g.fillText(r.name, W * 0.26, y);
          g.font = `${Math.round(W * 0.032)}px "Courier New", monospace`;
          g.fillStyle = "rgba(30,26,18,0.65)";
          g.fillText("code on file", W * 0.68, y);
          g.fillStyle = "#1e1a12";
          g.strokeStyle = "rgba(30,26,18,0.28)";
          g.beginPath();
          g.moveTo(W * 0.1, y + H * 0.035);
          g.lineTo(W * 0.9, y + H * 0.035);
          g.stroke();
        });
      },
      0,
      0,
      0.045
    )
  );

  interact.add({
    root: roster,
    label: "Watch bill",
    verb: "Read",
    enabled: () => true,
    use: () => {
      audio.paper();
      ui.inspect(
        paperDoc({
          heading: "Watch Bill",
          sub: "Meridian Station · Duty Roster, week 41",
          lines: [
            "## 1st watch — VOSS, H.",
            "# code on file",
            "",
            "## 2nd watch — ALDRITCH, K.",
            "# code on file",
            "",
            "## 3rd watch — PRYCE, R.",
            "# code on file",
            "",
            "## 4th watch — BELL, W.",
            "# code on file",
            "",
            "--",
            "Registry rule: codes are filed by shift, not by name. One",
            "figure per code, taken in shift order.",
          ],
          stamp: { text: "DUTY", x: 620, y: 860, rot: 11 },
          footer: "REGISTRY · FIRST FLOOR · DO NOT ALTER THE BILL",
        }),
        "Watch bill"
      );
    },
  });

  // ------------------------------------------------------- catalogue cards
  const catX = -3.4;
  const catZ = -19.03;
  ROSTER.forEach((r, i) => {
    const dx = -3.76 + i * (0.36 - 0.0001) + (i > 0 ? 0 : 0);
    const x = [-3.76, -3.4, -3.04, -2.68][i];
    const y = 1.23;
    const drawer = new THREE.Group();
    drawer.position.set(x, y, catZ);
    kit.root.add(drawer);
    drawer.add(box(kit, 0.33, 0.27, 0.04, "wood", 0, 0, 0));
    drawer.add(box(kit, 0.1, 0.022, 0.02, "brassDark", 0, 0.02, 0.03));
    drawer.add(
      paperLabel(
        kit,
        0.16,
        0.05,
        (g, W, H) => {
          g.fillStyle = "#e9e2cd";
          g.fillRect(0, 0, W, H);
          g.fillStyle = "#1c1810";
          g.font = `600 ${Math.round(H * 0.55)}px "Courier New", monospace`;
          g.textAlign = "center";
          g.fillText(r.name, W / 2, H * 0.72);
        },
        -0.055,
        0.06,
        0.026
      )
    );

    interact.add({
      root: drawer,
      label: `${r.name} · catalogue drawer`,
      verb: "Open",
      enabled: () => !state.seen["card-" + r.name],
      use: () => {
        state.seen["card-" + r.name] = true;
        audio.paper();
        drawer.position.z = catZ + 0.17;
        ui.inspect(
          paperDoc({
            heading: "Index Card",
            sub: "Meridian Station · personnel registry",
            lines: [
              `## ${r.name}`,
              "",
              `# Shift ${r.shift}`,
              "",
              "Trade: acoustic rating",
              "Clearance: DEEP LISTENING",
              "",
              "--",
              "@center STATION CODE",
              "",
              `@center ${r.code}`,
              "",
              "--",
              "Filed by surname. Do not remove the card.",
            ],
            stamp: { text: "FILED", x: 600, y: 880, rot: 8, color: "rgba(52,74,96,0.62)" },
            footer: "MERIDIAN · PERSONNEL",
          }),
          `${r.name} — index card`
        );
      },
    });
    void dx;
  });

  // ------------------------------------------------------------ wall safe
  const SW = 1.16;
  const SH = 0.92;
  const safe = new THREE.Group();
  safe.position.set(R.x1 - 0.24, 1.4, -17.4);
  safe.rotation.y = -Math.PI / 2;
  kit.root.add(safe);

  // cavity: back, sides, top, bottom, linings
  safe.add(box(kit, SW + 0.16, SH + 0.16, 0.1, "steelDark", 0, 0, -0.38));
  safe.add(box(kit, 0.08, SH + 0.16, 0.46, "steelDark", -(SW / 2 + 0.04), 0, -0.16));
  safe.add(box(kit, 0.08, SH + 0.16, 0.46, "steelDark", SW / 2 + 0.04, 0, -0.16));
  safe.add(box(kit, SW + 0.16, 0.08, 0.46, "steelDark", 0, SH / 2 + 0.04, -0.16));
  safe.add(box(kit, SW + 0.16, 0.08, 0.46, "steelDark", 0, -(SH / 2 + 0.04), -0.16));
  safe.add(box(kit, SW + 0.02, SH + 0.02, 0.36, "black", 0, 0, -0.2));
  safe.add(box(kit, SW - 0.04, SH - 0.04, 0.3, "felt", 0, 0, -0.16));

  // the lip of the recess, so it reads as a safe built into the brick
  safe.add(box(kit, SW + 0.24, 0.07, 0.16, "steelPale", 0, SH / 2 + 0.12, 0.03));
  safe.add(box(kit, SW + 0.24, 0.07, 0.16, "steelPale", 0, -(SH / 2 + 0.12), 0.03));
  safe.add(box(kit, 0.07, SH + 0.24, 0.16, "steelPale", -(SW / 2 + 0.12), 0, 0.03));
  safe.add(box(kit, 0.07, SH + 0.24, 0.16, "steelPale", SW / 2 + 0.12, 0, 0.03));

  // contents
  const contents = new THREE.Group();
  contents.position.set(0, 0, -0.2);
  safe.add(contents);
  const memo = new THREE.Group();
  memo.position.set(-0.2, 0.05, 0.04);
  memo.rotation.z = 0.06;
  contents.add(memo);
  memo.add(box(kit, 0.24, 0.005, 0.32, "paper", 0, 0, 0));
  const tokenA = new THREE.Group();
  tokenA.position.set(0.24, 0.02, 0.03);
  tokenA.rotation.x = -Math.PI / 2;
  contents.add(tokenA);
  tokenA.add(token(kit, "cross", "7"));
  const key = new THREE.Group();
  key.position.set(0.02, -0.22, 0.05);
  key.rotation.y = 0.5;
  contents.add(key);
  key.add(box(kit, 0.02, 0.006, 0.16, "brass", 0, 0, 0));
  key.add(box(kit, 0.07, 0.006, 0.03, "brass", 0, 0, 0.07));
  for (let i = 0; i < 3; i++) key.add(box(kit, 0.014, 0.006, 0.02, "brass", -0.02, 0, -0.06 + i * 0.028));
  contents.visible = false;

  // door on a hinge at the left edge
  const door = new THREE.Group();
  door.position.set(-SW / 2, 0, 0.05);
  safe.add(door);
  door.add(box(kit, SW, SH, 0.06, "steel", SW / 2, 0, 0));
  door.add(box(kit, SW - 0.12, SH - 0.12, 0.02, "steelPale", SW / 2, 0, 0.04));
  door.add(cyl(kit, 0.03, 0.05, "brass", 0.05, 0, 0.03, 10, { z: Math.PI / 2 }));

  // number wheels
  const digits = SAFE_CODE.split("").map(() => 0);
  const digitTexts: { set: (d: number) => void }[] = [];

  for (let i = 0; i < 4; i++) {
    const wx = 0.2 + i * 0.16;
    const wheel = new THREE.Group();
    wheel.position.set(wx, -0.07, 0.06);
    door.add(wheel);
    wheel.add(cyl(kit, 0.062, 0.022, "brass", 0, 0, 0, 20, { x: Math.PI / 2 }));
    wheel.add(cyl(kit, 0.05, 0.028, "black", 0, 0, 0.012, 18, { x: Math.PI / 2 }));

    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 96;
    const g2 = c.getContext("2d")!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const drawDigit = (d: number) => {
      g2.fillStyle = "#0b0a08";
      g2.fillRect(0, 0, 96, 96);
      g2.fillStyle = "#f6ecce";
      g2.font = '600 66px "Courier New", monospace';
      g2.textAlign = "center";
      g2.fillText(String(d), 48, 74);
      tex.needsUpdate = true;
    };
    drawDigit(0);
    digitTexts.push({ set: drawDigit });

    const face = mesh(
      kit,
      new THREE.PlaneGeometry(0.058, 0.058),
      new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.42,
        roughness: 0.6,
      }),
      0,
      0,
      0.03
    );
    face.castShadow = false;
    wheel.add(face);

    let holdAcc = 0;
    interact.add({
      root: wheel,
      label: `Dial wheel ${i + 1}`,
      verb: "Turn (hold)",
      enabled: () => !state.safeOpen,
      use: () => {
        digits[i] = (digits[i] + 1) % 10;
        drawDigit(digits[i]);
        audio.detent();
      },
      hold: (dt) => {
        holdAcc += dt;
        while (holdAcc > 0.13) {
          holdAcc -= 0.13;
          digits[i] = (digits[i] + 1) % 10;
          drawDigit(digits[i]);
          if (digits[i] === 0) audio.detent();
        }
      },
    });
  }

  // handle
  const handle = new THREE.Group();
  handle.position.set(1.0, -0.07, 0.05);
  door.add(handle);
  handle.add(cyl(kit, 0.075, 0.05, "brassDark", 0, 0, 0.02, 16, { x: Math.PI / 2 }));
  handle.add(box(kit, 0.05, 0.2, 0.05, "brass", 0, 0, 0.06));
  handle.add(cyl(kit, 0.034, 0.06, "bakeliteBrown", 0, 0.1, 0.07, 12));

  let doorT = 0;
  let doorTarget = 0;
  interact.add({
    root: handle,
    label: "Safe handle",
    verb: "Pull",
    enabled: () => !state.safeOpen,
    use: () => {
      const entered = digits.join("");
      if (entered === SAFE_CODE) {
        state.safeOpen = true;
        doorTarget = -1.9;
        contents.visible = true;
        audio.thunk();
        audio.success();
        ui.toast("<em>The bolts withdraw.</em> The safe is open.", 4500);
      } else {
        audio.error();
        digits.fill(0);
        digitTexts.forEach((d) => d.set(0));
        ui.toast("<em>No.</em> The handle spins free and the wheels reset.", 3600);
      }
    },
    update: (dt) => {
      doorT += (doorTarget - doorT) * Math.min(1, dt * 3.6);
      door.rotation.y = doorT;
    },
  });

  // the memo
  interact.add({
    root: memo,
    label: "Memorandum",
    verb: "Read",
    enabled: () => state.safeOpen,
    use: () => {
      audio.paper();
      state.seen.memo = true;
      ui.inspect(memoDoc(), "Memorandum — channel symbols");
    },
  });

  // channel A token
  const tokenEntry = interact.add({
    root: tokenA,
    label: "Brass token · A",
    verb: "Take",
    enabled: () => state.safeOpen && !state.channels.A,
    use: () => {
      tokenA.visible = false;
      state.channels.A = true;
      state.carried.add("Token A");
      liveChannel("A");
      audio.success();
      ctx.changed();
      ui.toast("Token A — <em>stamped 7</em>. A channel wakes somewhere in the wall.", 5200);
    },
  });
  void tokenEntry;

  // padlock key (flavour, opens the cage)
  interact.add({
    root: key,
    label: "Brass key",
    verb: "Take",
    enabled: () => state.safeOpen && !state.seen.key,
    use: () => {
      state.seen.key = true;
      key.visible = false;
      state.carried.add("Cage key");
      audio.click();
      ui.toast("<em>Cage key.</em> Twenty years of dust on the shaft.", 3200);
    },
  });

  // -------------------------------------------------------------- placard
  const placard = new THREE.Group();
  placard.position.set(-4.7, 1.75, -12.6);
  placard.rotation.y = Math.PI / 2;
  kit.root.add(placard);
  placard.add(box(kit, 0.62, 0.34, 0.03, "brassDark", 0, 0, 0));
  placard.add(
    paperLabel(
      kit,
      0.56,
      0.28,
      (g, W, H) => {
        g.fillStyle = "#ddd4bb";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#221d14";
        g.textAlign = "center";
        g.font = `600 ${Math.round(W * 0.07)}px "Courier New", monospace`;
        g.fillText("REGISTRY RULE", W / 2, H * 0.3);
        g.font = `${Math.round(W * 0.058)}px "Courier New", monospace`;
        g.fillText("codes are read by shift", W / 2, H * 0.55);
        g.fillText("one figure per code", W / 2, H * 0.78);
      },
      0,
      0,
      0.022
    )
  );

  interact.add({
    root: placard,
    label: "Registry rule",
    verb: "Read",
    enabled: () => true,
    use: () => {
      audio.paper();
      ui.inspect(
        paperDoc({
          heading: "Registry Rule",
          sub: "posted above the catalogue",
          lines: [
            "@center CODES ARE READ BY SHIFT.",
            "",
            "The bill gives the order of the watches.",
            "The catalogue gives the code, filed by surname.",
            "",
            "Take one figure from each code. Read them in the order of",
            "the watches. Four figures. That is the box.",
            "",
            "--",
            "If you cannot remember a name, you were never on watch.",
          ],
          stamp: { text: "REGISTRY", x: 600, y: 830, rot: -6, color: "rgba(52,74,96,0.6)" },
        }),
        "Registry rule"
      );
    },
  });

  void brassPlate;
  void R;
}

export function memoDoc() {
  return paperDoc({
    heading: "Memorandum",
    sub: "internal · channel designation",
    lines: [
      "## To: duty engineer",
      "## From: R. Pryce",
      "",
      "--",
      "The board is to be patched by symbol, not by letter. The letters",
      "are for us. The symbols are for the door.",
      "",
      "@center A — @sym cross",
      "@center B — @sym triangle",
      "@center C — @sym wave",
      "@center D — @sym star",
      "",
      "--",
      "Each token is stamped with the figure of its watch. The door wants",
      "them in the order the photographer brings back.",
      "",
      "Do not leave the board patched overnight. The solenoids heat.",
    ],
    stamp: { text: "DEEP LISTENING", x: 585, y: 900, rot: 7, color: "rgba(150,42,30,0.66)" },
    footer: "MERIDIAN STATION · CHANNEL DESIGNATION",
  });
}

function ordinal(n: number) {
  return n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
}

/** Called by every wing puzzle when its channel comes alive. */
export function liveChannel(id: "A" | "B" | "C" | "D") {
  state.channels[id] = true;
  const label = { A: "cross", B: "triangle", C: "wave", D: "star" }[id];
  void label;
}
