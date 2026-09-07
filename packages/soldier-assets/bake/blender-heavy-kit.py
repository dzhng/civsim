"""Editable heavy-infantry equipment fitted to the shared provisional anatomy.

Run in a fresh Blender session. Equipment pieces retain editable component
geometry; export copies form the runtime mesh. Surface and motion authors compose here;
the anatomy and bind rig remain owned by the human source.
"""
import importlib.util
import math
import sys
from pathlib import Path
from typing import NamedTuple

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


class GarmentSurface(NamedTuple):
    object: bpy.types.Object
    positions: list[Vector]
    normals: list[Vector]
    polygons: list[tuple[int, ...]]


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
    # Torso cloth is supported by the trunk, not by the adjacent resting arm.
    # An unrestricted nearest point can fold an armhole edge into the armpit.
    arm_groups = {g.index for g in body.vertex_groups
                  if g.name.startswith(("upper-arm.", "forearm.", "hand."))}
    torso_triangles = [face for face in triangles if all(
        sum(g.weight for g in body.data.vertices[i].groups if g.group in arm_groups) < .25
        for i in face)]
    torso_support = BVHTree.FromPolygons([vertex.co for vertex in body.data.vertices],
                                        torso_triangles, all_triangles=True)

    def transfer_weights(obj, source, tree, faces):
        groups = {}
        for group in source.vertex_groups:
            target = obj.vertex_groups.get(group.name)
            groups[group.index] = target if target is not None else obj.vertex_groups.new(name=group.name)
        for vertex in obj.data.vertices:
            point, _, index, _ = tree.find_nearest(vertex.co)
            corners = [source.data.vertices[i] for i in faces[index]]
            blend = geometry.barycentric_transform(point, *(v.co for v in corners),
                Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
            weights = {}
            for corner, fraction in zip(corners, blend):
                for entry in corner.groups:
                    weights[entry.group] = weights.get(entry.group, 0)+entry.weight*max(0, fraction)
            influences = sorted(weights.items(), key=lambda item: -item[1])[:4]
            total = sum(weight for _, weight in influences)
            for group in obj.vertex_groups:
                group.remove([vertex.index])
            for group, weight in influences:
                groups[group].add([vertex.index], weight/total, "REPLACE")

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
            transfer_weights(obj, body, nearest, triangles)
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

    def garment(name, rows, sleeve_end, clearance, reinforce=False, lining=None):
        # A tailored torso and overlapping set-in sleeves keep the armhole covered
        # without stretching one low gusset between closing arm and torso.
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
                elif i == len(rows)-1:
                    height += .018*math.sin(angle)
                # Shallow hanging folds open below the belt; the hem remains an open edge.
                hang = max(0, min(1, (1.04-z)/.22))
                fold = .012*hang*math.cos(8*angle+.35)
                x += fold*math.cos(angle)
                y += fold*math.sin(angle)
                height += hang*(.010*math.cos(2*angle)+.004*math.sin(3*angle))
                vertices[i*segments+j] = (x, y, height)
        # Short front/back vents let the hanging panels separate during a stride.
        vents = {}
        for row in (0,1,2):
            for seam in (4,12):
                index = row*segments+seam
                _,y,z = vertices[index]
                vertices[index] = (.006,y,z)
                vents[index] = len(vertices)
                vertices.append((-.006,y,z))
        faces = []
        armhole_start = len(rows)-4
        for i in range(len(rows)-1):
            for j in range(segments):
                if armhole_start <= i < armhole_start+2 and j in (15, 0, 7, 8):
                    continue
                face = (i*segments+j, i*segments+(j+1)%segments,
                        (i+1)*segments+(j+1)%segments, (i+1)*segments+j)
                faces.append(tuple(vents.get(k,k) for k in face) if 4 <= j < 12 else face)
        for sign in (1,-1):
            boundary = []
            axis = Vector((sign*.60, 0, -.80))
            across = Vector((0, 1, 0))
            depth = axis.cross(across)
            angles = [math.tau*j/16 for j in range(16)]
            sleeve_rows = [(.160,1.466,.050),(.217,1.414,.107)]+sleeve_end
            for row, (x, z, radius) in enumerate(sleeve_rows):
                ring = []
                for angle in angles:
                    ring.append(len(vertices))
                    sag = max(0, -sign*math.sin(angle))
                    point = (Vector((sign*x, -.005, z)) +
                             across*(radius*(1.5 if row==0 else .96)*math.cos(angle)) +
                             depth*(radius*math.sin(angle)*(1+.14*sag)))
                    point.z -= .010*sag*sag
                    point += axis*(.007*math.cos(3*angle)+.003*math.sin(5*angle))*((row+1)/len(sleeve_rows))**2
                    vertices.append(point)
                if boundary:
                    for j in range(len(ring)):
                        k = (j+1)%len(ring)
                        faces.append((boundary[j], boundary[k], ring[k], ring[j]))
                boundary = ring
        layer_vertices, layer_faces = [], []
        if reinforce:
            # The open-front horseshoe doubles the mail over the shoulders;
            # its free lower edge is a physical layer, not a painted seam.
            samples = 25
            for w, d, z in [(.103, .097, 1.543), (.116, .108, 1.537),
                            (.205, .120, 1.478), (.268, .129, 1.445),
                            (.277, .130, 1.440)]:
                for j in range(samples):
                    angle = math.radians(-60+300*j/(samples-1))
                    layer_vertices.append((w*math.cos(angle), .005+d*math.sin(angle),
                                     z-.025*abs(math.cos(angle))**1.3+.010*math.sin(angle)))
            layer_faces = [(i*samples+j, i*samples+j+1,
                       (i+1)*samples+j+1, (i+1)*samples+j)
                      for i in range(4) for j in range(samples-1)]
        outer_faces = []
        outer_positions = []
        outer_normals = []
        outer_polygons = []
        def fit_shoulders(mesh):
            # Keep the authored hanging shape; only push actual body intrusions out.
            mesh.calc_loop_triangles()
            topology = [tuple(p.vertices) for p in mesh.polygons]
            if lining is not None and (topology != lining.polygons or len(mesh.vertices) != len(lining.positions)):
                raise ValueError("Mail and lining lost their shared construction topology")
            links = [[] for _ in mesh.vertices]
            for edge in mesh.edges:
                a,b = edge.vertices
                links[a].append(b)
                links[b].append(a)
            torso, pending = set(), [min(mesh.vertices,key=lambda v:v.co.z).index]
            while pending:
                i = pending.pop()
                if i not in torso:
                    torso.add(i)
                    pending.extend(links[i])
            for vertex in mesh.vertices:
                if lining is not None:
                    # Use the actual matching surface point, not a displacement
                    # from a separately fitted cage that can cross a nearby fold.
                    vertex.co = lining.positions[vertex.index]+lining.normals[vertex.index]*clearance
                    continue
                fit = 1
                if vertex.index not in torso:
                    side = "L" if vertex.co.x > 0 else "R"
                    bone = arm.data.bones["upper-arm."+side]
                    progress = (vertex.co-bone.head_local).dot((bone.tail_local-bone.head_local).normalized())
                    fit = min(1,max(0,(progress-.015)/.02))
                    fit = fit*fit*(3-2*fit)
                if fit > 0 and vertex.co.z > 1.19:
                    support = torso_support if vertex.index in torso else nearest
                    point, normal, face, _ = support.find_nearest(vertex.co)
                    if vertex.index in torso:
                        corners = torso_triangles[face]
                        blend = geometry.barycentric_transform(point, *(body.data.vertices[i].co for i in corners),
                            Vector((1,0,0)), Vector((0,1,0)), Vector((0,0,1)))
                        normal = sum((body.data.vertices[i].normal*weight for i,weight in zip(corners,blend)), Vector()).normalized()
                    if (vertex.co-point).dot(normal) < clearance:
                        vertex.co += normal*(clearance-(vertex.co-point).dot(normal))*fit
            mesh.update()
            mesh.calc_loop_triangles()
            outer_faces[:] = [tuple(t.vertices) for t in mesh.loop_triangles]
            outer_positions[:] = [v.co.copy() for v in mesh.vertices]
            outer_normals[:] = [v.normal.copy() for v in mesh.vertices]
            outer_polygons[:] = topology
        obj = thin_surface(name, vertices, faces, fit=fit_shoulders)
        if any((obj.data.vertices[i].co-point).length > 1e-7 for i, point in enumerate(outer_positions)):
            raise ValueError("Garment thickness changed the indexed outer support surface")
        if lining is None:
            links = [[] for _ in obj.data.vertices]
            for edge in obj.data.edges:
                a, b = edge.vertices
                links[a].append(b)
                links[b].append(a)
            remaining = set(range(len(obj.data.vertices)))
            while remaining:
                component, pending = set(), [next(iter(remaining))]
                while pending:
                    i = pending.pop()
                    if i not in component:
                        component.add(i)
                        pending.extend(links[i])
                remaining -= component
                sleeve = min(obj.data.vertices[i].co.z for i in component) > 1.10
                side = "L" if sum(obj.data.vertices[i].co.x for i in component) > 0 else "R"
                for i in component:
                    vertex = obj.data.vertices[i]
                    if sleeve:
                        bone = arm.data.bones["upper-arm."+side]
                        progress = (vertex.co-bone.head_local).dot((bone.tail_local-bone.head_local).normalized())
                        upper_arm = min(1,max(0,(progress+.05)/.11))
                        upper_arm = upper_arm*upper_arm*(3-2*upper_arm)
                        values = {"clavicle."+side:1-upper_arm,"upper-arm."+side:upper_arm}
                    else:
                        chest = min(1,max(0,(vertex.co.z-1.16)/.28))
                        chest = chest*chest*(3-2*chest)
                        spine = min(1,max(0,(vertex.co.z-.98)/.18))
                        spine = spine*spine*(3-2*spine)*(1-chest)
                        thigh = min(1,max(0,(1.07-vertex.co.z)/.17))
                        thigh = .95*thigh*thigh*(3-2*thigh)
                        lateral = min(1,abs(vertex.co.x)/.08)
                        thigh *= lateral*lateral*(3-2*lateral)
                        leg = "L" if vertex.co.x >= 0 else "R"
                        values = {"chest":chest,"spine":spine,
                                  "pelvis":1-chest-spine-thigh,"thigh."+leg:thigh}
                        skin = min(1,max(0,(vertex.co.z-1.36)/.12))
                        skin = skin*skin*(3-2*skin)
                        values = {g:w*(1-skin) for g,w in values.items()}
                        for entry in vertex.groups:
                            group = obj.vertex_groups[entry.group].name
                            values[group] = values.get(group,0)+entry.weight*skin
                        # The cinched band shares the belt's pelvis support; the
                        # hanging panels keep their independent leg-follow field.
                        waist = 1-min(1,max(belt_rows[0][0]-vertex.co.z,vertex.co.z-belt_rows[-1][0],0)/.065)
                        waist = waist*waist*(3-2*waist)
                        if waist > 0:
                            values = {g:w*(1-waist) for g,w in values.items()}
                            values["pelvis"] = values.get("pelvis",0)+waist
                    values = dict(sorted(values.items(),key=lambda item:-item[1])[:4])
                    total = sum(values.values())
                    for group in obj.vertex_groups:
                        group.remove([i])
                    for group,weight in values.items():
                        if weight > 0:
                            obj.vertex_groups[group].add([i],weight/total,"REPLACE")
        if lining is not None:
            if (len(obj.data.vertices) != len(lining.object.data.vertices)
                    or [tuple(p.vertices) for p in obj.data.polygons]
                    != [tuple(p.vertices) for p in lining.object.data.polygons]):
                raise ValueError("Garment thickness lost lining weight correspondence")
            for vertex, donor in zip(obj.data.vertices, lining.object.data.vertices):
                for group in obj.vertex_groups:
                    group.remove([vertex.index])
                for entry in donor.groups:
                    name = lining.object.vertex_groups[entry.group].name
                    obj.vertex_groups[name].add([vertex.index], entry.weight, "REPLACE")
        if reinforce:
            # The doubled mail moves with the garment it rests on. Independent
            # nearest-skin weights can pull the two layers through each other.
            # The doubled shoulder layer crosses the sleeve attachment. Its
            # upper envelope rests on both pieces and inherits their movement.
            support = BVHTree.FromPolygons(outer_positions, outer_faces, all_triangles=True)
            def fit_layer(mesh):
                for vertex in mesh.vertices:
                    point, _, face, _ = support.ray_cast(Vector((vertex.co.x, vertex.co.y, 1.75)),
                                                          Vector((0, 0, -1)))
                    if point is None:
                        raise ValueError("Shoulder layer extends beyond its supporting shirt: "+str(tuple(vertex.co)))
                    corners = outer_faces[face]
                    blend = geometry.barycentric_transform(point, *(outer_positions[i] for i in corners),
                        Vector((1,0,0)), Vector((0,1,0)), Vector((0,0,1)))
                    normal = sum((outer_normals[i]*weight for i,weight in zip(corners,blend)), Vector()).normalized()
                    vertex.co = point+normal*.005
                mesh.update()
            layer = thin_surface("Mail shoulder layer", layer_vertices, layer_faces, fit=fit_layer)
            transfer_weights(layer, obj, support, outer_faces)
            gear.remove(layer)
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            layer.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.join()
        return GarmentSurface(obj, outer_positions, outer_normals, outer_polygons)

    belt_rows = [(1.026, .198, .148), (1.031, .201, .151),
                 (1.061, .201, .151), (1.066, .198, .148)]
    # The lining stays inside matching openings; broad exterior cream bands
    # would interrupt the longer hanging mail silhouette.
    garment_rows = [(.735, .216, .156), (.747, .216, .156), (.87, .208, .149), (.94,.199,.141),
            (1.05, .180, .128), (1.23, .204, .149), (1.35, .233, .163),
            (1.44, .247, .146), (1.505, .216, .097), (1.518, .073, .067)]
    garment_sleeves = [(.286, 1.315, .064), (.336, 1.242, .065), (.348, 1.223, .067),
                      (.350, 1.219, .068)]
    lining = garment("Tunic", garment_rows, garment_sleeves, .009)
    garment("Mail shirt", garment_rows, garment_sleeves, .008, reinforce=True, lining=lining)
    # The belt cinches the pelvis. Nearby thigh skin is not its motion owner.
    loft("Waist belt", [((0, .005, z), w, d) for z, w, d in belt_rows], "pelvis")
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

    def fit_helmet(mesh, clearance=.006):
        # Allow padding between the fixed head and the inside of the metal shell.
        for vertex in mesh.vertices:
            point, normal, _, _ = nearest.find_nearest(vertex.co)
            if (vertex.co-point).dot(normal) < clearance:
                vertex.co = point+normal*clearance

    rows = [(1.695, .089, .101), (1.698, .091, .103), (1.702, .088, .100),
            (1.707, .086, .098), (1.727, .085, .097), (1.756, .075, .086),
            (1.780, .052, .063), (1.797, .017, .023)]
    segments = 32
    vertices = [(w*math.cos(math.tau*j/segments), .013+d*math.sin(math.tau*j/segments), z)
                for z, w, d in rows for j in range(segments)]
    faces = [(i*segments+j, i*segments+(j+1)%segments,
              (i+1)*segments+(j+1)%segments, (i+1)*segments+j)
             for i in range(len(rows)-1) for j in range(segments)]
    # Close the crown only. Solidify makes an annular rim, never a disk through the head.
    faces.append(tuple(range((len(rows)-1)*segments, len(rows)*segments)))
    thin_surface("Helmet bowl and rolled edge", vertices, faces, "head", fit=fit_helmet,
                 subdivision_levels=1)
    for side, sign in [("L", 1), ("R", -1)]:
        rows = [(1.696, .082, -.030, .032), (1.686, .082, -.030, .033),
                (1.662, .076, -.034, .032), (1.625, .062, -.036, .025),
                (1.610, .055, -.030, .010)]
        vertices = []
        for z, x, y, depth in rows:
            for v in (-1, -.5, 0, .5, 1):
                forward = y+depth*v
                width = x+.004*(1-v*v)
                # Wrap the attachment under the oval rim instead of projecting
                # a flat plate's upper corners outside the bowl.
                wrap = max(0, min(1, (z-1.680)/.016))
                width *= 1-wrap+wrap*math.sqrt(1-((forward-.013)/.101)**2)
                vertices.append((sign*width, forward, z))
        faces = [(i*5+j, i*5+j+1, (i+1)*5+j+1, (i+1)*5+j)
                 for i in range(len(rows)-1) for j in range(4)]
        thin_surface("Helmet cheek plate." + side, vertices, faces, "head", offset=0,
                     fit=lambda mesh: fit_helmet(mesh, .003))

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
