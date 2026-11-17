import * as THREE from "three";
import type { MatLib } from "../core/materials";

/**
 * First-person torch.
 *
 * The single biggest "there is no body here" tell in a first-person still is a
 * camera that floats. So the torch is real geometry parented to the camera: a
 * 1960s brass hand lamp with a knurled bezel and a warm lens, sitting low and
 * right in frame. It bobs with the walk cycle, lags behind the look direction,
 * and breathes when you stand still.
 *
 * It is never in a shadow map (castShadow = false) — a viewmodel that shadows
 * the world it is lighting just fights itself.
 */

export interface Viewmodel {
  group: THREE.Group;
  /** the torch lives in its own scene, stamped over the world after it */
  scene: THREE.Scene;
  update: (dt: number, speed: number, bobPhase: number, yaw: number, pitch: number, on: boolean) => void;
}

export function buildViewmodel(camera: THREE.PerspectiveCamera, mats: MatLib): Viewmodel {
  const scene = new THREE.Scene();

  // ---- its own little lighting rig -------------------------------------
  // A torch that is lit by the torch looks like a glowing tube. In its own
  // scene it can have a soft key from the front-left, a cool rim from behind
  // and a warm bounce off the lens, which is how a held object actually reads.
  const key = new THREE.DirectionalLight(0xfff0d8, 0.85);
  key.position.set(-0.6, 0.9, 0.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ec4ff, 1.25);
  rim.position.set(0.8, 0.2, -1.0);
  scene.add(rim);
  const bounce = new THREE.PointLight(0xffc987, 0.3, 0.9, 2);
  bounce.position.set(0.1, -0.1, -0.42);
  scene.add(bounce);
  scene.add(new THREE.HemisphereLight(0x6a7d94, 0x241a12, 0.7));

  const group = new THREE.Group();
  group.name = "viewmodel-torch";
  scene.add(group);

  const brass = mats.brass ?? new THREE.MeshStandardMaterial({ color: 0xb08d4a, metalness: 1, roughness: 0.34 });
  const brassDark = mats.brassDark ?? brass;
  const bakelite = mats.bakelite ?? new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.42 });
  const steel = mats.steelDark ?? brassDark;

  const lens = new THREE.MeshStandardMaterial({
    color: 0xfff3d8,
    emissive: 0xffd9a2,
    emissiveIntensity: 2.4,
    roughness: 0.24,
    metalness: 0,
  });

  const add = (m: THREE.Mesh) => {
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
    return m;
  };

  const axisZ = (m: THREE.Mesh, z: number) => {
    m.rotation.x = Math.PI / 2;
    m.position.z = z;
    return m;
  };

  // ---- barrel: two stages, bakelite grip over brass tube ----------------
  const grip = add(axisZ(new THREE.Mesh(new THREE.CylinderGeometry(0.0275, 0.0275, 0.135, 18), bakelite), 0.045));
  const tube = add(axisZ(new THREE.Mesh(new THREE.CylinderGeometry(0.0255, 0.0255, 0.115, 18), brass), -0.075));
  // a ring where the tube meets the grip, and one at the tail cap
  for (const z of [-0.012, 0.115]) {
    const r = add(new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0045, 8, 20), brassDark));
    r.position.z = z;
  }
  const tail = add(axisZ(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, 18), brassDark), 0.124));

  // ---- head: flares out to the reflector, knurled bezel -----------------
  const head = add(axisZ(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.04, 0.115, 22), brass), -0.166));
  const collar = add(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 8, 24), brassDark));
  collar.position.z = -0.224;

  // knurl: a ring of tiny ribs around the bezel
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const rib = add(new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.012, 0.006), brassDark));
    rib.position.set(Math.cos(a) * 0.0405, Math.sin(a) * 0.0405, -0.224);
    rib.rotation.z = a;
  }

  const glass = add(new THREE.Mesh(new THREE.CircleGeometry(0.0395, 26), lens));
  glass.position.z = -0.2285;
  glass.rotation.y = Math.PI;

  // ---- switch + a little label plate on the barrel ---------------------
  const sw = add(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.045), bakelite));
  sw.position.set(0.0, 0.028, 0.03);
  const plate = add(new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.002, 0.05), brassDark));
  plate.position.set(0, -0.0275, 0.045);

  // held low and right, canted in toward the reticle
  group.position.set(0.3, -0.2, -0.34);
  group.rotation.set(0.1, -0.07, -0.05);
  group.scale.setScalar(1.1);

  const base = group.position.clone();
  const baseRot = group.rotation.clone();
  let lagX = 0;
  let lagY = 0;
  let prevYaw = 0;
  let prevPitch = 0;
  let t = 0;

  return {
    group,
    scene,
    update: (dt, speed, bobPhase, yaw, pitch, on) => {
      t += dt;
      // frame-rate independent smoothing
      const k = Math.min(1, dt * 10);
      let dy = yaw - prevYaw;
      // ignore the wrap when yaw crosses ±π
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      const dp = pitch - prevPitch;
      prevYaw = yaw;
      prevPitch = pitch;

      // the torch lags the eye, then springs back
      lagX += (-dy * 2.2 - lagX) * k;
      lagY += (dp * 1.6 - lagY) * k;
      lagX = Math.max(-0.05, Math.min(0.05, lagX));
      lagY = Math.max(-0.04, Math.min(0.04, lagY));

      const sn = Math.min(1, speed / 2.2);
      const walkX = Math.sin(bobPhase) * 0.012 * sn;
      const walkY = Math.cos(bobPhase * 2) * 0.009 * sn;
      const breathe = Math.sin(t * 1.15) * 0.0016;

      group.position.set(
        base.x + walkX + lagX,
        base.y + walkY + lagY + breathe,
        base.z - sn * 0.012
      );
      group.rotation.set(
        baseRot.x - lagY * 1.6,
        baseRot.y + lagX * 1.1,
        baseRot.z + Math.sin(bobPhase) * 0.02 * sn - lagX * 0.8
      );

      const target = on ? 2.4 : 0.05;
      lens.emissiveIntensity += (target - lens.emissiveIntensity) * Math.min(1, dt * 12);
    },
  };
}
