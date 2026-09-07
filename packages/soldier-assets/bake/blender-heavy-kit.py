"""Editable heavy-infantry equipment fitted to the shared provisional anatomy.

Run in a fresh Blender session. Source equipment stays separate and editable;
only export copies are joined. Shared surface and motion authors compose here;
the anatomy and bind rig remain owned by the human source.
"""
import importlib.util
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, geometry
from mathutils.bvhtree import BVHTree

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
    body.data.calc_loop_triangles()
    triangles = [tuple(face.vertices) for face in body.data.loop_triangles]
    nearest = BVHTree.FromPolygons([vertex.co for vertex in body.data.vertices],
                                   triangles, all_triangles=True)

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
                point, _, index, _ = nearest.find_nearest(vertex.co)
                corners = [body.data.vertices[i] for i in triangles[index]]
                # Interpolate the underlying skin instead of jumping to one nearest
                # vertex as an authored garment moves across a joint's weight field.
                blend = geometry.barycentric_transform(point, *(v.co for v in corners),
                            Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
                weights = {}
                for corner, fraction in zip(corners, blend):
                    for entry in corner.groups:
                        weights[entry.group] = weights.get(entry.group, 0) + entry.weight*max(0, fraction)
                influences = sorted(weights.items(), key=lambda item: -item[1])[:4]
                total = sum(weight for _, weight in influences)
                for group, weight in influences:
                    groups[group].add([vertex.index], weight/total, "REPLACE")
        obj.parent = arm
        obj.modifiers.new("Shared anatomy skeleton", "ARMATURE").object = arm
        gear.append(obj)
        return obj

    def loft(name, rows, bone=None, segments=40, across=(1, 0, 0), depth=(0, 1, 0)):
        return finish(anatomy.loft(name, rows, segments, across, depth), bone)

    def thin_surface(name, vertices, faces, bone=None, offset=-1, fit=None, subdivision_levels=2):
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
        subdivision = obj.modifiers.new("Curved surface", "SUBSURF")
        subdivision.levels = subdivision_levels
        bpy.ops.object.modifier_apply(modifier=subdivision.name)
        if fit:
            fit(obj.data)
        thickness = obj.modifiers.new("Physical edge thickness", "SOLIDIFY")
        thickness.thickness = .003
        thickness.offset = offset
        bpy.ops.object.modifier_apply(modifier=thickness.name)
        return finish(obj, bone)

    def garment(name, rows, sleeve_end, clearance):
        # Sew open sleeve loops into the torso, leaving real neck, cuff and hem openings.
        segments = 16
        vertices = [(w*math.cos(math.tau*j/segments), .005+d*math.sin(math.tau*j/segments), z)
                    for z, w, d in rows for j in range(segments)]
        for i, (z, w, d) in enumerate(rows):
            for j in range(segments):
                angle = math.tau*j/segments
                x, y, height = vertices[i*segments+j]
                # Cloth follows the sloping shoulder rather than a level oval yoke.
                if i == len(rows)-2:
                    height -= .030*abs(math.cos(angle))**1.3
                elif i == len(rows)-3:
                    height -= .010*abs(math.cos(angle))**1.3
                # Shallow hanging folds open below the belt; the hem remains an open edge.
                hang = max(0, min(1, (1.04-z)/.22))
                fold = .008*hang*math.cos(6*angle)
                x += fold*math.cos(angle)
                y += fold*math.sin(angle)
                height += .004*hang*math.sin(4*angle)
                vertices[i*segments+j] = (x, y, height)
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
        def fit_shoulders(mesh):
            # Fit the subdivided shoulder, not just its sparse control cage.
            # Lower hanging cloth and the open neckline keep their authored form.
            for vertex in mesh.vertices:
                if 1.19 < vertex.co.z < 1.515 and abs(vertex.co.x) > .13:
                    point, normal, _, _ = nearest.find_nearest(vertex.co)
                    blend = min(1, (abs(vertex.co.x)-.13)/.06)
                    blend = blend*blend*(3-2*blend)
                    vertex.co = vertex.co.lerp(point+normal*clearance, blend)
            mesh.update()
        return thin_surface(name, vertices, faces, fit=fit_shoulders)

    # Separate cloth hem and overlying mail form; mail rings/finish belong to slice10.
    garment("Tunic", [(.73, .212, .153), (.75, .212, .153), (.88, .207, .148),
            (1.05, .180, .128), (1.23, .203, .148), (1.34, .233, .160),
            (1.44, .247, .146), (1.505, .216, .097), (1.525, .071, .065)],
            [(.285, 1.315, .077), (.327, 1.250, .071), (.332, 1.243, .071)], .009)
    garment("Mail shirt", [(.855, .213, .158), (.87, .214, .160), (.95, .208, .157),
            (1.06, .189, .139), (1.23, .212, .159), (1.35, .244, .170),
            (1.45, .256, .156), (1.513, .226, .109), (1.535, .074, .069)],
            [(.262, 1.360, .082), (.282, 1.329, .078), (.286, 1.323, .078)], .018)
    loft("Waist belt", [((0, .005, z), w, d) for z, w, d in
         [(1.026, .198, .148), (1.031, .201, .151),
          (1.061, .201, .151), (1.066, .198, .148)]])
    for side, sign in [("L", 1), ("R", -1)]:
        # The outsole follows the forefoot, medial arch and heel separately.
        outline = [(.109, -.204), (.082, -.190), (.065, -.165),
                   (.060, -.125), (.066, -.084), (.082, -.040),
                   (.085, .006), (.088, .044), (.106, .068),
                   (.124, .075), (.144, .065), (.160, .043),
                   (.164, .005), (.166, -.040), (.174, -.085),
                   (.177, -.125), (.166, -.167), (.144, -.192),
                   (.119, -.204)]
        vertices = [(sign*x, y, z) for z in (.012, .024) for x, y in outline]
        count = len(outline)
        faces = [tuple(reversed(range(count))), tuple(range(count, count*2))]
        faces += [(i, (i+1)%count, (i+1)%count+count, i+count) for i in range(count)]
        mesh = bpy.data.meshes.new("Sandal sole." + side)
        mesh.from_pydata(vertices, [], faces)
        surface = bmesh.new()
        surface.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(surface, faces=list(surface.faces))
        surface.to_mesh(mesh)
        surface.free()
        sole = bpy.data.objects.new(mesh.name, mesh)
        scene.collection.objects.link(sole)
        bpy.context.view_layer.objects.active = sole
        sole.select_set(True)
        bevel = sole.modifiers.new("Rounded cut leather edge", "BEVEL")
        bevel.width, bevel.segments = .002, 3
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        finish(sole, "foot." + side)
        # Crossing vamp bands wrap the actual skin; their ends enter the sole.
        for band, slope in enumerate((-.024, .024)):
            vertices = []
            for edge in (-.009, .009):
                for step in range(17):
                    angle = math.pi*step/16
                    y = -.100 + slope*math.cos(angle) + edge
                    ray = Vector((sign*math.cos(angle), 0, math.sin(angle)))
                    point, normal, _, _ = nearest.ray_cast(Vector((sign*.120, y, .035)), ray)
                    if point is None:
                        raise RuntimeError("Vamp strap ray missed the fixed foot")
                    crossing = math.exp(-((angle-math.pi/2)/.40)**2)
                    point += normal*(.0025+band*.003*crossing)
                    if step in (0, 16):
                        point.z = .024
                    vertices.append(point)
            faces = [(j, j+1, 18+j, 17+j) for j in range(16)]
            thin_surface(f"Sandal strap {band}.{side}", vertices, faces,
                         "foot." + side, offset=0)
        # A rear sling joins the two side risers, so the heel cannot slide out.
        vertices = []
        for edge in (-.009, .009):
            for j in range(21):
                angle = math.pi*j/20
                ray = Vector((sign*.038*math.cos(angle), -.022+.072*math.sin(angle), 0))
                point, normal, _, _ = nearest.ray_cast(Vector((sign*.124, .004, .079+edge)), ray)
                if point is None:
                    raise RuntimeError("Heel sling ray missed the fixed foot")
                vertices.append(point+normal*.004)
        faces = [(j, j+1, 22+j, 21+j) for j in range(20)]
        thin_surface("Sandal heel sling."+side, vertices, faces, "foot."+side, offset=0)
        for edge_sign in (-1, 1):
            path = [Vector(p) for p in ((.043, -.100, .024), (.043, -.090, .035),
                    (.038, -.028, .075), (.038, -.018, .080),
                    (.038, -.008, .075), (.039, .028, .035), (.039, .035, .024))]
            vertices = []
            for edge in (-.009, .009):
                for j in range(25):
                    segment = min(j//4, 5)
                    x, y, z = path[segment].lerp(path[segment+1], j/4-segment)
                    point = Vector((sign*(.124+edge_sign*x), y+edge, z))
                    if z > .03:
                        hit, normal, _, _ = nearest.ray_cast(Vector((sign*.124, y+edge, z)),
                                                            Vector((sign*edge_sign, 0, 0)))
                        if hit is None:
                            raise RuntimeError("Heel riser ray missed the fixed foot")
                        point = hit+normal*.0025
                    vertices.append(point)
            faces = [(j, j+1, 26+j, 25+j) for j in range(24)]
            thin_surface(f"Sandal heel riser {edge_sign}.{side}", vertices, faces,
                         "foot."+side, offset=0)

    loft("Helmet bowl and rolled edge", [((0, .013, z), w, d) for z, w, d in
         [(1.680, .099, .104), (1.686, .103, .108), (1.694, .100, .105),
          (1.701, .096, .100), (1.72, .097, .10), (1.77, .083, .085),
          (1.806, .054, .058), (1.822, .022, .025), (1.826, .004, .006)]], "head", 64)
    for side, sign in [("L", 1), ("R", -1)]:
        rows = [(1.690, .085, -.012, .040), (1.662, .077, -.029, .044),
                (1.625, .060, -.033, .030), (1.607, .048, -.030, .012)]
        vertices = [(sign*(x+.004*(1-v*v)), y+depth*v, z)
                    for z, x, y, depth in rows for v in (-1, -.5, 0, .5, 1)]
        faces = [(i*5+j, i*5+j+1, (i+1)*5+j+1, (i+1)*5+j)
                 for i in range(len(rows)-1) for j in range(4)]
        thin_surface("Helmet cheek plate." + side, vertices, faces, "head", offset=0)

    # An oval convex shield: section radius gives real curvature, not a flat disk.
    shield = anatomy.loft("Convex oval shield", [((.565, y, .93), w, h) for y, w, h in
        [(-.12, .305, .49), (-.132, .312, .50), (-.155, .30, .48),
         (-.205, .235, .377), (-.24, .14, .225), (-.26, .012, .020)]],
        64, (1, 0, 0), (0, 0, 1))
    finish(shield, "hand.L")
    loft("Shield boss", [((.565, y, .93), r, r) for y, r in
         [(-.26, .075), (-.28, .075), (-.315, .053), (-.327, .009)]],
         "hand.L", across=(1, 0, 0), depth=(0, 0, 1))
    shield_grip = Vector((.5732, -.051, .9024))
    shield_axis = Vector((.8, 0, .6))
    loft("Shield handgrip", [(shield_grip + shield_axis*t, .017, .017) for t in [-.060, .060]],
         "hand.L", 24, (0, 1, 0), shield_axis.cross(Vector((0, 1, 0))))
    for t in (-.060, .060):
        end = shield_grip + shield_axis*t
        loft("Shield grip support", [((end.x, y, end.z), .012, .012) for y in [-.125, -.051]],
             "hand.L", 16, (1, 0, 0), (0, 0, 1))
    # Fit the cylinder across the finger curl; the inherited bend is not a combat pose.
    sword_grip = Vector((-.5732, -.051, .9024))
    sword_axis = Vector((.8, 0, -.6))
    sword_width = sword_axis.cross(Vector((0, 1, 0)))
    def sword_part(name, rows, segments=24):
        return loft(name, [(sword_grip+sword_axis*t, width, depth) for t, width, depth in rows],
                    "hand.R", segments, sword_width, (0, 1, 0))
    sword_part("Sword grip", [(-.060, .017, .017), (.052, .017, .017)])
    sword_part("Sword pommel", [(-.085, .018, .018), (-.073, .025, .022), (-.059, .020, .020)])
    sword_part("Sword guard", [(.052, .054, .024), (.067, .054, .024)])
    sword_part("Sword blade", [(.066, .033, .006), (.28, .029, .005),
                               (.55, .036, .005), (.67, .001, .001)], 4)
    def scabbard_surface(name, rows, closed_end=False):
        # The open mouth and broad side follow the blade's section; the sheath
        # hangs outside the thigh rather than embedding a capped solid in it.
        segments = 16
        vertices = [(-.225-(1.015-z)*.10+depth*math.sin(math.tau*j/segments),
                     .115+(1.015-z)*.06+width*math.cos(math.tau*j/segments), z)
                    for z, width, depth in rows for j in range(segments)]
        faces = [(i*segments+j, i*segments+(j+1)%segments,
                  (i+1)*segments+(j+1)%segments, (i+1)*segments+j)
                 for i in range(len(rows)-1) for j in range(segments)]
        if closed_end:
            faces.append(tuple(range((len(rows)-1)*segments, len(rows)*segments)))
        return thin_surface(name, vertices, faces, "pelvis", offset=-1, subdivision_levels=1)

    scabbard_surface("Scabbard", [(1.015, .043, .014), (1.010, .043, .014),
        (.96, .043, .014), (.55, .039, .013), (.43, .022, .010),
        (.405, .006, .006), (.403, .004, .004)], closed_end=True)
    for name, rows in [
        ("mouth", [(1.018, .045, .016), (1.015, .045, .016),
                   (1.001, .045, .016), (.998, .044, .015)]),
        ("upper band", [(.955, .045, .016), (.952, .045, .016),
                        (.938, .045, .016), (.935, .045, .016)]),
        ("lower band", [(.899, .045, .016), (.896, .045, .016),
                        (.882, .045, .016), (.879, .045, .016)]),
        ("chape", [(.455, .028, .013), (.452, .028, .013),
                   (.428, .023, .012), (.402, .008, .008), (.399, .006, .006)]),
    ]:
        scabbard_surface("Scabbard fitting " + name, rows, closed_end=name == "chape")
    for index, (belt_y, end_y, end_z) in enumerate([(.015, .071, .945), (.115, .161, .889)]):
        belt_x = -.201*math.sqrt(1-((belt_y-.005)/.151)**2)
        path = [(belt_x+.008, belt_y, 1.029), (belt_x+.008, belt_y, 1.069),
                (belt_x-.008, belt_y, 1.071), (belt_x-.016, belt_y, 1.048),
                (-.241, end_y, end_z+.012), (-.244, end_y, end_z-.004)]
        vertices = [(x, y+edge, z) for edge in (-.010, .010) for x, y, z in path]
        faces = [(i, i+1, len(path)+i+1, len(path)+i) for i in range(len(path)-1)]
        strap = thin_surface("Scabbard suspension " + str(index), vertices, faces, offset=0)
        # The top follows the fitted waist; the lower end follows the rigid sheath.
        pelvis = strap.vertex_groups["pelvis"]
        for vertex in strap.data.vertices:
            blend = max(0, min(1, (vertex.co.z-.985)/.055))
            blend = blend*blend*(3-2*blend)
            weights = {entry.group: entry.weight*blend for entry in vertex.groups}
            weights[pelvis.index] = weights.get(pelvis.index, 0)+(1-blend)
            for group, weight in weights.items():
                strap.vertex_groups[group].add([vertex.index], weight, "REPLACE")

    for module_name, filename, entry, args in (
        ("heavy_surfaces", "blender-heavy-surfaces.py", "author_surfaces", ([body] + gear,)),
        ("heavy_motion", "blender-heavy-motion.py", "author_motion", (arm, scene)),
    ):
        module_spec = importlib.util.spec_from_file_location(module_name, HERE / filename)
        module = importlib.util.module_from_spec(module_spec)
        module_spec.loader.exec_module(module)
        getattr(module, entry)(*args)

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
