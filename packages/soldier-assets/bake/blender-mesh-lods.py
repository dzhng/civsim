"""Offline mesh reduction from a saved fitted assembly; animation is not retargeted."""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy


def triangle_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def reduced_copy(body, target_triangles):
    """Reduce disconnected surfaces independently so thin gear cannot vanish.

    Blender interpolates UV and deform weights during collapse. Material slots
    travel with each surface; no material, armature or animation is rebuilt.
    The source mesh is never edited. Small islands remain exact, while larger
    islands retain at least a closed primitive's worth of triangles.
    """
    if target_triangles < 1:
        raise ValueError("triangle target must be positive")
    bpy.ops.object.select_all(action="DESELECT")
    result = body.copy()
    result.data = body.data.copy()
    bpy.context.scene.collection.objects.link(result)
    result.hide_set(False)
    result.hide_render = False
    result.select_set(True)
    bpy.context.view_layer.objects.active = result
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    pieces = list(bpy.context.selected_objects)
    counts = {obj: triangle_count(obj) for obj in pieces}
    fixed = sum(n for n in counts.values() if n <= 32)
    reducible = sum(n for n in counts.values() if n > 32)
    ratio = min(1, max(0, target_triangles - fixed) / max(1, reducible))
    for obj, count in counts.items():
        if count <= 32:
            continue
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new("Offline mesh LOD", "DECIMATE")
        modifier.ratio = min(1, max(12 / count, ratio))
        modifier.use_collapse_triangulate = True
        # Apply in bind space, before the existing armature modifier.
        while obj.modifiers.find(modifier.name) > 0:
            bpy.ops.object.modifier_move_up(modifier=modifier.name)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.context.view_layer.objects.active = result
    bpy.ops.object.join()
    return result


def export_lods(source, body_name, output, targets):
    source = source.resolve()
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    spec = importlib.util.spec_from_file_location(
        "anatomy", Path(__file__).with_name("blender-human-anatomy.py"))
    anatomy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(anatomy)
    report = {"source": str(source), "sourceSha256": original_hash, "tiers": []}
    for name, target in zip(("mid", "far"), targets):
        # Reload the original for each tier, never decimate an earlier reduction.
        bpy.ops.wm.open_mainfile(filepath=str(source))
        scenes = [scene for scene in bpy.data.scenes if body_name in scene.objects]
        if len(scenes) != 1:
            raise ValueError("Select one fitted runtime mesh in exactly one saved scene")
        bpy.context.window.scene = scenes[0]
        body = scenes[0].objects[body_name]
        arms = [m.object for m in body.modifiers if m.type == "ARMATURE"]
        if len(arms) != 1 or arms[0] is None:
            raise ValueError("Runtime mesh requires exactly one existing armature")
        reduced = reduced_copy(body, target)
        row = {"name": name, "targetTriangles": target,
               "sourceTriangles": triangle_count(body), "triangles": triangle_count(reduced)}
        if not 0 < row["triangles"] < row["sourceTriangles"]:
            raise ValueError(f"{name}: mesh reduction did not reduce triangles")
        anatomy.export_candidate(reduced, arms[0], output, name)
        row["glbSha256"] = hashlib.sha256((output / f"{name}.glb").read_bytes()).hexdigest()
        report["tiers"].append(row)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
    (output / "reduction.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--body", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--mid-triangles", type=int, default=4000)
    parser.add_argument("--far-triangles", type=int, default=1200)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if not args.mid_triangles > args.far_triangles > 0:
        parser.error("Require positive, decreasing mid/far triangle targets")
    export_lods(args.source, args.body, args.output, (args.mid_triangles, args.far_triangles))
