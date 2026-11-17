import * as THREE from "three";

/**
 * Hand-written post chain. No postprocessing library.
 *
 *   scene(HDR) ─┬─ SSAO (half res) ── blur ──┐
 *               ├─ bright ── downsample ── blur H/V ── downsample ── blur H/V ─┤
 *               └──────────────────────────────┴─ composite ─▶ dof ─▶ taa ─▶ screen
 *
 * Composite does AO, bloom, lens dirt, ACES, split-tone grade, vignette,
 * chromatic aberration and grain. DoF resolves against the depth buffer, and
 * TAA reprojects the previous frame with sub-pixel jitter — which is what
 * finally removes the rasterised edge shimmer of FXAA alone.
 */

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const AO_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uProj;
uniform vec2 uRes;
uniform vec3 uKernel[16];
uniform float uRadius;
uniform float uBias;
uniform float uNear;
uniform float uFar;

vec3 viewPos(vec2 uv, float d){
  vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * clip;
  return v.xyz / v.w;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main(){
  float d = texture2D(tDepth, vUv).x;
  if (d >= 0.9999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv, d);
  vec3 px = viewPos(vUv + vec2(1.0 / uRes.x, 0.0), texture2D(tDepth, vUv + vec2(1.0/uRes.x, 0.0)).x);
  vec3 py = viewPos(vUv + vec2(0.0, 1.0 / uRes.y), texture2D(tDepth, vUv + vec2(0.0, 1.0/uRes.y)).x);
  vec3 n = normalize(cross(px - P, py - P));
  if (dot(n, -P) < 0.0) n = -n;

  float ang = hash(vUv * uRes) * 6.2831853;
  float s = sin(ang), c = cos(ang);
  float occ = 0.0;
  for (int i = 0; i < 16; i++){
    vec3 k = uKernel[i];
    k = vec3(k.x * c - k.y * s, k.x * s + k.y * c, k.z);
    if (dot(k, n) < 0.0) k = -k;
    vec3 sp = P + k * uRadius;
    vec4 clip = uProj * vec4(sp, 1.0);
    vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float sd = texture2D(tDepth, suv).x;
    vec3 spReal = viewPos(suv, sd);
    float rangeCheck = smoothstep(0.0, 1.0, uRadius / max(0.0001, abs(P.z - spReal.z)));
    if (spReal.z >= sp.z + uBias) occ += rangeCheck;
  }
  float ao = 1.0 - occ / 16.0;
  gl_FragColor = vec4(vec3(ao), 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uDir;
uniform vec2 uTexel;
void main(){
  vec3 sum = vec3(0.0);
  sum += texture2D(tDiffuse, vUv - uDir * uTexel * 4.0).rgb * 0.051;
  sum += texture2D(tDiffuse, vUv - uDir * uTexel * 3.0).rgb * 0.0918;
  sum += texture2D(tDiffuse, vUv - uDir * uTexel * 2.0).rgb * 0.12245;
  sum += texture2D(tDiffuse, vUv - uDir * uTexel * 1.0).rgb * 0.1531;
  sum += texture2D(tDiffuse, vUv).rgb * 0.1633;
  sum += texture2D(tDiffuse, vUv + uDir * uTexel * 1.0).rgb * 0.1531;
  sum += texture2D(tDiffuse, vUv + uDir * uTexel * 2.0).rgb * 0.12245;
  sum += texture2D(tDiffuse, vUv + uDir * uTexel * 3.0).rgb * 0.0918;
  sum += texture2D(tDiffuse, vUv + uDir * uTexel * 4.0).rgb * 0.051;
  gl_FragColor = vec4(sum, 1.0);
}
`;

const BRIGHT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 0.0001);
  float contrib = max(soft, l - uThreshold) / max(l, 0.0001);
  gl_FragColor = vec4(c * contrib, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tAO;
uniform sampler2D tBloom;
uniform sampler2D tBloomWide;
uniform sampler2D tDirt;
uniform vec2 uRes;
uniform float uExposure;
uniform float uAOStrength;
uniform float uBloom;
uniform float uVignette;
uniform float uGrain;
uniform float uCA;
uniform float uTime;
uniform float uSaturation;
uniform float uContrast;
uniform float uLift;
uniform vec3 uTint;

vec3 ACESFilm(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 fetchScene(vec2 uv){ return texture2D(tScene, uv).rgb; }

void main(){
  vec2 uv = vUv;
  // chromatic aberration, strongest at the very edge of the frame
  vec2 dir = (uv - 0.5);
  float ca = uCA * dot(dir, dir);
  vec3 col;
  col.r = fetchScene(uv + dir * ca).r;
  col.g = fetchScene(uv).g;
  col.b = fetchScene(uv - dir * ca).b;

  float ao = texture2D(tAO, uv).r;
  ao = mix(1.0, ao, uAOStrength);
  col *= ao;

  // two-scale bloom: a tight core plus a wide haze, modulated by lens dirt
  vec3 bloom = texture2D(tBloom, uv).rgb * 0.72 + texture2D(tBloomWide, uv).rgb * 1.05;
  float dirt = texture2D(tDirt, uv).r;
  col += bloom * uBloom * (0.75 + 1.6 * dirt);

  col *= uExposure;
  col *= uTint;

  col = ACESFilm(col);
  col = pow(col, vec3(1.0 / 2.2));

  // split tone: cool toes, warm shoulders
  float l = luma(col);
  vec3 tone = mix(vec3(0.90, 0.965, 1.065), vec3(1.06, 1.0, 0.92), smoothstep(0.02, 0.72, l));
  col *= tone;

  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);

  l = luma(col);
  col = mix(vec3(l), col, uSaturation);
  col += uLift * (1.0 - col) * 0.06;

  float v = smoothstep(0.95, 0.2, length(dir) * 1.15);
  col *= mix(1.0, v, uVignette);

  float g = hash(uv * uRes + fract(uTime) * 91.7) - 0.5;
  col += g * uGrain * (0.35 + 0.65 * (1.0 - l));

  gl_FragColor = vec4(col, 1.0);
}
`;

const DOF_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform vec2 uRes;
uniform float uFocus;
uniform float uAperture;
uniform float uMaxCoc;

float linearZ(float d){
  vec4 v = uInvProj * vec4(0.0, 0.0, d * 2.0 - 1.0, 1.0);
  return -v.z / v.w;
}

void main(){
  float d = texture2D(tDepth, vUv).x;
  vec3 col = texture2D(tColor, vUv).rgb;
  float z = linearZ(d);
  float coc = clamp(abs(z - uFocus) / max(uFocus, 0.4) * uAperture, 0.0, uMaxCoc);

  if (coc < 0.55) { gl_FragColor = vec4(col, 1.0); return; }

  // 14 taps on a golden-angle spiral, weighted toward the centre
  float radius = coc;
  vec3 sum = col;
  float wsum = 1.0;
  const float GOLDEN = 2.39996323;
  for (int i = 1; i <= 14; i++){
    float fi = float(i);
    float a = fi * GOLDEN;
    float r = sqrt(fi / 14.0) * radius;
    vec2 off = vec2(cos(a), sin(a)) * r * (1.0 / uRes);
    vec3 s = texture2D(tColor, vUv + off).rgb;
    float w = 1.0 - fi / 18.0;
    sum += s * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}
`;

const TAA_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tHistory;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform mat4 uPrevViewProj;
uniform vec2 uRes;
uniform float uBlend;
uniform float uValid;

vec3 viewPos(vec2 uv, float d){
  vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * clip;
  return v.xyz / v.w;
}

void main(){
  vec2 uv = vUv;
  vec2 texel = 1.0 / uRes;
  vec3 col = texture2D(tColor, uv).rgb;

  float d = texture2D(tDepth, uv).x;
  vec2 prevUv = uv;
  bool ok = false;
  if (d < 0.99999 && uValid > 0.5) {
    vec3 P = viewPos(uv, d);
    vec4 world = uCamWorld * vec4(P, 1.0);
    vec4 prev = uPrevViewProj * world;
    if (prev.w > 0.0001) {
      prevUv = prev.xy / prev.w * 0.5 + 0.5;
      ok = prevUv.x > 0.002 && prevUv.x < 0.998 && prevUv.y > 0.002 && prevUv.y < 0.998;
    }
  }

  if (!ok) { gl_FragColor = vec4(col, 1.0); return; }

  vec3 hist = texture2D(tHistory, prevUv).rgb;

  // neighbourhood clamp kills the worst ghosting from moving doors and hands
  vec3 mn = col, mx = col;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec3 c = texture2D(tColor, uv + vec2(float(x), float(y)) * texel).rgb;
      mn = min(mn, c);
      mx = max(mx, c);
    }
  }
  hist = clamp(hist, mn, mx);

  gl_FragColor = vec4(mix(hist, col, uBlend), 1.0);
}
`;

/** Cheap lens-dirt mask: blotches + a faint radial smear. */
function makeDirtTexture(): THREE.DataTexture {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const rnd = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const blobs: [number, number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    blobs.push([rand(), rand(), 0.02 + rand() * 0.09, 0.25 + rand() * 0.7]);
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      let d = 0.06 + 0.05 * rnd(x * 0.3, y * 0.3);
      for (const [bx, by, br, ba] of blobs) {
        const dx = u - bx;
        const dy = v - by;
        const r2 = dx * dx + dy * dy;
        d += ba * Math.exp(-r2 / (br * br)) * 0.55;
      }
      const edge = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2.2);
      d *= 0.3 + 0.7 * edge;
      const val = Math.max(0, Math.min(255, Math.round(d * 255)));
      const i = (y * S + x) * 4;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  return tex;
}

function fsQuad(mat: THREE.ShaderMaterial) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

export class PostChain {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene | null = null;
  camera: THREE.PerspectiveCamera | null = null;

  rtScene!: THREE.WebGLRenderTarget;
  rtAO!: THREE.WebGLRenderTarget;
  rtAO2!: THREE.WebGLRenderTarget;
  rtBloomA!: THREE.WebGLRenderTarget;
  rtBloomB!: THREE.WebGLRenderTarget;
  rtBloomC!: THREE.WebGLRenderTarget;
  rtBloomD!: THREE.WebGLRenderTarget;
  rtComp!: THREE.WebGLRenderTarget;
  rtDof!: THREE.WebGLRenderTarget;
  rtHistA!: THREE.WebGLRenderTarget;
  rtHistB!: THREE.WebGLRenderTarget;

  /** camera for the overlay pass: sits at the origin, borrows the world projection */
  private overlayCam = new THREE.PerspectiveCamera();
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad = fsQuad(new THREE.ShaderMaterial());

  private aoMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  private brightMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private bloomBlurMat: THREE.ShaderMaterial;
  private dofMat: THREE.ShaderMaterial;
  private taaMat: THREE.ShaderMaterial;
  private copyMat: THREE.ShaderMaterial;

  private w = 1;
  private h = 1;
  private frame = 0;
  private histIndex = 0;

  private cleanProj = new THREE.Matrix4();
  private cleanProjInv = new THREE.Matrix4();
  private prevProj = new THREE.Matrix4();
  private prevView = new THREE.Matrix4();
  private prevViewProj = new THREE.Matrix4();
  private prevValid = false;

  /** distance the lens is focused at, in metres */
  focus = 4;

  stats = { calls: 0, tris: 0 };

  constructor(renderer: THREE.WebGLRenderer, w: number, h: number) {
    this.renderer = renderer;

    this.aoMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: AO_FRAG,
      uniforms: {
        tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() },
        uProj: { value: new THREE.Matrix4() },
        uRes: { value: new THREE.Vector2() },
        uKernel: {
          value: (() => {
            const k: THREE.Vector3[] = [];
            for (let i = 0; i < 16; i++) {
              const v = new THREE.Vector3(
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
                Math.random() * 0.9 + 0.1
              ).normalize();
              v.multiplyScalar((i + 1) / 16);
              k.push(v);
            }
            return k;
          })(),
        },
        uRadius: { value: 0.62 },
        uBias: { value: 0.025 },
        uNear: { value: 0.05 },
        uFar: { value: 60 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        uDir: { value: new THREE.Vector2(1, 0) },
        uTexel: { value: new THREE.Vector2() },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 1.0 },
        uKnee: { value: 0.45 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.bloomBlurMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        uDir: { value: new THREE.Vector2(1, 0) },
        uTexel: { value: new THREE.Vector2() },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.compMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null },
        tAO: { value: null },
        tBloom: { value: null },
        tBloomWide: { value: null },
        tDirt: { value: makeDirtTexture() },
        uRes: { value: new THREE.Vector2() },
        uExposure: { value: 1.0 },
        uAOStrength: { value: 1.0 },
        uBloom: { value: 0.5 },
        uVignette: { value: 0.5 },
        uGrain: { value: 0.03 },
        uCA: { value: 0.0012 },
        uTime: { value: 0 },
        uSaturation: { value: 0.99 },
        uContrast: { value: 0.26 },
        uLift: { value: 0.0 },
        uTint: { value: new THREE.Color(1, 1, 1) },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.dofMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: DOF_FRAG,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() },
        uRes: { value: new THREE.Vector2() },
        uFocus: { value: 4 },
        uAperture: { value: 2.3 },
        uMaxCoc: { value: 4.5 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.taaMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: TAA_FRAG,
      uniforms: {
        tColor: { value: null },
        tHistory: { value: null },
        tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uRes: { value: new THREE.Vector2() },
        uBlend: { value: 0.14 },
        uValid: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.copyMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse;
        void main(){ gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }`,
      uniforms: { tDiffuse: { value: null } },
      depthTest: false,
      depthWrite: false,
    });

    this.setSize(w, h);
    this.quadScene.add(this.quad);
  }

  setSize(w: number, h: number) {
    this.w = Math.max(2, Math.floor(w));
    this.h = Math.max(2, Math.floor(h));

    this.rtScene?.dispose();
    this.rtScene = new THREE.WebGLRenderTarget(this.w, this.h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    const dt = new THREE.DepthTexture(this.w, this.h);
    dt.type = THREE.UnsignedIntType;
    dt.format = THREE.DepthFormat;
    this.rtScene.depthTexture = dt;
    this.rtScene.texture.generateMipmaps = false;

    const hw = Math.max(2, Math.floor(this.w / 2));
    const hh = Math.max(2, Math.floor(this.h / 2));
    const qw = Math.max(2, Math.floor(this.w / 4));
    const qh = Math.max(2, Math.floor(this.h / 4));
    const ew = Math.max(2, Math.floor(this.w / 8));
    const eh = Math.max(2, Math.floor(this.h / 8));

    this.rtAO?.dispose();
    this.rtAO = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.rtAO2?.dispose();
    this.rtAO2 = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.UnsignedByteType, depthBuffer: false });

    this.rtBloomA?.dispose();
    this.rtBloomA = new THREE.WebGLRenderTarget(qw, qh, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtBloomB?.dispose();
    this.rtBloomB = new THREE.WebGLRenderTarget(qw, qh, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtBloomC?.dispose();
    this.rtBloomC = new THREE.WebGLRenderTarget(ew, eh, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtBloomD?.dispose();
    this.rtBloomD = new THREE.WebGLRenderTarget(ew, eh, { type: THREE.HalfFloatType, depthBuffer: false });

    const opts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    } as const;
    this.rtComp?.dispose();
    this.rtComp = new THREE.WebGLRenderTarget(this.w, this.h, opts);
    this.rtDof?.dispose();
    this.rtDof = new THREE.WebGLRenderTarget(this.w, this.h, opts);
    this.rtHistA?.dispose();
    this.rtHistA = new THREE.WebGLRenderTarget(this.w, this.h, opts);
    this.rtHistB?.dispose();
    this.rtHistB = new THREE.WebGLRenderTarget(this.w, this.h, opts);

    (this.compMat.uniforms.uRes.value as THREE.Vector2).set(this.w, this.h);
    (this.dofMat.uniforms.uRes.value as THREE.Vector2).set(this.w, this.h);
    (this.taaMat.uniforms.uRes.value as THREE.Vector2).set(this.w, this.h);
    this.prevValid = false;
  }

  set exposure(v: number) {
    this.compMat.uniforms.uExposure.value = v;
  }
  set bloom(v: number) {
    this.compMat.uniforms.uBloom.value = v;
  }
  set tint(c: THREE.Color) {
    (this.compMat.uniforms.uTint.value as THREE.Color).copy(c);
  }
  set dofEnabled(v: boolean) {
    this.dofMat.uniforms.uAperture.value = v ? 2.3 : 0.0;
  }

  resetHistory() {
    this.prevValid = false;
  }

  private blit(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  /**
   * Render the world, then optionally stamp an *overlay* scene on top with a
   * cleared depth buffer. That is how the first-person torch gets drawn: its own
   * scene, its own lights, always in front of the world, but still inside the
   * same post chain so it is tonemapped, bloomed, graded and temporally resolved
   * exactly like everything else.
   */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: THREE.Scene) {
    this.scene = scene;
    this.camera = camera;
    this.frame++;
    const r = this.renderer;

    // ---- sub-pixel jitter (Halton 2,3) for temporal AA
    this.cleanProj.copy(camera.projectionMatrix);
    this.cleanProjInv.copy(camera.projectionMatrixInverse);
    const jx = this.halton(this.frame % 64 + 1, 2) - 0.5;
    const jy = this.halton(this.frame % 64 + 1, 3) - 0.5;
    camera.projectionMatrix.elements[8] += (jx * 2) / this.w;
    camera.projectionMatrix.elements[9] += (jy * 2) / this.h;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    this.stats.calls = r.info.render.calls;
    this.stats.tris = r.info.render.triangles;
    if (overlay) {
      // the overlay is authored in *camera space*, so it needs a camera at the
      // origin with the world camera's projection — not the world camera itself
      const oc = this.overlayCam;
      oc.fov = camera.fov;
      oc.aspect = camera.aspect;
      oc.near = camera.near;
      oc.far = camera.far;
      oc.updateProjectionMatrix();
      oc.projectionMatrix.copy(camera.projectionMatrix);
      oc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      oc.matrixWorld.identity();
      oc.matrixWorldInverse.identity();
      r.autoClear = false;
      r.clearDepth();
      r.render(overlay, oc);
      r.autoClear = true;
    }

    // --- SSAO
    const au = this.aoMat.uniforms;
    au.tDepth.value = this.rtScene.depthTexture;
    (au.uInvProj.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (au.uProj.value as THREE.Matrix4).copy(camera.projectionMatrix);
    (au.uRes.value as THREE.Vector2).set(this.w, this.h);
    au.uNear.value = camera.near;
    au.uFar.value = camera.far;
    this.blit(this.aoMat, this.rtAO);

    (this.blurMat.uniforms.tDiffuse.value as THREE.Texture) = this.rtAO.texture;
    (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(1, 0);
    (this.blurMat.uniforms.uTexel.value as THREE.Vector2).set(1 / (this.w / 2), 1 / (this.h / 2));
    this.blit(this.blurMat, this.rtAO2);

    (this.blurMat.uniforms.tDiffuse.value as THREE.Texture) = this.rtAO2.texture;
    (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(0, 1);
    this.blit(this.blurMat, this.rtAO);

    // --- bloom: tight core at 1/4, wide haze at 1/8
    (this.brightMat.uniforms.tDiffuse.value as THREE.Texture) = this.rtScene.texture;
    this.blit(this.brightMat, this.rtBloomA);

    const bu = this.bloomBlurMat.uniforms;
    (bu.uTexel.value as THREE.Vector2).set(1 / this.rtBloomA.width, 1 / this.rtBloomA.height);
    (bu.uDir.value as THREE.Vector2).set(1, 0);
    bu.tDiffuse.value = this.rtBloomA.texture;
    this.blit(this.bloomBlurMat, this.rtBloomB);
    (bu.uDir.value as THREE.Vector2).set(0, 1);
    bu.tDiffuse.value = this.rtBloomB.texture;
    this.blit(this.bloomBlurMat, this.rtBloomA);

    // wide pass: quarter of the quarter, blurred twice more
    (bu.uTexel.value as THREE.Vector2).set(1 / this.rtBloomC.width, 1 / this.rtBloomC.height);
    (bu.uDir.value as THREE.Vector2).set(1, 0);
    bu.tDiffuse.value = this.rtBloomA.texture;
    this.blit(this.bloomBlurMat, this.rtBloomC);
    (bu.uDir.value as THREE.Vector2).set(0, 1);
    bu.tDiffuse.value = this.rtBloomC.texture;
    this.blit(this.bloomBlurMat, this.rtBloomC);
    (bu.uDir.value as THREE.Vector2).set(1, 0);
    bu.tDiffuse.value = this.rtBloomC.texture;
    this.blit(this.bloomBlurMat, this.rtBloomD);
    (bu.uDir.value as THREE.Vector2).set(0, 1);
    bu.tDiffuse.value = this.rtBloomD.texture;
    this.blit(this.bloomBlurMat, this.rtBloomC);

    // --- composite
    const cu = this.compMat.uniforms;
    cu.tScene.value = this.rtScene.texture;
    cu.tAO.value = this.rtAO.texture;
    cu.tBloom.value = this.rtBloomA.texture;
    cu.tBloomWide.value = this.rtBloomC.texture;
    cu.uTime.value = performance.now() / 1000;
    this.blit(this.compMat, this.rtComp);

    // --- depth of field
    const du = this.dofMat.uniforms;
    du.tColor.value = this.rtComp.texture;
    du.tDepth.value = this.rtScene.depthTexture;
    (du.uInvProj.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    du.uFocus.value = this.focus;
    this.blit(this.dofMat, this.rtDof);

    // --- temporal AA
    const tu = this.taaMat.uniforms;
    const hist = this.histIndex === 0 ? this.rtHistA : this.rtHistB;
    const out = this.histIndex === 0 ? this.rtHistB : this.rtHistA;
    tu.tColor.value = this.rtDof.texture;
    tu.tHistory.value = hist.texture;
    tu.tDepth.value = this.rtScene.depthTexture;
    (tu.uInvProj.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (tu.uCamWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    (tu.uPrevViewProj.value as THREE.Matrix4).copy(this.prevViewProj);
    tu.uValid.value = this.prevValid ? 1 : 0;
    this.blit(this.taaMat, out);

    // resolve to screen
    (this.copyMat.uniforms.tDiffuse.value as THREE.Texture) = out.texture;
    this.blit(this.copyMat, null);

    this.histIndex ^= 1;

    // remember this frame's unjittered camera for the next reprojection
    this.prevProj.copy(this.cleanProj);
    this.prevView.copy(camera.matrixWorldInverse);
    this.prevViewProj.multiplyMatrices(this.prevProj, this.prevView);
    this.prevValid = true;

    camera.projectionMatrix.copy(this.cleanProj);
    camera.projectionMatrixInverse.copy(this.cleanProjInv);
  }

  private halton(i: number, base: number) {
    let f = 1;
    let r = 0;
    while (i > 0) {
      f /= base;
      r += f * (i % base);
      i = Math.floor(i / base);
    }
    return r;
  }
}
