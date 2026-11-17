import * as THREE from "three";
import { floorAt, START } from "../world/layout";

const EYE = 1.66;
const CROUCH_EYE = 1.02;
const RADIUS = 0.26;
const WALK = 1.65;
const RUN = 2.75;
const CROUCH_SPEED = 0.85;

export class Player {
  pos = new THREE.Vector3(START.x, 0, START.z);
  yaw = START.yaw;
  pitch = 0;
  eyeY = EYE;
  crouch = 0;
  bob = 0;
  bobPhase = 0;
  speed = 0;
  blockers: import("../core/kit").Blocker[] = [];

  camera: THREE.PerspectiveCamera;
  flashlight: THREE.SpotLight;
  flashOn = true;
  /** set when a scripted transition is running */
  frozen = false;

  private keys = new Set<string>();
  private vel = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.camera = camera;
    this.flashlight = new THREE.SpotLight(0xffdcb0, 13, 20, 0.56, 0.78, 1.5);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.0009;
    this.flashlight.shadow.camera.near = 0.1;
    this.flashlight.shadow.camera.far = 24;
    this.flashlight.position.set(0.16, -0.12, 0.05);
    camera.add(this.flashlight);
    const t = new THREE.Object3D();
    t.position.set(0, 0, -1);
    camera.add(t);
    this.flashlight.target = t;

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "KeyF") this.flashOn = !this.flashOn;
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  onMouse(dx: number, dy: number) {
    this.yaw -= dx * 0.0022;
    this.pitch -= dy * 0.0022;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  private blocked(x: number, z: number): boolean {
    if (!floorAt(x, z, this.pos.y)) return true;
    for (const b of this.blockers) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < RADIUS * RADIUS) return true;
    }
    return false;
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    if (this.frozen) {
      this.syncCamera(dt);
      return;
    }
    const k = this.keys;
    let fwd = 0;
    let side = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) fwd += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) fwd -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) side += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) side -= 1;

    const crouching = k.has("ControlLeft") || k.has("KeyC");
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);
    const targetEye = EYE + (CROUCH_EYE - EYE) * this.crouch;

    const sprint = k.has("ShiftLeft") && !crouching;
    const maxSpeed = crouching ? CROUCH_SPEED : sprint ? RUN : WALK;

    const len = Math.hypot(fwd, side);
    let wishX = 0;
    let wishZ = 0;
    if (len > 0) {
      fwd /= len;
      side /= len;
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      wishX = (-sinY * fwd + cosY * side) * maxSpeed;
      wishZ = (-cosY * fwd - sinY * side) * maxSpeed;
    }

    const accel = len > 0 ? 12 : 9;
    this.vel.x += (wishX - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (wishZ - this.vel.z) * Math.min(1, dt * accel);

    const dx = this.vel.x * dt;
    const dz = this.vel.z * dt;
    if (!this.blocked(this.pos.x + dx, this.pos.z + dz)) {
      this.pos.x += dx;
      this.pos.z += dz;
    } else {
      if (!this.blocked(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
      else this.vel.x *= 0.2;
      if (!this.blocked(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
      else this.vel.z *= 0.2;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.bobPhase += this.speed * dt * 7.2;
    const bobAmt = Math.min(1, this.speed / WALK) * 0.024;
    const targetBob = Math.sin(this.bobPhase * 2) * bobAmt;
    this.bob += (targetBob - this.bob) * Math.min(1, dt * 14);

    const ground = floorAt(this.pos.x, this.pos.z, this.pos.y + 0.6);
    if (ground) {
      this.pos.y += (ground.y - this.pos.y) * Math.min(1, dt * 9);
    }
    this.eyeY += (targetEye - this.eyeY) * Math.min(1, dt * 10);
    this.syncCamera(dt);

    this.flashlight.intensity = this.flashOn ? 13 : 0;
    this.flashlight.visible = true;
  }

  private syncCamera(dt: number) {
    const sway = Math.sin(this.bobPhase) * 0.006 * Math.min(1, this.speed);
    this.camera.position.set(this.pos.x, this.pos.y + this.eyeY + this.bob, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.rotateZ(sway * 2.2);
    void dt;
  }

  teleport(x: number, z: number, yaw = this.yaw, fromY = 0) {
    this.pos.set(x, floorAt(x, z, fromY)?.y ?? fromY, z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.syncCamera(0);
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
