import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { asset } from "../core/asset";

/**
 * Baked environment lighting.
 *
 * `scripts/bake.py` renders one equirect HDR per room with Cycles. At runtime
 * each room swaps in its own as `scene.environment` — so the bounce light,
 * colour bleed and soft specular come from the actual room, not a generic
 * studio HDRI.
 *
 * Swapping an environment is a hard cut (there is only one slot), so we dip the
 * intensity to zero over ~0.12 s, swap, then bring it back. At these levels it
 * reads as a normal light adaptation, not a flicker.
 */

/** zone id → bake file name */
const ZONE_FILE: Record<string, string> = {
  rotunda: "rotunda",
  corr_n: "corr_n",
  corr_e: "corr_e",
  corr_s: "corr_s",
  corr_w: "corr_w",
  records: "records",
  stair: "records",
  landing: "records",
  dome: "dome",
  anechoic: "anechoic",
  machine: "machine",
  darkroom: "darkroom",
  tunnel_a: "tunnel",
  tunnel_b: "tunnel",
  tunnel_c: "tunnel",
  crawl: "tunnel",
};

const FADE_OUT = 0.16;
const FADE_IN = 0.42;

export class BakedEnv {
  /** true once at least one room bake has loaded */
  active = false;

  private pmrem: THREE.PMREMGenerator;
  private loader = new RGBELoader();
  private cache = new Map<string, THREE.Texture>();
  private pending = new Map<string, Promise<THREE.Texture | null>>();
  private currentFile = "";
  private fade = 1;
  private base = 0.24;

  constructor(
    renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
  }

  has(file: string) {
    return this.cache.has(file);
  }

  /** Kick off loading for a zone (and optionally its neighbours). */
  preload(zoneIds: string[]) {
    for (const id of zoneIds) {
      const file = ZONE_FILE[id];
      if (file) void this.loadFile(file);
    }
  }

  private loadFile(file: string): Promise<THREE.Texture | null> {
    const hit = this.cache.get(file);
    if (hit) return Promise.resolve(hit);
    const running = this.pending.get(file);
    if (running) return running;

    const p = (async () => {
      try {
        const hdr = await this.loader.loadAsync(asset(`bake/${file}.hdr`));
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const tex = this.pmrem.fromEquirectangular(hdr).texture;
        tex.name = `bake:${file}`;
        hdr.dispose();
        this.cache.set(file, tex);
        return tex;
      } catch {
        return null;
      } finally {
        this.pending.delete(file);
      }
    })();
    this.pending.set(file, p);
    return p;
  }

  /**
   * Drive the environment from the main loop. Returns false while no bake is
   * available, so the caller can keep its static HDRI fallback.
   */
  update(zoneId: string | null, intensity: number, dt: number): boolean {
    const file = zoneId ? ZONE_FILE[zoneId] : undefined;
    if (!file) return false;

    // make sure the current room is loading; neighbours are handled by preload()
    if (!this.cache.has(file)) {
      void this.loadFile(file);
      if (!this.active) return false;
    }

    this.base = intensity;

    if (this.cache.has(file) && file !== this.currentFile) {
      if (!this.currentFile) {
        this.currentFile = file;
        this.scene.environment = this.cache.get(file)!;
        this.fade = 0;
        this.active = true;
      } else {
        this.fade -= dt / FADE_OUT;
        if (this.fade <= 0) {
          this.fade = 0;
          this.currentFile = file;
          this.scene.environment = this.cache.get(file)!;
        }
      }
    } else {
      this.fade = Math.min(1, this.fade + dt / FADE_IN);
    }

    this.scene.environmentIntensity = this.base * ease(this.fade);
    return true;
  }
}

const ease = (t: number) => t * t * (3 - 2 * t);
