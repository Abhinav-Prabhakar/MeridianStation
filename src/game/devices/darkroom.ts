import * as THREE from "three";
import { state, type Ctx } from "../state";
import { DOOR_ORDER, CHANNEL_DIGIT } from "../state";
import { photoPrint } from "../docs";
import { box, cyl, mesh, token } from "./common";
import { table } from "../../world/props";

/**
 * Darkroom — develop the plate.
 *
 * Take a sheet from the enlarger, then developer → stop → fixer, in that order
 * and for long enough. Get it wrong and the sheet fogs. The print that comes
 * out carries the door order; the token for channel D is taped under the
 * enlarger's baseboard.
 */

const TRAYS = [
  { x: -16.6, label: "Developer", needs: "exposed", gives: "dev" },
  { x: -15.75, label: "Stop bath", needs: "dev", gives: "stop" },
  { x: -14.9, label: "Fixer", needs: "stop", gives: "fixed" },
] as const;

const HOLD = 2.1;

export function buildDarkroom(ctx: Ctx) {
  const { kit, interact, ui, audio } = ctx;

  // ---- enlarger --------------------------------------------------------
  const enlarger = new THREE.Group();
  enlarger.position.set(-13.32, 0.8, -1.35);
  enlarger.rotation.y = -1.15;
  kit.root.add(enlarger);
  enlarger.add(box(kit, 0.42, 0.05, 0.42, "steelDark", 0, 0.02, 0));
  enlarger.add(box(kit, 0.05, 0.95, 0.05, "steelPale", 0, 0.5, -0.1));
  enlarger.add(box(kit, 0.3, 0.26, 0.3, "steelDark", 0, 0.98, 0.02));
  enlarger.add(cyl(kit, 0.07, 0.18, "bakelite", 0, 0.8, 0.02, 12));
  enlarger.add(box(kit, 0.24, 0.02, 0.24, "steelPale", 0, 0.66, 0.02));
  const redLens = mesh(
    kit,
    new THREE.CircleGeometry(0.06, 16),
    new THREE.MeshStandardMaterial({
      color: 0xff3a1c,
      emissive: 0xff2a10,
      emissiveIntensity: 1.2,
      roughness: 0.4,
    }),
    0,
    0.735,
    0.15
  );
  redLens.rotation.x = -Math.PI / 2;
  enlarger.add(redLens);

  interact.add({
    root: enlarger,
    label: state.photo === "none" ? "Enlarger · paper drawer" : "Enlarger",
    verb: "Take sheet",
    enabled: () => state.photo === "none" || state.photo === "ruined",
    use: () => {
      state.photo = "exposed";
      audio.paper();
      ctx.changed();
      ui.toast("A sheet of enlarging paper. <em>Keep it out of the white light.</em>", 4200);
    },
  });

  // ---- bench + trays ----------------------------------------------------
  table(kit, -15.75, -2.52, 2.6, 0.66, 0.62, 0, "wood");
  // a dim safelight over the bench, so the baths are readable without the torch
  const safelight = new THREE.PointLight(0xff2a10, 2.6, 3.4, 1.6);
  safelight.position.set(-15.75, 2.1, -2.2);
  ctx.scene.add(safelight);
  const shade = box(kit, 0.5, 0.06, 0.2, "steelDark", -15.75, 2.14, -2.2);
  void shade;

  const printMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.32),
    new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.55 })
  );
  printMesh.rotation.x = -Math.PI / 2;
  printMesh.visible = false;
  kit.root.add(printMesh);

  TRAYS.forEach((t, i) => {
    const tray = new THREE.Group();
    tray.position.set(t.x, 0.66, -2.34);
    kit.root.add(tray);
    tray.add(box(kit, 0.52, 0.1, 0.42, "steelPale", 0, 0.05, 0));
    tray.add(box(kit, 0.46, 0.012, 0.36, i === 0 ? "black" : "steelDark", 0, 0.012, 0));

    let held = 0;
    interact.add({
      root: tray,
      label: `${t.label} tray`,
      verb: "Immerse (hold)",
      enabled: () => state.photo !== "fixed" && state.photo !== "none",
      use: () => {
        audio.paper();
      },
      hold: (dt) => {
        if (state.photo === "fixed" || state.photo === "ruined") return;
        held += dt;
        printMesh.visible = true;
        printMesh.position.set(t.x, 0.705, -2.34);
        if (held > HOLD) {
          held = 0;
          printMesh.visible = false;
          const cur = state.photo;
          if (cur === t.needs) {
            const next: string = t.gives;
            state.photo = next as typeof state.photo;
            audio.detent();
            if (next === "fixed") {
              finish();
            } else {
              ui.toast(`<em>${t.label}.</em> Keep moving.`, 2200);
            }
          } else {
            state.photo = "ruined";
            audio.error();
            ui.toast("<em>The sheet fogs.</em> Wrong bath, or out of order.", 4400);
            ctx.changed();
          }
        }
      },
      update: () => {
        if (state.photo === "ruined" || state.photo === "none") held = 0;
      },
    });
  });

  // ---- drying line -----------------------------------------------------
  const printUrl = photoPrint({
    caption: "MERIDIAN · plate 14 · 1961",
    chalk: [DOOR_ORDER.join("  "), "EIGHT TURNS"],
  });
  const hanging = new THREE.Group();
  hanging.position.set(-16.4, 1.72, -0.88);
  kit.root.add(hanging);
  const printTex = (() => {
    const img = new Image();
    const tex = new THREE.Texture(img);
    img.onload = () => {
      tex.needsUpdate = true;
    };
    img.src = printUrl;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const sheet = mesh(
    kit,
    new THREE.PlaneGeometry(0.34, 0.25),
    new THREE.MeshStandardMaterial({ map: printTex, roughness: 0.62, side: THREE.DoubleSide }),
    0,
    0,
    0
  );
  hanging.add(sheet);
  displaced(hanging);
  hanging.visible = false;

  interact.add({
    root: hanging,
    label: "Developed print",
    verb: "Read",
    enabled: () => hanging.visible,
    use: () => {
      audio.paper();
      ui.inspect(printUrl, "Plate 14 — blast door");
    },
  });

  function displaced(g: THREE.Object3D) {
    // plane faces +Z by default; the line runs along X, so face into the room
    g.rotation.y = 0;
  }

  // ---- token D, taped under the enlarger -------------------------------
  const tokenD = new THREE.Group();
  tokenD.position.set(-13.2, 0.83, -1.1);
  tokenD.rotation.x = -Math.PI / 2;
  kit.root.add(tokenD);
  tokenD.add(token(kit, "star", "4"));
  tokenD.visible = false;

  interact.add({
    root: tokenD,
    label: "Brass token · D",
    verb: "Take",
    enabled: () => state.photo === "fixed" && !state.carried.has("Token D"),
    use: () => {
      state.channels.D = true;
      tokenD.visible = false;
      state.carried.add("Token D");
      audio.success();
      ctx.changed();
      ui.toast("Taped under the baseboard: <em>token D, stamped 4</em>. Channel D is live.", 5600);
    },
  });

  function finish() {
    hanging.visible = true;
    tokenD.visible = true;
    audio.success();
    ctx.changed();
    ui.toast(
      "The plate comes up. <em>Chalk on a wall: four letters, and a count.</em> Something is taped under the enlarger.",
      8000
    );
  }

  void CHANNEL_DIGIT;
}
