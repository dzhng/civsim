"""Blender CPU consumer tracer: reduce a weighted UV surface, retain its thin gear."""

import importlib.util
from pathlib import Path

import bpy

spec = importlib.util.spec_from_file_location("mesh_lods", Path(__file__).with_name("blender-mesh-lods.py"))
lods = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lods)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24)
body = bpy.context.object
body.data.materials.append(bpy.data.materials.new("linen"))
group = body.vertex_groups.new(name="torso")
group.add(list(range(len(body.data.vertices))), 1, "REPLACE")
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 3))
gear = bpy.context.object
gear.scale = (.01, .01, 1)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
gear.data.materials.append(bpy.data.materials.new("iron"))
group = gear.vertex_groups.new(name="hand")
group.add(list(range(len(gear.data.vertices))), 1, "REPLACE")
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
source = [tuple(v.co) for v in body.data.vertices]
source_polygons = [tuple(p.vertices) for p in body.data.polygons]
reduced = lods.reduced_copy(body, 240)
reduced.data.calc_loop_triangles()
assert len(reduced.data.loop_triangles) <= 280, "requested reduction did not reach the exported mesh"
assert [tuple(v.co) for v in body.data.vertices] == source
assert [tuple(p.vertices) for p in body.data.polygons] == source_polygons
assert {m.name for m in reduced.data.materials} == {"linen", "iron"}
assert len(reduced.data.uv_layers.active.data) == len(reduced.data.loops)
iron_vertices = {i for p in reduced.data.polygons
                 if reduced.data.materials[p.material_index].name == "iron" for i in p.vertices}
assert len(iron_vertices) == 8, "tiny rigid weapon island was erased or reshaped"
assert sorted(tuple(reduced.data.vertices[i].co) for i in iron_vertices) == sorted(v for v in source if v[2] > 1)
for vertex in reduced.data.vertices:
    assert abs(sum(g.weight for g in vertex.groups) - 1) < 1e-6
    expected = "hand" if vertex.index in iron_vertices else "torso"
    assert {reduced.vertex_groups[g.group].name for g in vertex.groups if g.weight > 1e-6} == {expected}
print("PASS: reduced geometry, original mesh, UV/materials, normalized skin and exact thin gear")

# A distant tier may drop a detached bead, but not a long thin weapon.
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.mesh.primitive_cube_add(size=.02, location=(2, 0, 0))
bead = bpy.context.object
bead.data.materials.append(bpy.data.materials.new("bead"))
bead.vertex_groups.new(name="torso").add(list(range(8)), 1, "REPLACE")
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
original_count = len(body.data.vertices)
coarse = lods.reduced_copy(body, 100, min_extent=.1, min_triangles=4)
assert lods.triangle_count(coarse) <= 110
assert len(body.data.vertices) == original_count
assert all(coarse.data.materials[p.material_index].name != "bead" for p in coarse.data.polygons)
weapon = {i for p in coarse.data.polygons
          if coarse.data.materials[p.material_index].name == "iron" for i in p.vertices}
assert len(weapon) == 8, "long thin gear must survive distant detail omission"
assert sorted(tuple(coarse.data.vertices[i].co) for i in weapon) == sorted(v for v in source if v[2] > 1)
print("PASS: distant detail omission preserves original mesh and complete thin weapon")
