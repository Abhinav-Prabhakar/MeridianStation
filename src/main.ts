import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { asset } from "./core/asset";
import { PostChain } from "./core/post";
import { buildMaterials, type MatLib } from "./core/materials";
import { Kit } from "./core/kit";
import { buildShell } from "./world/shell";
import { buildDressing, buildLights } from "./world/rooms";
import { decalMaterial, scatterDecals } from "./world/decals";
import { buildServices } from "./world/services";
import { addShaft, buildDust, buildSteam } from "./world/atmosphere";
import { ZONES, zoneAt } from "./world/layout";
import { BakedEnv } from "./world/bakedEnv";
import { Player } from "./player/player";
import { buildViewmodel } from "./player/viewmodel";
import { InteractSystem, type InteractEntry } from "./game/interact";
import { audio } from "./game/audio";
import { Ui } from "./game/ui";
import { channelCount, patchedCount, state, type Ctx } from "./game/state";
import { buildFuses, buildPower } from "./game/devices/power";
import { buildRecords } from "./game/devices/records";
import { buildAnechoic } from "./game/devices/anechoic";
import { buildMachine } from "./game/devices/machine";
import { buildDarkroom } from "./game/devices/darkroom";
import { buildBlastDoor } from "./game/devices/blastdoor";

// ---------------------------------------------------------------- ui utils
const $ = (id: string) => document.getElementById(id)!;
const bootEl = $("boot");
const bootBar = $("bootbar");
const bootStatus = $("bootstatus");
const startBtn = $("startbtn") as HTMLButtonElement;
const hudEl = $("hud");
const notebook = $("notebook");
const fadeEl = $("fade");

// ---------------------------------------------------------------- notebook
const HINTS: Record<string, string[]> = {
  power: [
    "The board in the cage has four empty holders and a schedule behind glass. The holders say <em>where</em>; the schedule says <em>how much</em>.",
    "Four fuses are out in the wings: the workshop, the registry floor, the photographic store, and between the wedges in the acoustic range. Two more on the way are burnt out — they will only waste your time.",
    "Lighting wants 5A, motive 10A, instruments 15A, heating 20A. Seat all four, then throw the knife switch on the right of the board.",
  ],
  wings: [
    "Four channels, four wings. Each wing has a device, and each device gives up a brass token when it is satisfied. The tokens are the plugs for the door.",
    "Records: the watch bill gives shift order, the catalogue gives a code per man, and the safe wants one figure from each, in shift order. Anechoic: sweep for the null. Machine: open the valves highest pressure first. Darkroom: three baths, in order, for long enough.",
    "Safe <em>7294</em>. Chamber null <em>601.6 Hz</em>. Valve order <em>B, D, A, C</em> — 3.2, 2.4, 1.8, 0.6 bar. The plate in the darkroom goes developer, stop, fixer, and you must hold each one long enough to count.",
  ],
  board: [
    "The door is stamped with symbols, not letters. Something in the station tells you which letter each symbol belongs to.",
    "The memorandum in the Records safe is the key: A cross, B triangle, C wave, D star. Seat each token in the socket carrying its symbol.",
    "Left to right the sockets are cross, triangle, wave, star. That means A, B, C, D. Once all four are seated, read the figures straight off the board.",
  ],
  door: [
    "The print from the darkroom carries two things: an order of channel letters, and a count of turns.",
    "D B C A. Take the figure stamped on each token in that order. The crank needs eight full turns before the dial will move.",
    "The handle is on a peg in the machine room; the oil is on the bench beside it. Seat the handle, oil the trunnion, then hold E on the crank until it stops at eight. Then dial <em>4 2 9 7</em>.",
  ],
};

let hintStage = "";
let hintLevel = 0;

function currentStage() {
  if (!state.power) return "power";
  if (channelCount() < 4) return "wings";
  if (patchedCount() < 4) return "board";
  return "door";
}

// ---------------------------------------------------------------- bootstrap
async function boot() {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
    });
  } catch {
    bootBar.style.width = "0%";
    bootStatus.innerHTML =
      "<span style='color:#c96'>This browser has no WebGL2.</span><br />" +
      "<span style='color:#6b6559'>Try a current Chrome, Edge, Firefox or Safari.</span>";
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070605, 0.011);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 90);
  scene.add(camera);

  const ui = new Ui();

  bootStatus.textContent = "loading surfaces";
  const mats = await buildMaterials(renderer, (f) => {
    bootBar.style.width = `${f * 78}%`;
  });

  // ---- offline lighting bake (see scripts/bake.py)
  const params = new URLSearchParams(location.search);
  if (params.has("bake")) {
    const { exportBakeScene } = await import("./bake/export");
    await exportBakeScene(mats, (s) => {
      bootStatus.textContent = s;
    });
    bootBar.style.width = "100%";
    return;
  }

  bootStatus.textContent = "loading environment";
  const baked = new BakedEnv(renderer, scene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  try {
    const hdr = await new RGBELoader().loadAsync(asset("hdri/boiler_room_1k.hdr"));
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const envTex = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.11;
    hdr.dispose();
  } catch {
    scene.environmentIntensity = 0;
  }

  bootStatus.textContent = "raising the station";
  bootBar.style.width = "84%";

  const root = new THREE.Group();
  scene.add(root);
  const kit = new Kit(mats, root);
  buildShell(kit);
  const serviceRuns = buildServices(kit);
  console.info(`[meridian] ran ${serviceRuns} service runs`);
  buildDressing(kit);

  // ---- decals: stains, stencils, scuffs, taped paper
  const decals = scatterDecals(kit, decalMaterial(), ZONES);
  console.info(`[meridian] stamped ${decals} decals`);

  bootBar.style.width = "90%";
  bootStatus.textContent = "cutting draw calls";
  await new Promise((r) => setTimeout(r, 16));
  const staticCount = mergeStatic(root);
  console.info(`[meridian] merged ${staticCount} meshes into static batches`);

  // ---- lights
  const rigs = buildLights(scene);

  // ---- atmosphere: motes, beams and boiler steam
  const dust = buildDust(2400);
  scene.add(dust.points);
  const steam = buildSteam(scene);
  const shafts: THREE.ShaderMaterial[] = [];
  const beam = (o: Parameters<typeof addShaft>[1]) => {
    const m = addShaft(scene, o);
    shafts.push(m.material as THREE.ShaderMaterial);
  };
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + 0.6;
    const x = Math.sin(a) * 3.0;
    const z = -Math.cos(a) * 3.0;
    beam({ x, y: 4.32, z, height: 4.3, radius: 2.0, strength: 0.85 });
  }
  // the dome slit: one long cold blade of daylight across the anechoic range
  beam({
    x: 0,
    y: 9.2,
    z: -18.9,
    height: 7.6,
    radius: 3.1,
    color: 0xa8c6ff,
    strength: 1.15,
    dir: [0.0, -5.2, 4.7],
  });
  // machine hall: the roof-light shaft and the cage lamp over the valves
  beam({ x: 3.6, y: 4.85, z: 18.6, height: 5.1, radius: 1.7, color: 0xa8c8ff, strength: 1.2, dir: [-0.6, -4.85, -1.7] });
  beam({ x: 4.4, y: 4.0, z: 15.4, height: 2.5, radius: 1.15, strength: 0.7, dir: [1.0, -2.3, 0.0] });
  // corridor lamps: short warm cones, just enough to show the air
  for (const [x, z] of [
    [0, -9],
    [9, 0],
    [0, 9],
    [-9, 0],
  ] as const) {
    beam({ x, y: 3.0, z, height: 3.0, radius: 1.5, strength: 0.45 });
  }

  // ---- baked environments: this room and everything adjacent
  baked.preload(["rotunda", "corr_n", "corr_e", "corr_s", "corr_w"]);

  // ---- player
  const player = new Player(camera, scene);
  const viewmodel = buildViewmodel(camera, mats);
  player.blockers = kit.blockers;
  const interact = new InteractSystem();

  // ---- notebook + hints
  function updateNotebook() {
    const seated = Object.values(state.seated).every(Boolean);
    const items: [string, boolean][] = [
      ["Restore the mains at the distribution board", state.power],
      ["Seat four fuses of the right rating", seated],
      ["Records · the registry safe", state.channels.A],
      ["Anechoic · find the chamber null", state.channels.B],
      ["Machine · bleed the boiler in order", state.channels.C],
      ["Darkroom · develop the plate", state.channels.D],
      ["Patch four channels into the blast door", patchedCount() === 4],
      ["Crank the bolts and dial the code", state.doorOpen],
    ];
    let html = `<h3>Objectives</h3>`;
    for (const [t, done] of items) html += `<div class="item ${done ? "done" : ""}">${t}</div>`;

    html += `<h3>Carried</h3>`;
    if (state.carried.size === 0) html += `<div class="item">Nothing yet.</div>`;
    for (const c of [...state.carried]) html += `<div class="item">${c}</div>`;

    html += `<h3>Hints</h3><button class="hintbtn" id="hintbtn">Ask the notebook</button>`;
    const list = HINTS[currentStage()];
    html += `<div class="hint">${list[Math.min(list.length, Math.max(1, hintLevel)) - 1]}</div>`;
    ui.renderNotebook(html);
  }

  function showHint() {
    const s = currentStage();
    if (s !== hintStage) {
      hintStage = s;
      hintLevel = 0;
    }
    hintLevel = Math.min(3, hintLevel + 1);
    state.hintsUsed++;
    audio.paper();
    ui.toast(`<em>Notebook</em> — ${HINTS[s][hintLevel - 1]}`, 12000);
    updateNotebook();
  }
  ui.onHint = showHint;

  // ---- power cascade
  function powerUp() {
    state.power = true;
    audio.setHum(1);
    audio.thunk();
    ui.toast("<em>The knife switch closes.</em> Contactors clap somewhere below.", 4200);
    updateNotebook();
    const steps: [number, string, () => void][] = [
      [1000, "The corridor lamps strike, one after another, all the way round.", () => audio.ballast()],
      [2400, "A fan takes up its old complaint. Pipes tick as they warm.", () => audio.relay()],
      [3800, "<em>The station is awake.</em> Four devices in the wings are waiting on you.", () => audio.success()],
    ];
    for (const [t, msg, fx] of steps) {
      window.setTimeout(() => {
        fx();
        ui.toast(msg, 4600);
        updateNotebook();
      }, t);
    }
  }

  // ---- the way out
  let startedAt = 0;
  function onEscape() {
    state.doorOpen = true;
    state.hintsUsed = state.hintsUsed;
    updateNotebook();
    audio.door();
    const mins = Math.max(1, Math.round((performance.now() - startedAt) / 60000));
    const stats = document.getElementById("endstats");
    if (stats) {
      stats.innerHTML = `${mins} minute${mins === 1 ? "" : "s"} · ${
        state.hintsUsed
      } hint${state.hintsUsed === 1 ? "" : "s"} asked · MERIDIAN, 1962`;
    }
    document.getElementById("ending")?.classList.add("on");
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---- dev: spawn override  ?x=..&z=..&yaw=..&pitch=..
  {
    const gx = params.get("x");
    const gz = params.get("z");
    if (gx && gz)
      player.teleport(
        parseFloat(gx),
        parseFloat(gz),
        parseFloat(params.get("yaw") ?? "0"),
        parseFloat(params.get("y") ?? "0")
      );
    if (params.get("pitch")) player.pitch = parseFloat(params.get("pitch")!);
  }

  // ---- the station's machinery
  const ctx: Ctx = {
    scene,
    kit,
    mats,
    interact,
    player,
    ui,
    audio,
    fade: (on: boolean) => fadeEl.classList.toggle("on", on),
    powerUp,
    changed: updateNotebook,
    onEscape,
  };

  bootStatus.textContent = "wiring the devices";
  buildPower(ctx);
  buildFuses(ctx);
  buildRecords(ctx);
  buildAnechoic(ctx);
  buildMachine(ctx);
  buildDarkroom(ctx);
  buildBlastDoor(ctx);
  updateNotebook();

  // ---- post
  const post = new PostChain(
    renderer,
    innerWidth * renderer.getPixelRatio(),
    innerHeight * renderer.getPixelRatio()
  );
  post.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  post.exposure = 0.9;
  post.bloom = 0.42;

  // ---- dust motes
  addDust(scene, 0, 2.2, 0, 6, 7, 260);
  addDust(scene, 1.2, 2.6, 17.6, 3.5, 4.5, 220);

  bootBar.style.width = "100%";
  bootStatus.textContent = "ready";
  startBtn.classList.add("ready");

  let started = false;
  let lastTime = performance.now();
  let elapsed = 0;
  let statAcc = 0;
  let fps = 60;
  void lastTime;

  /**
   * Dynamic resolution. A retina laptop asks for 3360 × 1754, and the post
   * chain (SSAO + two bloom scales + DoF + TAA) is fill-bound long before it is
   * geometry-bound. So the canvas keeps a resolution scale that walks between
   * 0.62 and 1.0 to hold 60 fps; the CSS size never changes, so nothing jumps.
   */
  let resScale = 1;
  const maxDpr = Math.min(devicePixelRatio, 1.5);
  const applyScale = () => {
    const dpr = maxDpr * resScale;
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    post.setSize(Math.floor(innerWidth * dpr), Math.floor(innerHeight * dpr));
    post.resetHistory();
  };
  const resize = () => applyScale();
  addEventListener("resize", resize);

  startBtn.addEventListener("click", () => {
    if (started) return;
    started = true;
    startedAt = performance.now();
    bootEl.classList.add("hidden");
    audio.init();
    audio.setHum(0);
    try {
      canvas.requestPointerLock();
    } catch {
      /* automation contexts disallow pointer lock */
    }
    ui.toast("The hatch seals above you. <em>Find a way out.</em>", 7000);
    updateNotebook();
  });

  // dev / capture hooks
  (window as any).__meridian = {
    state,
    THREE,
    interact,
    ui,
    toast: (m: string, ms?: number) => ui.toast(m, ms),
    updateNotebook,
    player,
    camera,
    post,
    scene,
    renderer,
    look: (x: number, z: number, yaw: number, pitch = 0, y = 0) => {
      player.teleport(x, z, yaw, y);
      player.pitch = pitch;
      player.update(0.016);
    },
  };

  if (params.has("noboot")) {
    started = true;
    startedAt = performance.now();
    bootEl.style.display = "none";
    updateNotebook();
  }

  canvas.addEventListener("click", () => {
    if (started && document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });

  const lockHint = document.getElementById("lockhint");
  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    document.body.style.cursor = locked ? "none" : "default";
    lockHint?.classList.toggle("on", started && !locked && !ui.inspecting);
  });

  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement === canvas) player.onMouse(e.movementX, e.movementY);
  });

  // ---- interaction state
  let current: { entry: InteractEntry; point: THREE.Vector3 } | null = null;
  let eHeld = false;

  function tryUse() {
    if (!current) return;
    if (ui.inspecting) return;
    current.entry.use();
  }

  addEventListener("keydown", (e) => {
    if (e.code === "Tab") {
      e.preventDefault();
      notebook.classList.toggle("on");
      updateNotebook();
    }
    if (e.code === "KeyE") {
      if (!e.repeat) {
        eHeld = true;
        tryUse();
      }
    }
    if (e.code === "KeyH") showHint();
  });

  addEventListener("keyup", (e) => {
    if (e.code === "KeyE") eHeld = false;
  });

  addEventListener("blur", () => {
    eHeld = false;
  });

  // ---- main loop
  const clock = new THREE.Clock();
  const activeZones = new Set<string>();
  const ADJ: Record<string, string[]> = {
    rotunda: ["corr_n", "corr_e", "corr_s", "corr_w"],
    corr_n: ["rotunda", "records"],
    records: ["corr_n", "stair"],
    stair: ["records", "landing"],
    landing: ["stair", "dome"],
    dome: ["landing"],
    corr_e: ["rotunda", "anechoic"],
    anechoic: ["corr_e"],
    corr_s: ["rotunda", "machine"],
    machine: ["corr_s", "tunnel_a"],
    corr_w: ["rotunda", "darkroom"],
    darkroom: ["corr_w", "crawl"],
    tunnel_a: ["machine", "tunnel_b"],
    tunnel_b: ["tunnel_a", "tunnel_c"],
    tunnel_c: ["tunnel_b", "crawl"],
    crawl: ["tunnel_c", "darkroom"],
  };

  function setZoneLights(zone: string | null) {
    const want = new Set<string>();
    if (zone) {
      want.add(zone);
      for (const n of ADJ[zone] ?? []) want.add(n);
    } else {
      for (const z of ZONES) want.add(z.id);
    }
    if (want.size === activeZones.size && [...want].every((z) => activeZones.has(z))) return;
    activeZones.clear();
    for (const z of want) activeZones.add(z);
    for (const rig of rigs) {
      const on = activeZones.has(rig.zone);
      // a shadow-casting light re-renders every batch, so only the room you are
      // actually standing in keeps its shadows; the neighbours keep their glow
      const shadowHere = on && rig.zone === zone;
      for (const l of rig.lights) {
        l.visible = on;
        if (l.userData.wantsShadow) l.castShadow = shadowHere;
      }
    }
  }

  const ENV_INT: Record<string, number> = {
    rotunda: 0.46,
    corr_n: 0.42,
    corr_e: 0.42,
    corr_s: 0.42,
    corr_w: 0.42,
    records: 0.46,
    stair: 0.4,
    landing: 0.4,
    anechoic: 0.52,
    machine: 0.44,
    darkroom: 0.5,
    dome: 0.48,
    tunnel_a: 0.46,
    tunnel_b: 0.46,
    tunnel_c: 0.46,
    crawl: 0.42,
  };
  let lastZone = "";

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    fps += (1 / Math.max(dt, 0.0001) - fps) * 0.06;

    if (started) player.update(dt);
    viewmodel.update(dt, player.speed, player.bobPhase, player.yaw, player.pitch, player.flashOn);

    const zone = zoneAt(player.pos.x, player.pos.z, player.pos.y);
    setZoneLights(zone?.id ?? null);
    if (zone && zone.id !== lastZone) {
      lastZone = zone.id;
      baked.preload([...(ADJ[zone.id] ?? []), zone.id]);
      hudEl.innerHTML = `<span class="lit">${zone.label}</span>`;
    }
    statAcc += dt;
    if (statAcc > 0.5) {
      statAcc = 0;
      // ---- hold the frame rate: walk the render resolution, not the lights
      if (started) {
        if (fps < 54 && resScale > 0.62) {
          resScale = Math.max(0.62, resScale - 0.08);
          applyScale();
        } else if (fps > 58.5 && resScale < 1) {
          resScale = Math.min(1, resScale + 0.04);
          applyScale();
        }
      }
      const info = post.stats;
      if (location.search.includes("dbg"))
        console.info(`[meridian:stats] fps=${fps.toFixed(1)} res=${resScale.toFixed(2)} calls=${info.calls} tris=${info.tris} started=${started}`);
      hudEl.innerHTML = `${zone ? `<span class="lit">${zone.label}</span><br>` : ""}${fps.toFixed(0)} fps · ${info.calls} calls · ${(info.tris / 1000).toFixed(0)}k tris`;
    }

    for (const rig of rigs) rig.tick?.(elapsed);
    baked.update(zone?.id ?? null, ENV_INT[zone?.id ?? ""] ?? 0.28, dt);
    dust.update(elapsed, camera);
    steam.update(elapsed, camera.position);
    for (const m of shafts) m.uniforms.uTime.value = elapsed;

    interact.tick(dt);

    if (started && !ui.inspecting && !state.doorOpen) {
      current = interact.pick(camera, 2.4);
      interact.current = current?.entry ?? null;
      if (current) {
        const e = current.entry;
        ui.setPrompt(`<b>${e.verb}</b> &nbsp;${e.label}`);
        if (eHeld && e.hold) e.hold(dt);
      } else {
        ui.setPrompt(null);
      }
    } else {
      interact.current = null;
      if (ui.inspecting || state.doorOpen) ui.setPrompt(null);
    }

    // lens focus: whatever the reticle is on, else a slow drift to 4 m
    if (current) {
      const d = current.point.distanceTo(camera.position);
      post.focus += (Math.min(9, Math.max(1.1, d)) - post.focus) * Math.min(1, dt * 5);
    } else {
      post.focus += (6.0 - post.focus) * Math.min(1, dt * 1.2);
    }

    post.render(scene, camera, viewmodel.scene);
  }
  frame();
}

// ------------------------------------------------------- static batching
function mergeStatic(root: THREE.Group): number {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const doomed: THREE.Mesh[] = [];

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m as any).isMesh) return;
    if ((m as any).isInstancedMesh) return;
    if (m.userData.dynamic) return;
    if (!m.geometry || !m.material) return;
    if (Array.isArray(m.material)) return;
    const mat = m.material as THREE.Material;
    let arr = buckets.get(mat);
    if (!arr) buckets.set(mat, (arr = []));
    m.updateWorldMatrix(true, false);
    let gg: THREE.BufferGeometry = m.geometry.clone();
    gg.applyMatrix4(m.matrixWorld);
    if (!gg.attributes.uv) {
      const n = gg.attributes.position.count;
      gg.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (gg.index) gg = gg.toNonIndexed();
    arr.push(gg);
    doomed.push(m);
  });

  for (const m of doomed) m.parent?.remove(m);

  let n = 0;
  for (const [mat, geos] of buckets) {
    if (geos.length === 0) continue;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    // alpha-blended batches (decals) must not write into the shadow map
    mesh.castShadow = !mat.transparent;
    mesh.receiveShadow = true;
    root.add(mesh);
    n += geos.length;
  }
  return n;
}

// ------------------------------------------------------------------ dust
function addDust(
  scene: THREE.Scene,
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  count: number
) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = cx + (Math.random() - 0.5) * w;
    pos[i * 3 + 1] = cy - h / 2 + Math.random() * h;
    pos[i * 3 + 2] = cz + (Math.random() - 0.5) * w;
    seed[i] = Math.random() * 6.283;
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const m = new THREE.PointsMaterial({
    color: 0xffe8c8,
    size: 0.006,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  const base = pos.slice();
  const tick = (t: number) => {
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      p.setY(i, base[i * 3 + 1] + Math.sin(t * 0.28 + seed[i]) * 0.16);
      p.setX(i, base[i * 3] + Math.sin(t * 0.17 + seed[i] * 1.7) * 0.12);
    }
    p.needsUpdate = true;
  };
  dustTicks.push(tick);
}
const dustTicks: ((t: number) => void)[] = [];
setInterval(() => {
  const t = performance.now() / 1000;
  for (const f of dustTicks) f(t);
}, 33);

boot().catch((e) => {
  console.error(e);
  bootStatus.textContent = "failed: " + e.message;
});
