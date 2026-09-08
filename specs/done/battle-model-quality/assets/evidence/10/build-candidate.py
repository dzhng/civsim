"""Frozen source fixture for the slice10 material comparison; not a geometry builder."""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
import bpy
import bmesh

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[6]
BAKE = ROOT / "packages/soldier-assets/bake"
def load(name):
    spec = importlib.util.spec_from_file_location(name, BAKE / (name+".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

surfaces = load("blender-heavy-surfaces")
anatomy = load("blender-human-anatomy")
OUTPUT = surfaces.OUTPUT
TILE = surfaces.TILE
author_surfaces = surfaces.author_surfaces


def build(source):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with bpy.data.libraries.load(str(source)) as (available, requested):
        requested.scenes = ["HeavyKitCandidate"]
    scene = requested.scenes[0]
    bpy.context.window.scene = scene
    scene.frame_set(0)
    arm = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    runtime = scene.objects["HeavyKit-Deform"]
    objects = [obj for obj in scene.objects if obj.type == "MESH"
               and obj not in (runtime, scene.objects["HumanAnatomy-Sculpt"])]
    author_surfaces(objects)
    bpy.data.objects.remove(runtime, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    copies = []
    for obj in objects:
        copy = obj.copy()
        copy.data = obj.data.copy()
        scene.collection.objects.link(copy)
        copy.hide_set(False)
        copy.hide_render = False
        copy.select_set(True)
        copies.append(copy)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    runtime = copies[0]
    runtime.name = "HeavySurfaces-Deform"
    mesh = bmesh.new()
    mesh.from_mesh(runtime.data)
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
    mesh.to_mesh(runtime.data)
    mesh.free()
    runtime["authoring_status"] = "Provisional surfaces; geometry and material verdicts open"
    anatomy.export_candidate(runtime, arm, OUTPUT, "heavy-surfaces")
    (OUTPUT / "provenance.json").write_text(json.dumps({
        "source": source.name, "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "parts": [obj.name for obj in objects], "atlasSize": [TILE[0]*4, TILE[1]*2],
        "status": "Provisional surface candidate; not accepted geometry, LOD or resource envelope",
    }, indent=2)+"\n")


if __name__ == "__main__":
    source = Path(sys.argv[sys.argv.index("--")+1]) if "--" in sys.argv else OUTPUT/"clay-input.blend"
    build(source)
