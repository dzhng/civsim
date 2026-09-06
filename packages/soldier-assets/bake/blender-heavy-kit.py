"""Editable heavy-infantry equipment fitted to the shared provisional anatomy.

Run in a fresh Blender session. Source equipment stays separate and editable;
only export copies are joined. No anatomy, rig, or motion is reauthored here.
"""
import importlib.util
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, kdtree

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("anatomy", HERE / "blender-human-anatomy.py")
anatomy = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(anatomy)
OUTPUT = HERE.parent / "assets/source/heavy-kit"


def build():
    if "HeavyKitCandidate" in bpy.data.scenes or "bend" in bpy.data.actions:
        raise RuntimeError("Build in a fresh session; existing authoring is never overwritten")
    with bpy.data.libraries.load(str(anatomy.OUTPUT / "human-anatomy.blend")) as (source, target):
        target.scenes = [anatomy.SCENE]
    scene = target.scenes[0]
    scene.name = "HeavyKitCandidate"
    bpy.context.window.scene = scene
    scene.frame_set(0)
    body = next(obj for obj in scene.objects if obj.name.startswith("HumanAnatomy-Deform"))
    arm = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    material = body.data.materials[0]
    gear = []
    nearest = kdtree.KDTree(len(body.data.vertices))
    for vertex in body.data.vertices:
        nearest.insert(vertex.co, vertex.index)
    nearest.balance()

    def finish(obj, bone=None):
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        obj.data.materials.append(material)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        if bone:
            obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))), 1, "REPLACE")
        else:
            groups = {group.index: obj.vertex_groups.new(name=group.name) for group in body.vertex_groups}
            for vertex in obj.data.vertices:
                _, index, _ = nearest.find(vertex.co)
                for entry in body.data.vertices[index].groups:
                    groups[entry.group].add([vertex.index], entry.weight, "REPLACE")
        obj.parent = arm
        obj.modifiers.new("Shared anatomy skeleton", "ARMATURE").object = arm
        gear.append(obj)
        return obj

    def loft(name, rows, bone=None, segments=40, across=(1, 0, 0), depth=(0, 1, 0)):
        return finish(anatomy.loft(name, rows, segments, across, depth), bone)

    def garment(name, rows, sleeve_end):
        # Sew open sleeve loops into the torso, leaving real neck, cuff and hem openings.
        segments = 16
        vertices = [(w*math.cos(math.tau*j/segments), .005+d*math.sin(math.tau*j/segments), z)
                    for z, w, d in rows for j in range(segments)]
        faces = []
        armhole_start = len(rows)-4
        for i in range(len(rows)-1):
            for j in range(segments):
                if armhole_start <= i < armhole_start+2 and j in (14, 15, 0, 1, 6, 7, 8, 9):
                    continue
                faces.append((i*segments+j, i*segments+(j+1)%segments,
                              (i+1)*segments+(j+1)%segments, (i+1)*segments+j))
        for sign, middle in ((1, 0), (-1, 8)):
            # Boundary order follows the four sides of the removed shoulder patch.
            boundary = [armhole_start*segments+(middle+j)%segments for j in range(-2, 3)]
            boundary += [(armhole_start+i)*segments+(middle+2)%segments for i in (1, 2)]
            boundary += [(armhole_start+2)*segments+(middle+j)%segments for j in (1, 0, -1, -2)]
            boundary += [(armhole_start+1)*segments+(middle-2)%segments]
            axis = Vector((sign*.60, 0, -.80))
            across = Vector((0, 1, 0))
            depth = axis.cross(across)
            center = sum((Vector(vertices[v]) for v in boundary), Vector())/len(boundary)
            start = Vector(vertices[boundary[0]])-center
            phase = math.atan2(start.dot(depth), start.dot(across))
            # Preserve loop order: projected shoulder points can double back in angle.
            angles = [phase + math.tau*j/len(boundary) for j in range(len(boundary))]
            for x, z, radius in sleeve_end:
                ring = []
                for angle in angles:
                    ring.append(len(vertices))
                    vertices.append(Vector((sign*x, -.005, z)) +
                                    across*(radius*math.cos(angle)) + depth*(radius*math.sin(angle)))
                for j in range(len(ring)):
                    k = (j+1)%len(ring)
                    faces.append((boundary[j], boundary[k], ring[k], ring[j]))
                boundary = ring
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        surface = bmesh.new()
        surface.from_mesh(mesh)
        bmesh.ops.delete(surface, geom=[v for v in surface.verts if not v.link_edges], context="VERTS")
        bmesh.ops.recalc_face_normals(surface, faces=list(surface.faces))
        surface.to_mesh(mesh)
        surface.free()
        subdivision = obj.modifiers.new("Tailored garment surface", "SUBSURF")
        subdivision.levels = 2
        bpy.ops.object.modifier_apply(modifier=subdivision.name)
        thickness = obj.modifiers.new("Garment edge thickness", "SOLIDIFY")
        thickness.thickness = .003
        thickness.offset = -1
        bpy.ops.object.modifier_apply(modifier=thickness.name)
        return finish(obj)

    # Separate cloth hem and overlying mail form; mail rings/finish belong to slice10.
    garment("Tunic", [(.73, .231, .157), (.75, .230, .156), (.88, .213, .151),
            (1.05, .180, .128), (1.23, .203, .148), (1.34, .233, .160),
            (1.44, .247, .146), (1.505, .216, .097), (1.525, .071, .065)],
            [(.285, 1.315, .087), (.327, 1.250, .077), (.332, 1.243, .077)])
    garment("Mail shirt", [(.855, .219, .158), (.87, .220, .160), (.95, .208, .157),
            (1.06, .189, .139), (1.23, .212, .159), (1.35, .244, .170),
            (1.45, .256, .156), (1.513, .226, .109), (1.535, .074, .069)],
            [(.273, 1.345, .096), (.298, 1.305, .092), (.302, 1.299, .092)])
    loft("Waist belt", [((0, .005, z), w, d) for z, w, d in
         [(1.026, .198, .148), (1.031, .201, .151),
          (1.061, .201, .151), (1.066, .198, .148)]], "spine")
    for side, sign in [("L", 1), ("R", -1)]:
        loft("Sandal sole." + side,
             [((sign*.124, -.067, z), w, d) for z, w, d in
              [(.012, .064, .13), (.020, .068, .135), (.036, .066, .129)]], "foot." + side)
        loft("Sandal upper." + side,
             [((sign*.124, -.056, z), w, d) for z, w, d in
             [(.035, .065, .121), (.060, .061, .105), (.083, .046, .069), (.11, .035, .038)]], "foot." + side)

    loft("Helmet bowl", [((0, .013, z), w, d) for z, w, d in
         [(1.685, .095, .097), (1.72, .097, .10), (1.77, .083, .085),
          (1.806, .054, .058), (1.822, .022, .025), (1.826, .004, .006)]], "head", 64)
    loft("Helmet rolled rim", [((0, .013, z), w, d) for z, w, d in
         [(1.68, .099, .104), (1.687, .103, .108), (1.697, .099, .104)]], "head", 64)
    for side, sign in [("L", 1), ("R", -1)]:
        loft("Helmet cheek guard." + side,
             [((sign*x, y, z), w, d) for x, y, z, w, d in
              [(.078, -.041, 1.685, .016, .037), (.079, -.043, 1.654, .017, .040),
               (.073, -.045, 1.62, .012, .032), (.064, -.042, 1.598, .004, .015)]], "head")

    # An oval convex shield: section radius gives real curvature, not a flat disk.
    shield = anatomy.loft("Convex oval shield", [((.565, y, .93), w, h) for y, w, h in
        [(-.12, .305, .49), (-.132, .312, .50), (-.155, .30, .48),
         (-.205, .235, .377), (-.24, .14, .225), (-.26, .012, .020)]],
        64, (1, 0, 0), (0, 0, 1))
    finish(shield, "hand.L")
    loft("Shield boss", [((.565, y, .93), r, r) for y, r in
         [(-.26, .075), (-.28, .075), (-.315, .053), (-.327, .009)]],
         "hand.L", across=(1, 0, 0), depth=(0, 0, 1))
    loft("Shield handgrip", [((x, -.034, .925), .018, .018) for x in [.520, .605]],
         "hand.L", 16, (0, 1, 0), (0, 0, 1))
    # Sword axis crosses the provisional palm. Grip closure is separately judged.
    loft("Sword grip", [((-.564, -.044, z), .017, .022) for z in [.858, .970]], "hand.R", 16)
    loft("Sword pommel", [((-.564, -.044, z), w, w) for z, w in
         [(.969, .020), (.984, .029), (1.002, .019)]], "hand.R", 24)
    loft("Sword guard", [((-.564, -.044, z), .064, .025) for z in [.844, .860]], "hand.R", 24)
    loft("Sword blade", [((-.564, -.044, z), w, d) for z, w, d in
         [(.845, .033, .006), (.63, .029, .005), (.36, .036, .005), (.24, .001, .001)]], "hand.R", 4)
    loft("Scabbard", [((-.21 - (1-z)*.10, .045, z), w, .022) for z, w in
         [(1.02, .045), (.99, .046), (.51, .039), (.42, .007)]], "pelvis", 24)

    # Export copies share a single mesh/skin without sacrificing modular source editing.
    bpy.ops.object.select_all(action="DESELECT")
    copies = []
    for obj in [body] + gear:
        copy = obj.copy()
        copy.data = obj.data.copy()
        scene.collection.objects.link(copy)
        copy.hide_set(False)
        copy.select_set(True)
        copies.append(copy)
        obj.hide_set(True)
        obj.hide_render = True
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    runtime = copies[0]
    runtime.name = "HeavyKit-Deform"
    # glTF tangent generation requires triangles rather than loft end-cap ngons.
    mesh = bmesh.new()
    mesh.from_mesh(runtime.data)
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
    mesh.to_mesh(runtime.data)
    mesh.free()
    runtime["authoring_status"] = "Provisional anatomy fitting; equipment silhouette candidate, not accepted LOD"
    anatomy.export_candidate(runtime, arm, OUTPUT, "heavy-kit")
    print({"source": str(OUTPUT / "heavy-kit.blend"), "gear_parts": len(gear),
           "triangles": sum(len(face.vertices)-2 for face in runtime.data.polygons)})


if __name__ == "__main__":
    build()
