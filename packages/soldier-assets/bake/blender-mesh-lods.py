"""Offline mesh reduction from a saved fitted assembly; animation is not retargeted."""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy
import bmesh


def triangle_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def preserve_tangent_frames(mesh):
    """Use face normals only where collapsed smooth normals lose UV direction."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    # The fitted material owner connects Normal Map directly to Principled.
    # Unmapped slots do not require a tangent frame and must not be flattened.
    mapped = {i for i, material in enumerate(mesh.materials)
              if material and material.use_nodes and any(
                  node.type == "BSDF_PRINCIPLED" and any(
                      link.from_node.type == "NORMAL_MAP" for link in node.inputs["Normal"].links)
                  for node in material.node_tree.nodes)}
    if not mapped:
        return 0
    mesh.calc_tangents(uvmap=mesh.uv_layers.active.name)
    bad = [p for p in mesh.polygons if p.material_index in mapped and any(
        mesh.loops[i].normal.cross(mesh.loops[i].tangent).length_squared < 1e-12
        for i in p.loop_indices)]
    for polygon in bad:
        polygon.use_smooth = False
    if bad:
        mesh.update()
        mesh.calc_tangents(uvmap=mesh.uv_layers.active.name)
        if any(mesh.loops[i].normal.cross(mesh.loops[i].tangent).length_squared < 1e-12
               for p in mesh.polygons if p.material_index in mapped for i in p.loop_indices):
            raise ValueError("Reduced UV surface still has a degenerate tangent frame")
    return len(bad)


def reduced_copy(body, target_triangles, min_extent=0, min_triangles=12):
    """Reduce disconnected surfaces while retaining long thin gear.

    Blender interpolates UV and deform weights during collapse. Material slots
    travel with each surface; no material, armature or animation is rebuilt.
    The source mesh is never edited. Distant tiers may omit detached components
    smaller than min_extent metres; retained low-poly islands remain exact.
    """
    if target_triangles < 1 or min_extent < 0 or min_triangles < 4:
        raise ValueError("Require positive triangle target, nonnegative extent and >=4 triangle floor")
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
    for obj in pieces:
        points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        extent = max(max(v[i] for v in points) - min(v[i] for v in points) for i in range(3))
        if extent < min_extent:
            bpy.data.objects.remove(obj, do_unlink=True)
    pieces = list(bpy.context.selected_objects)
    if not pieces:
        raise ValueError("Extent cutoff removed the complete mesh")
    counts = {obj: triangle_count(obj) for obj in pieces}
    floors = {obj: n if n <= 32 else min_triangles for obj, n in counts.items()}
    available = max(0, target_triangles - sum(floors.values()))
    reducible = sum(counts[obj] - floors[obj] for obj in pieces)
    ratio = min(1, available / max(1, reducible))
    for obj, count in counts.items():
        if count <= 32:
            continue
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new("Offline mesh LOD", "DECIMATE")
        modifier.ratio = min(1, (floors[obj] + (count - floors[obj]) * ratio) / count)
        modifier.use_collapse_triangulate = True
        # Apply in bind space, before the existing armature modifier.
        while obj.modifiers.find(modifier.name) > 0:
            bpy.ops.object.modifier_move_up(modifier=modifier.name)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    result = pieces[0]
    bpy.context.view_layer.objects.active = result
    bpy.ops.object.join()
    corrected = preserve_tangent_frames(result.data)
    print(f"Reduced mesh: {corrected} degenerate smooth faces use face normals")
    return result


# Mesh tiers, finest first, matching APPEARANCE_MESH_TIERS in appearanceBundle.ts:
# (name, default triangle target, omitted detached extent metres, island floor).
TIERS = (
    ("near", 8000, 0, 12),
    ("intermediate", 4000, 0, 12),
    ("mid", 1000, .03, 8),
    ("far", 800, .15, 4),
)


def export_lods(source, body_name, output, targets, tier="all"):
    source = source.resolve()
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    spec = importlib.util.spec_from_file_location(
        "anatomy", Path(__file__).with_name("blender-human-anatomy.py"))
    anatomy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(anatomy)
    report = {"source": str(source), "sourceSha256": original_hash, "tiers": []}
    for (name, _, extent, floor), target in zip(TIERS, targets, strict=True):
        if tier != "all" and name != tier:
            continue
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
        reduced = reduced_copy(body, target, min_extent=extent, min_triangles=floor)
        row = {"name": name, "targetTriangles": target,
               "sourceTriangles": triangle_count(body), "triangles": triangle_count(reduced),
               "omittedBelowMetres": extent, "retainedIslandTriangleFloor": floor}
        if not 0 < row["triangles"] < row["sourceTriangles"]:
            raise ValueError(f"{name}: mesh reduction did not reduce triangles")
        anatomy.export_candidate(reduced, arms[0], output, name)
        row["glbSha256"] = hashlib.sha256((output / f"{name}.glb").read_bytes()).hexdigest()
        report["tiers"].append(row)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
    report_name = "reduction.json" if tier == "all" else f"{tier}-reduction.json"
    (output / report_name).write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--body", required=True)
    parser.add_argument("--output", required=True, type=Path)
    # A single tier leaves every other saved tier untouched.
    parser.add_argument("--tier", choices=("all", *(name for name, *_ in TIERS)), default="all")
    for name, target, *_ in TIERS:
        parser.add_argument(f"--{name}-triangles", type=int, default=target)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    targets = tuple(getattr(args, f"{name}_triangles") for name, *_ in TIERS)
    if not all(a > b for a, b in zip(targets, targets[1:])) or targets[-1] <= 0:
        parser.error("Require positive, decreasing triangle targets for every tier")
    export_lods(args.source, args.body, args.output, targets, args.tier)
