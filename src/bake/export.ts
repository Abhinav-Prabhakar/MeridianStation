import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kit } from "../core/kit";
import { buildShell } from "../world/shell";
import { buildDressing, buildLights } from "../world/rooms";
import type { MatLib } from "../core/materials";

/**
 * Bake export.
 *
 * Rebuilds the station with flat, texture-free materials, flattens every mesh
 * (including instanced sets) into one geometry per material, and POSTs it to a
 * tiny local receiver. `scripts/bake.py` then renders a per-room equirect HDR
 * with Cycles, which the runtime uses as its environment light.
 *
 * Shares the same builders as the live world, so the bake can never drift.
 */

const UPLOAD = "http://127.0.0.1:8788/upload";

interface BakeLight {
  type: "point" | "spot";
  pos: [number, number, number];
  target?: [number, number, number];
  color: [number, number, number];
  /** candela, same number the live renderer uses */
  intensity: number;
  angle?: number;
  penumbra?: number;
  distance: number;
}

export async function exportBakeScene(src: MatLib, step: (s: string) => void) {
  step("baking: building plain materials");
  const plain = plainLib(src);

  step("baking: raising geometry");
  const root = new THREE.Group();
  const kit = new Kit(plain, root);
  buildShell(kit);
  buildDressing(kit);

  step("baking: flattening");
  const flat = flattenStatic(root);

  step("baking: exporting glb");
  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(flat, {
    binary: true,
    onlyVisible: true,
    maxTextureSize: 64,
  })) as ArrayBuffer;
  step(`baking: uploading ${(glb.byteLength / 1e6).toFixed(1)} MB`);
  await upload("scene.glb", glb);

  const lights = collectLights();
  step(`baking: uploading ${lights.length} lights`);
  await upload("lights.json", new TextEncoder().encode(JSON.stringify(lights, null, 1)).buffer);

  step("bake export complete");
}

async function upload(name: string, body: ArrayBuffer | Blob) {
  const res = await fetch(`${UPLOAD}?name=${encodeURIComponent(name)}`, {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(`upload ${name} failed: ${res.status}`);
}

// --------------------------------------------------------------- materials
function plainLib(src: MatLib): MatLib {
  const out: MatLib = {};
  for (const [name, m] of Object.entries(src)) {
    const c = m.color.clone();
    // Mapped materials carry their albedo in the texture, not in `color`;
    // approximate the map with its tint so bounce light keeps the right value.
    if (m.map) c.multiplyScalar(0.68);
    const p = new THREE.MeshStandardMaterial({
      color: c,
      roughness: m.roughness,
      metalness: m.metalness,
    });
    p.name = name;
    const e = m.emissive;
    if (e && e.r + e.g + e.b > 0.001 && m.emissiveIntensity > 0) {
      p.emissive.copy(e);
      p.emissiveIntensity = Math.min(m.emissiveIntensity, 2.2);
    }
    // thin glass would swallow the room in Cycles; make it a clear surface
    if (m.transparent) {
      p.transparent = true;
      p.opacity = Math.max(0.15, m.opacity * 0.5);
    }
    out[name] = p;
  }
  return out;
}

// ---------------------------------------------------------------- flatten
function flattenStatic(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const m4 = new THREE.Matrix4();
  const push = (mat: THREE.Material, g: THREE.BufferGeometry) => {
    let arr = buckets.get(mat);
    if (!arr) buckets.set(mat, (arr = []));
    arr.push(g);
  };

  root.traverse((o) => {
    if (o.userData.noShadow) return;
    const im = o as THREE.InstancedMesh;
    if ((im as any).isInstancedMesh) {
      const base = im.geometry;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m4);
        const g = normalise(base.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(im.matrixWorld, m4)));
        if (g) push(im.material as THREE.Material, g);
      }
      return;
    }
    const mesh = o as THREE.Mesh;
    if (!(mesh as any).isMesh) return;
    if (Array.isArray(mesh.material)) return;
    if ((mesh.material as THREE.Material).type === "MeshBasicMaterial") return;
    const g = normalise(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    if (g) push(mesh.material as THREE.Material, g);
  });

  const group = new THREE.Group();
  group.name = "MERIDIAN";
  let tris = 0;
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    tris += merged.attributes.position.count / 3;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = (mat as THREE.Material).name || "surface";
    group.add(mesh);
  }
  console.info(
    `[bake] ${group.children.length} objects, ${(tris / 1000).toFixed(0)}k tris, ` +
      `${Object.keys(buckets).length} materials`
  );
  return group;
}

/** Strip a geometry to position/normal/uv, non-indexed. */
function normalise(g: THREE.BufferGeometry): THREE.BufferGeometry | null {
  let geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos || pos.count === 0) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", pos);
  const nor = geo.attributes.normal as THREE.BufferAttribute | undefined;
  if (nor && nor.count === pos.count) out.setAttribute("normal", nor);
  else {
    out.computeVertexNormals();
  }
  let uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv || uv.count !== pos.count) {
    uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  }
  out.setAttribute("uv", uv);
  out.translate(0, 0, 0);
  return out;
}

// ----------------------------------------------------------------- lights
function collectLights(): BakeLight[] {
  const probe = new THREE.Scene();
  const rigs = buildLights(probe);
  const out: BakeLight[] = [];
  for (const rig of rigs) {
    for (const l of rig.lights) {
      if (l instanceof THREE.PointLight) {
        out.push({
          type: "point",
          pos: [l.position.x, l.position.y, l.position.z],
          color: [l.color.r, l.color.g, l.color.b],
          intensity: l.intensity,
          distance: l.distance,
        });
      } else if (l instanceof THREE.SpotLight) {
        out.push({
          type: "spot",
          pos: [l.position.x, l.position.y, l.position.z],
          target: [l.target.position.x, l.target.position.y, l.target.position.z],
          color: [l.color.r, l.color.g, l.color.b],
          intensity: l.intensity,
          angle: l.angle,
          penumbra: l.penumbra,
          distance: l.distance,
        });
      }
    }
  }
  return out;
}
