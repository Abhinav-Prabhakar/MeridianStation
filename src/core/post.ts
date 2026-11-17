import * as THREE from "three";

/**
 * Hand-written post chain. No postprocessing library.
 *
 *   scene(HDR) ─┬─ SSAO (half res) ── blur ──┐
 *               ├─ bright ── downsample ── blur H/V ─┤
 *               └──────────────────────────────────────┴─ composite ─▶ screen
 *
 * Composite does AO, bloom, ACES, grade, vignette, chromatic aberration,
 * film grain and FXAA in a single pass.
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
  // slight chromatic aberration toward the frame edge
  vec2 dir = (uv - 0.5);
  float ca = uCA * dot(dir, dir);
  vec3 col;
  col.r = fetchScene(uv + dir * ca).r;
  col.g = fetchScene(uv).g;
  col.b = fetchScene(uv - dir * ca).b;

  float ao = texture2D(tAO, uv).r;
  ao = mix(1.0, ao, uAOStrength);
  col *= ao;

  vec3 bloom = texture2D(tBloom, uv).rgb;
  col += bloom * uBloom;

  col *= uExposure;
  col *= uTint;

  col = ACESFilm(col);
  col = pow(col, vec3(1.0 / 2.2));

  // split tone: cool toes, warm shoulders. This is what separates a film scan
  // from a sepia wash — shadows go blue, highlights go amber.
  float l = luma(col);
  vec3 tone = mix(vec3(0.90, 0.965, 1.065), vec3(1.06, 1.0, 0.92), smoothstep(0.02, 0.72, l));
  col *= tone;

  // filmic S-curve
  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);

  l = luma(col);
  col = mix(vec3(l), col, uSaturation);
  col += uLift * (1.0 - col) * 0.06;

  // vignette
  float v = smoothstep(0.95, 0.2, length(dir) * 1.15);
  col *= mix(1.0, v, uVignette);

  // film grain (luminance weighted so shadows stay clean)
  float g = hash(uv * uRes + fract(uTime) * 91.7) - 0.5;
  col += g * uGrain * (0.35 + 0.65 * (1.0 - l));

  // cheap FXAA
  vec2 texel = 1.0 / uRes;
  float lNW = luma(fetchScene(uv + vec2(-1.0, -1.0) * texel));
  float lNE = luma(fetchScene(uv + vec2( 1.0, -1.0) * texel));
  float lSW = luma(fetchScene(uv + vec2(-1.0,  1.0) * texel));
  float lSE = luma(fetchScene(uv + vec2( 1.0,  1.0) * texel));
  float lM = luma(col);
  float edge = abs(lNW + lNE - lSW - lSE) + abs(lNE - lSW) * 2.0;
  if (edge > 0.09) {
    vec3 blur = (fetchScene(uv + vec2(-1.0, 0.0) * texel) + fetchScene(uv + vec2(1.0, 0.0) * texel)
               + fetchScene(uv + vec2(0.0, -1.0) * texel) + fetchScene(uv + vec2(0.0, 1.0) * texel)) * 0.25;
    col = mix(col, pow(blur, vec3(1.0/2.2)) * 1.0, clamp((edge - 0.09) * 2.0, 0.0, 0.65));
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

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

  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad = fsQuad(new THREE.ShaderMaterial());

  private aoMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  private brightMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private bloomBlurMat: THREE.ShaderMaterial;

  private w = 1;
  private h = 1;
  private frame = 0;
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
        uThreshold: { value: 1.05 },
        uKnee: { value: 0.4 },
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
        uRes: { value: new THREE.Vector2() },
        uExposure: { value: 1.0 },
        uAOStrength: { value: 1.0 },
        uBloom: { value: 0.55 },
        uVignette: { value: 0.45 },
        uGrain: { value: 0.055 },
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

    this.rtAO?.dispose();
    this.rtAO = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.rtAO2?.dispose();
    this.rtAO2 = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.UnsignedByteType, depthBuffer: false });

    this.rtBloomA?.dispose();
    this.rtBloomA = new THREE.WebGLRenderTarget(qw, qh, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.rtBloomB?.dispose();
    this.rtBloomB = new THREE.WebGLRenderTarget(qw, qh, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });

    (this.compMat.uniforms.uRes.value as THREE.Vector2).set(this.w, this.h);
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

  private blit(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.frame++;
    const r = this.renderer;

    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    this.stats.calls = r.info.render.calls;
    this.stats.tris = r.info.render.triangles;

    // --- SSAO
    const au = this.aoMat.uniforms;
    au.tDepth.value = this.rtScene.depthTexture;
    (au.uInvProj.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (au.uProj.value as THREE.Matrix4).copy(camera.projectionMatrix);
    (au.uRes.value as THREE.Vector2).set(this.w, this.h);
    au.uNear.value = camera.near;
    au.uFar.value = camera.far;
    this.blit(this.aoMat, this.rtAO);

    // blur AO (separable)
    (this.blurMat.uniforms.tDiffuse.value as THREE.Texture) = this.rtAO.texture;
    (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(1, 0);
    (this.blurMat.uniforms.uTexel.value as THREE.Vector2).set(1 / (this.w / 2), 1 / (this.h / 2));
    this.blit(this.blurMat, this.rtAO2);

    (this.blurMat.uniforms.tDiffuse.value as THREE.Texture) = this.rtAO2.texture;
    (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(0, 1);
    this.blit(this.blurMat, this.rtAO);

    // --- bloom
    (this.brightMat.uniforms.tDiffuse.value as THREE.Texture) = this.rtScene.texture;
    this.blit(this.brightMat, this.rtBloomA);

    const bw = this.rtBloomA.width;
    const bh = this.rtBloomA.height;
    (this.bloomBlurMat.uniforms.uTexel.value as THREE.Vector2).set(1 / bw, 1 / bh);
    (this.bloomBlurMat.uniforms.uDir.value as THREE.Vector2).set(1, 0);
    (this.bloomBlurMat.uniforms.tDiffuse.value as THREE.Texture) = this.rtBloomA.texture;
    this.blit(this.bloomBlurMat, this.rtBloomB);

    (this.bloomBlurMat.uniforms.uDir.value as THREE.Vector2).set(0, 1);
    (this.bloomBlurMat.uniforms.tDiffuse.value as THREE.Texture) = this.rtBloomB.texture;
    this.blit(this.bloomBlurMat, this.rtBloomA);

    // --- composite
    const cu = this.compMat.uniforms;
    cu.tScene.value = this.rtScene.texture;
    cu.tAO.value = this.rtAO.texture;
    cu.tBloom.value = this.rtBloomA.texture;
    cu.uTime.value = performance.now() / 1000;
    this.blit(this.compMat, null);
  }
}
