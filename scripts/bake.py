# MERIDIAN — Cycles environment bake.
#
#   blender -b -P scripts/bake.py                  # every zone
#   blender -b -P scripts/bake.py -- rotunda dome  # just these
#
# Imports bake_src/scene.glb (exported from the live world via ?bake=1),
# builds the same light rig from bake_src/lights.json, then renders a 360x180
# equirectangular HDR from each room's centre. The runtime swaps these in as
# scene.environment, so every room is lit by its own real bounced light.

import bpy, os, sys, math, json
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "bake_src", "scene.glb")
LIGHTS = os.path.join(ROOT, "bake_src", "lights.json")
OUT = os.path.join(ROOT, "public", "bake")
os.makedirs(OUT, exist_ok=True)

RES_X = int(os.environ.get("BAKE_W", 1024))
RES_Y = int(os.environ.get("BAKE_H", 512))
SAMPLES = int(os.environ.get("BAKE_SAMPLES", 128))

# Zone centres in three.js coordinates (x, y, z); converted on use.
ZONES = {
    "rotunda":  (0.0, 1.7, 0.0),
    "records":  (0.0, 1.7, -16.0),
    "dome":     (0.0, 5.6, -15.0),
    "anechoic": (16.5, 1.7, 0.0),
    "machine":  (0.0, 1.7, 16.5),
    "darkroom": (-15.5, 1.6, 0.0),
    "corr_n":   (0.0, 1.7, -9.0),
    "corr_s":   (0.0, 1.7, 9.0),
    "corr_e":   (9.0, 1.7, 0.0),
    "corr_w":   (-9.0, 1.7, 0.0),
    "tunnel":   (-8.0, -1.7, 8.0),
}

to_blender = lambda p: (p[0], -p[2], p[1])


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_render(scene):
    scene.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
        print("[bake] Metal GPU")
    except Exception as e:
        print("[bake] GPU unavailable, CPU:", e)
        scene.cycles.device = "CPU"

    c = scene.cycles
    c.samples = SAMPLES
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.02
    c.use_denoising = True
    c.denoiser = "OPENIMAGEDENOISE"
    c.max_bounces = 10
    c.diffuse_bounces = 6
    c.glossy_bounces = 3
    c.transmission_bounces = 4
    c.transparent_max_bounces = 8
    c.sample_clamp_indirect = 8.0

    r = scene.render
    r.resolution_x = RES_X
    r.resolution_y = RES_Y
    r.resolution_percentage = 100
    r.film_transparent = False
    r.image_settings.file_format = "HDR"
    r.image_settings.color_mode = "RGB"
    r.image_settings.color_depth = "32"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0


def add_lights():
    if not os.path.exists(LIGHTS):
        print("[bake] no lights.json — the shell will be unlit")
        return
    specs = json.load(open(LIGHTS))
    scene = bpy.context.scene
    coll = scene.collection
    gain = float(os.environ.get("BAKE_GAIN", 1.0))

    for i, s in enumerate(specs):
        kind = "SPOT" if s["type"] == "spot" else "POINT"
        ld = bpy.data.lights.new(name=f"{kind.lower()}_{i}", type=kind)
        ld.color = s["color"]
        intensity = max(0.0, s["intensity"]) * gain
        if kind == "SPOT":
            half = s.get("angle", 0.5)
            omega = 2.0 * math.pi * (1.0 - math.cos(half))
            # candela -> watts over the emitting cone
            ld.energy = intensity * omega * 1.6
            ld.spot_size = min(2.0 * half, math.pi)
            ld.spot_blend = max(0.0, min(1.0, s.get("penumbra", 0.5)))
        else:
            ld.energy = intensity * 4.0 * math.pi

        ob = bpy.data.objects.new(ld.name, ld)
        coll.objects.link(ob)
        ob.location = to_blender(s["pos"])
        if kind == "SPOT" and s.get("target"):
            target = Vector(to_blender(s["target"]))
            d = target - Vector(ob.location)
            if d.length > 1e-4:
                ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def setup_world(scene):
    world = bpy.data.worlds.new("Outside")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.012, 0.018, 0.028, 1)
    bg.inputs[1].default_value = 1.0


def setup_camera(scene):
    cam_data = bpy.data.cameras.new("BakeCam")
    cam_data.type = "PANO"
    try:
        cam_data.panorama_type = "EQUIRECTANGULAR"
    except Exception:
        cam_data.cycles.panorama_type = "EQUIRECTANGULAR"
    cam = bpy.data.objects.new("BakeCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def main():
    only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    targets = {k: v for k, v in ZONES.items() if not only or k in only}
    if not targets:
        print("[bake] nothing selected")
        return

    reset()
    print("[bake] importing", SRC)
    bpy.ops.import_scene.gltf(filepath=SRC)

    scene = bpy.context.scene
    setup_render(scene)
    add_lights()
    setup_world(scene)
    cam = setup_camera(scene)

    print("[bake] objects:", len(scene.objects), "tris:",
          sum(len(o.data.loop_triangles) for o in scene.objects
              if o.type == "MESH" and (o.data.calc_loop_triangles() or True)))

    for name, p in targets.items():
        cam.location = to_blender(p)
        cam.rotation_euler = (math.radians(90), 0, 0)
        scene.render.filepath = os.path.join(OUT, name + ".hdr")
        print(f"[bake] {name} at {tuple(round(v, 2) for v in cam.location)}")
        bpy.ops.render.render(write_still=True)
        print(f"[bake] {name} done")

    print("[bake] all done")


main()
