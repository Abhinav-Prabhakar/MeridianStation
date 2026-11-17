import * as THREE from "three";

/**
 * Atmosphere: dust, light shafts and steam.
 *
 * All three are cheap additive geometry — a single Points cloud, a handful of
 * cone shells and a few billboards — so they cost a few draw calls and never
 * touch the shadow maps. They exist to give the baked light a *volume*: a room
 * with a visible beam reads as air, a room without reads as a render.
 */

/** Soft radial dust sprite, generated once. */
function dustSprite(): THREE.Texture {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "rgba(255,244,224,1)");
  grd.addColorStop(0.4, "rgba(255,232,200,0.45)");
  grd.addColorStop(1, "rgba(255,220,180,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface DustSystem {
  points: THREE.Points;
  update: (t: number, camera: THREE.Camera) => void;
}

/**
 * Motes suspended in the air. Positions are scattered through the whole
 * station; the shader wraps each mote inside a 9 m cell around the camera so
 * the cloud follows the player without ever repeating visibly.
 */
export function buildDust(count = 2600): DustSystem {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 9;
    pos[i * 3 + 1] = Math.random() * 4.2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 9;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tSprite: { value: dustSprite() },
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uSize: { value: 24 },
      uColor: { value: new THREE.Color(0xffe6c2) },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uCam;
      uniform float uSize;
      varying float vFade;
      void main(){
        vec3 p = position;
        // wrap into a 9 m cell that is centred on the camera
        p.xz = mod(p.xz - uCam.xz + 4.5, 9.0) - 4.5 + uCam.xz;
        p.y = mod(p.y - 0.2, 4.2) + 0.2;
        // slow drift + a little swirl
        float t = uTime * 0.05 + aSeed * 6.28;
        p.x += sin(t) * 0.22;
        p.y += sin(t * 1.7) * 0.12;
        p.z += cos(t * 0.8) * 0.22;

        vec4 mv = viewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        vFade = smoothstep(0.4, 1.6, dist) * smoothstep(11.0, 5.0, dist);
        vFade *= 0.55 + 0.45 * sin(uTime * 0.7 + aSeed * 21.0);
        gl_PointSize = uSize * (0.35 + aSeed * 0.9) / max(dist, 0.5);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSprite;
      uniform vec3 uColor;
      varying float vFade;
      void main(){
        vec4 s = texture2D(tSprite, gl_PointCoord);
        float a = s.a * vFade * 0.2;
        if (a < 0.002) discard;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;

  return {
    points,
    update: (t: number, camera: THREE.Camera) => {
      mat.uniforms.uTime.value = t;
      (mat.uniforms.uCam.value as THREE.Vector3).copy(camera.position);
    },
  };
}

export interface ShaftOptions {
  /** apex of the cone (the fixture) */
  x: number;
  y: number;
  z: number;
  /** distance from apex to the floor */
  height: number;
  /** radius at the far end */
  radius: number;
  color?: number;
  strength?: number;
  /** beam direction from the apex, defaults to straight down */
  dir?: [number, number, number];
}

const SHAFT_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec2 vUv;
  void main(){
    vPos = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHAFT_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uStrength;
  uniform float uHeight;
  uniform float uRadius;
  varying vec3 vPos;
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main(){
    // the cone's local +Y is the axis: apex at y = height/2
    float along = clamp((uHeight * 0.5 - vPos.y) / uHeight, 0.0, 1.0);
    float r = length(vPos.xz) / max(0.0001, uRadius * max(along, 0.02));
    float body = pow(clamp(1.0 - r, 0.0, 1.0), 1.7);
    float ends = smoothstep(0.0, 0.12, along) * smoothstep(1.0, 0.55, along);
    float drift = 0.72 + 0.28 * noise(vec2(along * 3.0, uTime * 0.25));
    float a = body * ends * drift * uStrength * 0.16;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export function addShaft(
  scene: THREE.Object3D,
  opts: ShaftOptions
): THREE.Mesh {
  const { x, y, z, height, radius } = opts;
  const geo = new THREE.ConeGeometry(radius, height, 28, 1, true);
  const dir = new THREE.Vector3(...(opts.dir ?? [0, -1, 0])).normalize();
  // light this cone adds on top of whatever the bake already says
  const strength = (opts.strength ?? 1) * 1.0;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(opts.color ?? 0xffd8ae) },
      uTime: { value: 0 },
      uStrength: { value: strength },
      uHeight: { value: height },
      uRadius: { value: radius },
    },
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(geo, mat);
  // local +Y is the cone axis and the apex sits at +height/2, so the mesh
  // origin has to be pushed back down the beam
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
  m.position.set(x, y, z).addScaledVector(dir, height / 2);
  m.renderOrder = 2;
  m.frustumCulled = true;
  scene.add(m);
  return m;
}

/** Billboard steam: a few soft, slowly rising quads over the boiler. */
export function buildSteam(scene: THREE.Object3D): {
  group: THREE.Group;
  update: (t: number, cam: THREE.Vector3) => void;
} {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "rgba(255,255,255,0.5)");
  grd.addColorStop(0.55, "rgba(235,235,235,0.18)");
  grd.addColorStop(1, "rgba(220,220,220,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xbfc4c8,
  });

  const group = new THREE.Group();
  scene.add(group);
  const puffs: THREE.Mesh[] = [];
  const base: [number, number, number][] = [
    [-1.4, 1.4, 16.2],
    [-0.6, 1.5, 15.9],
    [0.5, 1.35, 16.3],
    [-2.0, 1.2, 16.6],
  ];
  for (const [x, y, z] of base) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
    q.position.set(x, y, z);
    q.userData = { x, y, z, phase: Math.random() * 10, speed: 0.18 + Math.random() * 0.12 };
    group.add(q);
    puffs.push(q);
  }

  return {
    group,
    update: (t: number, cam: THREE.Vector3) => {
      for (const q of puffs) {
        const u = q.userData as { x: number; y: number; z: number; phase: number; speed: number };
        const k = ((t * u.speed + u.phase) % 1 + 1) % 1;
        q.position.set(
          u.x + Math.sin(t * 0.4 + u.phase) * 0.18,
          u.y + k * 1.9,
          u.z + Math.cos(t * 0.33 + u.phase) * 0.12
        );
        const s = 0.5 + k * 2.1;
        q.scale.set(s, s, s);
        q.lookAt(cam);
        (q.material as THREE.MeshBasicMaterial).opacity = 0.34 * (1 - k) * (0.4 + 0.6 * Math.sin(k * Math.PI));
      }
    },
  };
}
