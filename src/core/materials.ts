import * as THREE from "three";
import { asset } from "./asset";

/**
 * Material library.
 *
 * Every surface in MERIDIAN comes from here. Real CC0 photogrammetry maps
 * (ambientCG) are baked into the build; nothing is a flat colour.
 *
 * UVs are authored in *world units* (metres) by the geometry kit, so texture
 * `repeat` stays 1 and every surface tiles at a physically consistent scale.
 */

export type MatLib = Record<string, THREE.MeshStandardMaterial>;

interface Spec {
  /** ambientCG asset folder under /tex */
  id: string;
  /** world metres per texture tile */
  scale: number;
  color?: number;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  /** tint strength 0..1 — 0 means "use the map's own albedo" */
  tint?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  emissive?: number;
  emissiveIntensity?: number;
}

const SPECS: Record<string, Spec> = {
  // ---- architectural shell ----------------------------------------------
  concrete: { id: "Concrete048", scale: 2.2, roughness: 1.0, normalScale: 1.0 },
  concreteWall: { id: "Concrete048", scale: 3.0, color: 0xb9b2a6, tint: 0.35, roughness: 1.0 },
  concreteWet: { id: "Concrete048", scale: 2.0, color: 0x8d8b84, tint: 0.3, roughness: 0.72 },
  asphalt: { id: "Concrete049", scale: 3.0, roughness: 0.95 },

  plaster: { id: "PaintedPlaster017", scale: 2.6, color: 0xa89c86, tint: 0.62, roughness: 0.94 },
  plasterGreen: { id: "PaintedPlaster017", scale: 2.6, color: 0x8c9a86, tint: 0.42, roughness: 0.9 },
  plasterOx: { id: "PaintedPlaster017", scale: 2.6, color: 0xa8896b, tint: 0.4, roughness: 0.92 },
  plasterCeil: { id: "PaintedPlaster017", scale: 3.0, color: 0x9a9284, tint: 0.55, roughness: 0.96 },

  terrazzo: { id: "Terrazzo013", scale: 1.2, color: 0x4a5148, tint: 0.72, roughness: 0.55 },
  tile: { id: "Tiles040", scale: 1.6, color: 0xcfd0c8, tint: 0.3, roughness: 0.42 },
  tileGreen: { id: "Tiles040", scale: 1.6, color: 0x5d7361, tint: 0.55, roughness: 0.42 },
  wood: { id: "WoodFloor051", scale: 1.7, color: 0x8d6a42, tint: 0.35, roughness: 0.68 },
  plate: { id: "DiamondPlate009", scale: 1.2, roughness: 0.55, metalness: 0.85 },
  brick: { id: "Bricks060", scale: 1.9, color: 0xb9af9d, tint: 0.45, roughness: 0.94 },
  paper: { id: "Paper006", scale: 0.5, roughness: 0.95 },
  fabric: { id: "Fabric086", scale: 1.1, color: 0x55604f, tint: 0.4, roughness: 1.0 },

  // ---- metals ------------------------------------------------------------
  steel: { id: "Metal027", scale: 1.4, color: 0x8d9296, tint: 0.3, roughness: 0.55, metalness: 0.8 },
  steelDark: { id: "Metal027", scale: 1.4, color: 0x4c5155, tint: 0.55, roughness: 0.62, metalness: 0.75 },
  steelPale: { id: "Metal027", scale: 1.4, color: 0xa9b0b4, tint: 0.3, roughness: 0.45, metalness: 0.8 },
  rust: { id: "Metal064", scale: 1.0, roughness: 0.88, metalness: 0.55 },
  rustDark: { id: "Metal064", scale: 1.0, color: 0x7a5f4a, tint: 0.4, roughness: 0.9, metalness: 0.5 },
};

function makeMat(lib: THREE.Texture[], spec: Spec): THREE.MeshStandardMaterial {
  const [color, normal, rough, ao, metal] = lib;
  const m = new THREE.MeshStandardMaterial({
    map: color,
    normalMap: normal ?? null,
    roughnessMap: rough ?? null,
    aoMap: ao ?? null,
    metalnessMap: metal ?? null,
    color: spec.color !== undefined ? new THREE.Color(spec.color) : 0xffffff,
    roughness: spec.roughness ?? 1,
    metalness: spec.metalness ?? 0,
    normalScale: new THREE.Vector2(spec.normalScale ?? 1, spec.normalScale ?? 1),
    transparent: spec.transparent ?? false,
    opacity: spec.opacity ?? 1,
    side: spec.side ?? THREE.FrontSide,
    emissive: spec.emissive ?? 0x000000,
    emissiveIntensity: spec.emissiveIntensity ?? 0,
  });
  if (spec.tint !== undefined && spec.color !== undefined) {
    // Blend map albedo toward the tint so the material keeps its grain.
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          float lum = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 tinted = diffuseColor.rgb * (0.58 + 0.86 * lum);
          sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb * diffuseColor.rgb, tinted, ${spec.tint!.toFixed(3)});
          diffuseColor.rgb = sampledDiffuseColor.rgb;
        #endif
        `
      );
    };
    m.userData.tinted = true;
  }
  return m;
}

async function loadTexSet(
  loader: THREE.TextureLoader,
  id: string,
  maxAniso: number,
  srgb: boolean
): Promise<THREE.Texture | null> {
  const base = `/tex/${id}/${id}_1K-JPG_`;
  const url = (suffix: string) => `${base}${suffix}.jpg`;
  const tryLoad = (suffix: string) =>
    new Promise<THREE.Texture | null>((res) => {
      loader.load(
        url(suffix),
        (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = maxAniso;
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          t.needsUpdate = true;
          res(t);
        },
        undefined,
        () => res(null)
      );
    });
  return tryLoad("Color");
}

export async function buildMaterials(
  renderer: THREE.WebGLRenderer,
  onProgress?: (f: number) => void
): Promise<MatLib> {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const lib: MatLib = {};

  const ids = [...new Set(Object.values(SPECS).map((s) => s.id))];
  const cache = new Map<string, THREE.Texture[]>();
  let done = 0;

  const loadOne = async (id: string) => {
    const b = asset(`tex/${id}/${id}_1K-JPG_`);
    const load = (suffix: string, srgb: boolean) =>
      new Promise<THREE.Texture | null>((res) => {
        const l = new THREE.TextureLoader();
        l.load(
          `${b}${suffix}.jpg`,
          (t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = aniso;
            if (srgb) t.colorSpace = THREE.SRGBColorSpace;
            res(t);
          },
          undefined,
          () => res(null)
        );
      });
    const [c, n, r, ao, mt] = await Promise.all([
      load("Color", true),
      load("NormalGL", false),
      load("Roughness", false),
      load("AmbientOcclusion", false),
      load("Metalness", false),
    ]);
    return [c, n, r, ao, mt].filter(Boolean) as THREE.Texture[];
  };

  await Promise.all(
    ids.map(async (id) => {
      cache.set(id, await loadOne(id));
      done++;
      onProgress?.(done / ids.length);
    })
  );

  for (const [name, spec] of Object.entries(SPECS)) {
    const set = cache.get(spec.id) ?? [];
    lib[name] = makeMat(set, spec);
  }

  // ---- bespoke materials that need no photographic map -------------------
  const add = (name: string, m: THREE.MeshStandardMaterial) => (lib[name] = m);

  add(
    "brass",
    new THREE.MeshStandardMaterial({ color: 0xb08d4a, metalness: 1.0, roughness: 0.34 })
  );
  add(
    "brassDark",
    new THREE.MeshStandardMaterial({ color: 0x6d5830, metalness: 1.0, roughness: 0.55 })
  );
  add(
    "copper",
    new THREE.MeshStandardMaterial({ color: 0x5c4632, metalness: 1.0, roughness: 0.58 })
  );
  add(
    "copperPatina",
    new THREE.MeshStandardMaterial({ color: 0x3f4f47, metalness: 0.85, roughness: 0.68 })
  );
  add(
    "bakelite",
    new THREE.MeshStandardMaterial({ color: 0x1a1512, metalness: 0.0, roughness: 0.42 })
  );
  add(
    "bakeliteBrown",
    new THREE.MeshStandardMaterial({ color: 0x3a2114, metalness: 0.0, roughness: 0.38 })
  );
  add(
    "rubber",
    new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.0, roughness: 0.92 })
  );
  add(
    "leather",
    new THREE.MeshStandardMaterial({ color: 0x4a2f1c, metalness: 0.0, roughness: 0.66 })
  );
  add(
    "glass",
    new THREE.MeshPhysicalMaterial({
      color: 0xdfe8ea,
      metalness: 0,
      roughness: 0.06,
      transmission: 0.92,
      thickness: 0.02,
      transparent: true,
      opacity: 0.35,
      ior: 1.5,
    })
  );
  add(
    "glassDirty",
    new THREE.MeshStandardMaterial({
      color: 0x9aa6a4,
      metalness: 0.1,
      roughness: 0.28,
      transparent: true,
      opacity: 0.42,
    })
  );
  add(
    "foam",
    new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: 0.0, roughness: 1.0 })
  );
  add(
    "felt",
    new THREE.MeshStandardMaterial({ color: 0x2a2320, metalness: 0.0, roughness: 1.0 })
  );
  add(
    "black",
    new THREE.MeshStandardMaterial({ color: 0x0b0c0d, metalness: 0.2, roughness: 0.7 })
  );

  // emissive glass for lit fixtures
  const bulb = new THREE.MeshStandardMaterial({
    color: 0xfff0d8,
    emissive: 0xffd9a0,
    emissiveIntensity: 3.2,
    roughness: 0.5,
  });
  add("bulb", bulb);
  add(
    "safelight",
    new THREE.MeshStandardMaterial({
      color: 0xff2a10,
      emissive: 0xff1a06,
      emissiveIntensity: 4.5,
      roughness: 0.6,
    })
  );

  return lib;
}

export function disposeMaterials(lib: MatLib) {
  for (const m of Object.values(lib)) {
    m.map?.dispose();
    m.normalMap?.dispose();
    m.roughnessMap?.dispose();
    m.aoMap?.dispose();
    m.metalnessMap?.dispose();
    m.dispose();
  }
}
