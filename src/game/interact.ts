import * as THREE from "three";

export interface InteractEntry {
  root: THREE.Object3D;
  label: string;
  detail?: string;
  /** shown in the reticle, e.g. "Turn", "Open", "Take" */
  verb: string;
  enabled: () => boolean;
  use: () => void;
  /** called every frame while the entry is under the reticle and E is held */
  hold?: (dt: number) => void;
  update?: (dt: number) => void;
}

export class InteractSystem {
  entries: InteractEntry[] = [];
  private roots: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2(0, 0);
  /** whatever the reticle is on this frame */
  current: InteractEntry | null = null;

  add(e: InteractEntry) {
    this.entries.push(e);
    this.roots.push(e.root);
    e.root.traverse((o) => {
      // first entry wins: a device built on a shared panel keeps its own
      // handle even when the panel registers a fallback entry later
      if (!o.userData.entry) o.userData.entry = e;
    });
    return e;
  }

  pick(camera: THREE.Camera, maxDist = 2.4): { entry: InteractEntry; point: THREE.Vector3 } | null {
    this.raycaster.setFromCamera(this.ndc, camera);
    this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(this.roots, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const e = o.userData.entry as InteractEntry | undefined;
        if (e) {
          if (!e.enabled()) break;
          return { entry: e, point: h.point };
        }
        o = o.parent;
      }
    }
    return null;
  }

  tick(dt: number) {
    for (const e of this.entries) e.update?.(dt);
  }
}
