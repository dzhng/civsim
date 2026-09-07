"""Locally authored editable human sculpt candidate; no downloaded geometry.

Execute in Blender with this file's __file__ defined. The dedicated scene keeps
unrelated open scenes untouched. This is a proportion study, not accepted game
topology: remeshing joins anatomical volumes before deformation retopology.
"""

import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


OUTPUT = Path(__file__).resolve().parents[1] / "assets/source/human-anatomy"
SCENE = "HumanAnatomyCandidate"
INSPECTION_CLIPS = (("bend", True, False), ("pronation", False, True),
                    ("bend-pronation", True, True))


def loft(name, sections, segments=24, across=(1, 0, 0), depth=(0, 1, 0)):
    """Authored cross-sections retain muscle taper, rather than scaled boxes."""
    vertices, faces = [], []
    u, v = Vector(across), Vector(depth)
    for center, width, thickness in sections:
        for j in range(segments):
            angle = math.tau * j / segments
            vertices.append(Vector(center) + u * (width * math.cos(angle))
                            + v * (thickness * math.sin(angle)))
    for i in range(len(sections) - 1):
        for j in range(segments):
            a, b = i * segments + j, i * segments + (j + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.extend([tuple(reversed(range(segments))),
                  tuple(range(len(vertices) - segments, len(vertices)))])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    surface = bmesh.new()
    surface.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(surface, faces=list(surface.faces))
    surface.to_mesh(mesh)
    surface.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def facial_form(body, sculpt):
    """Author the final head after weighting, preserving the body and its heat field."""
    surface = bmesh.new()
    surface.from_mesh(body.data)
    edges = [edge for edge in surface.edges
             if all(v.co.z > 1.57 for v in edge.verts)]
    bmesh.ops.subdivide_edges(surface, edges=edges, cuts=3, use_grid_fill=True)
    bmesh.ops.triangulate(surface, faces=list(surface.faces))
    source = bmesh.new()
    source.from_mesh(sculpt.data)
    reference = BVHTree.FromBMesh(source)
    for vertex in surface.verts:
        if vertex.co.z > 1.57:
            blend = min(1, (vertex.co.z-1.57)/.020)
            vertex.co = vertex.co.lerp(reference.find_nearest(vertex.co)[0],
                                       blend*blend*(3-2*blend))
    source.free()
    surface.to_mesh(body.data)
    surface.free()
    for vertex in body.data.vertices:
        x, y, z = vertex.co
        if z <= 1.57:
            continue
        neck_blend = min(1, (z-1.57)/.025)
        neck_blend = neck_blend*neck_blend*(3-2*neck_blend)
        # Rounded vault and a wider mandibular angle distinguish skull from face.
        vault = math.exp(-((z-1.753)/.035)**2)
        upper_head = min(1, max(0, (z-1.705)/.085))
        vertex.co.z -= .012*upper_head*upper_head*(3-2*upper_head)
        vertex.co.x *= (1 - .05*vault
                       + neck_blend*.10*math.exp(-((z-1.600)/.024)**2)*(1-math.exp(-(x/.035)**2)))
        vertex.co.y = .010+(y-.010)*(1-.03*vault)
        if y >= -.020 or z >= 1.735:
            continue
        front = min(1, max(0, (-y-.020)/.030))
        boundary = min(1, (z-1.57)/.018, (1.735-z)/.030)
        blend = front*boundary*boundary*(3-2*boundary)
        # The facial envelope owns nose, sockets, muzzle and lips together. It
        # replaces construction relief rather than stacking another face on it.
        face = -.071 + .025*(x/.075)**2
        face += .004*math.exp(-((z-1.626)/.024)**2)
        face -= .010*math.exp(-(x/.030)**2-((z-1.586)/.018)**2)
        face -= .004*math.exp(-((abs(x)-.043)/.028)**2-((z-1.651)/.026)**2)
        face += .003*math.exp(-((abs(x)-.049)/.025)**2-((z-1.619)/.023)**2)
        face -= .003*math.exp(-(x/.033)**4-((z-1.617)/.023)**2)
        face -= .007*math.exp(-((abs(x)-.030)/.025)**4-((z-1.698)/.010)**2)
        face += .004*math.exp(-((abs(x)-.032)/.021)**4-((z-1.679)/.015)**2)
        bridge = .017*math.exp(-(x/.010)**2-((z-1.668)/.029)**2)
        tip = .022*math.exp(-(x/.012)**2-((z-1.646)/.012)**2)
        wing = .012*math.exp(-((abs(x)-.013)/.006)**2-((z-1.641)/.007)**2)
        nostril = .005*math.exp(-((abs(x)-.011)/.0035)**2-((z-1.637)/.003)**2)
        face -= bridge+tip+wing-nostril
        mouth = 1.611 + .001*math.exp(-(x/.008)**2)
        lip_span = math.exp(-(x/.024)**4)
        face -= lip_span*(.003*math.exp(-((z-mouth-.003)/.004)**2)
                          + .004*math.exp(-((z-mouth+.005)/.005)**2)
                          - .003*math.exp(-((z-mouth)/.0018)**2))
        face += .003*math.exp(-(x/.022)**2-((z-1.597)/.005)**2)
        eye_u = (abs(x)-.032)/.015
        if abs(eye_u) < 1.35:
            span = max(0, 1-eye_u*eye_u)
            middle = 1.678 + .001*eye_u
            upper, lower = middle+.0055*span, middle-.003*span
            distance = max(z-upper, lower-z)
            # A convex exposed eye surface meets thin lids; the upper orbital
            # fold is outside the opening, not a slit cut through its center.
            opening = max(0, min(1, (.0015-distance)/.0025))*span**.25
            globe = -.055-.010*math.sqrt(max(0, 1-(eye_u*.85)**2-((z-middle)/.016)**2))
            face = face*(1-opening)+globe*opening
            face -= span*(.0008*math.exp(-((z-upper)/.002)**2)
                          + .0005*math.exp(-((z-lower)/.002)**2))
            face += span*.0015*math.exp(-((z-upper-.005)/.0025)**2)
        vertex.co.y = vertex.co.y*(1-blend)+face*blend


def power_grip(body):
    """Graft locally authored hands onto the weighted body's untouched wrist loops."""
    from mathutils.geometry import barycentric_transform

    surface = bmesh.new()
    surface.from_mesh(body.data)
    weights = surface.verts.layers.deform.active
    uv = surface.loops.layers.uv.active
    source = surface.copy()
    source_weights = source.verts.layers.deform.active
    reference = BVHTree.FromBMesh(source)
    original_faces = list(source.faces)
    if weights and any(len(face.verts) != 3 for face in original_faces):
        raise RuntimeError("Weighted hand donor must be triangulated before interpolation")
    for side, sign in (("L", 1), ("R", -1)):
        wrist = Vector((sign*.515, -.018, .98))
        along, across = Vector((sign*.60, 0, -.80)), Vector((sign*.80, 0, .60))
        def point(u, a=0, d=0):
            return wrist+along*u+across*a+Vector((0, d, 0))
        def local(vertex):
            delta = vertex.co-wrist
            return delta.dot(along), delta.dot(across), delta.y
        palm_sections = [
            (point(.033, -.005, -.001), .041, .023),
            (point(.049, -.004, -.001), .042, .021),
            (point(.065, -.001, .001), .040, .021),
            (point(.079, 0, .003), .039, .019),
            (point(.092, -.002, .004), .034, .015),
            (point(.104, -.006, .003), .022, .012),
            (point(.109, -.010, .002), .010, .007),
        ]
        palm = loft("grip-palm."+side, palm_sections, segments=24, across=across)
        # Thenar and little-finger pads flank a shallow volar cup. The existing
        # wrist seam stays unchanged; this is grasp volume, not skin detail.
        for i, (center, width, thickness) in enumerate(palm_sections):
            u = (center-wrist).dot(along)
            support = math.exp(-((u-.068)/.024)**4)
            for j in range(24):
                angle = math.tau*j/24
                a, d = width*math.cos(angle), thickness*math.sin(angle)
                if d < 0:
                    pads = .009*math.exp(-((a+.025)/.014)**2)+.006*math.exp(-((a-.027)/.013)**2)
                    cup = .004*math.exp(-(a/.012)**2)
                    d += support*(cup-pads)*(-math.sin(angle))
                palm.data.vertices[i*24+j].co = center+across*a+Vector((0, d, 0))
        pieces = [palm]
        def digit(name, sections, opposing=False):
            obj = loft(name, sections, segments=12, across=across)
            for i, (center, width, thickness) in enumerate(sections):
                tangent = sections[min(i+1, len(sections)-1)][0]-sections[max(i-1, 0)][0]
                width_axis = tangent.cross(Vector((0, 1, 0))).normalized() if opposing else across
                depth = tangent.cross(width_axis).normalized()
                for j in range(12):
                    angle = math.tau*j/12
                    # Fingers use rounded-rectangular cross-sections;
                    # the thumb retains a softer oval cross-section.
                    exponent = 1 if opposing else .78
                    c, s = math.cos(angle), math.sin(angle)
                    obj.data.vertices[i*12+j].co = (
                        center+width_axis*(width*math.copysign(abs(c)**exponent, c))
                        +depth*(thickness*math.copysign(abs(s)**exponent, s)))
            pieces.append(obj)
        # The knuckle arch, shaft taper and different little-finger length
        # establish the hand's mass before any surface details are considered.
        for index, (a, knuckle, scale, tip_u, tip_d) in enumerate((
                (-.030, .108, 1, .086, -.053), (-.010, .111, 1.04, .080, -.048),
                (.010, .109, .96, .083, -.051), (.030, .114, .82, .098, -.060))):
            digit(f"grip-finger-{index}.{side}", [
                (point(.086, a*.94, .003), .0110*scale, .0120),
                (point(knuckle, a, -.006 if index != 3 else -.010), .0100*scale, .0100),
                (point(.118, a, -.010), .0082*scale, .0080),
                (point(.125, a, -.021), .0092*scale, .0090),
                (point(.126, a, -.033), .0080*scale, .0080),
                (point(.120, a, -.047), .0070*scale, .0068),
                (point(.110, a, -.056), .0080*scale, .0088),
                (point(.099 if index != 3 else .107, a*.98, -.061), .0071*scale, .0070),
                (point(tip_u+.004, a*.96, tip_d-.004), .0060*scale, .0060),
                (point(tip_u, a*.94, tip_d), .0025*scale, .0030),
            ])
        digit("grip-thumb."+side, [
            (point(.043, -.026, -.011), .016, .016),
            (point(.061, -.033, -.027), .013, .011),
            (point(.071, -.030, -.049), .010, .009),
            (point(.085, -.021, -.074), .010, .009),
            (point(.100, -.005, -.075), .009, .0075),
            (point(.111, .007, -.070), .0065, .0060),
            (point(.114, .011, -.066), .0035, .0035),
        ], opposing=True)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in pieces:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = pieces[0]
        bpy.ops.object.join()
        hand = pieces[0]
        normals = bmesh.new()
        normals.from_mesh(hand.data)
        bmesh.ops.recalc_face_normals(normals, faces=list(normals.faces))
        normals.to_mesh(hand.data)
        normals.free()
        union = hand.modifiers.new("Local hand union", "REMESH")
        union.mode, union.voxel_size = "VOXEL", .0014
        union.use_smooth_shade = True
        bpy.ops.object.modifier_apply(modifier=union.name)
        smooth = hand.modifiers.new("Hand surface relaxation", "SMOOTH")
        smooth.factor, smooth.iterations = .35, 3
        bpy.ops.object.modifier_apply(modifier=smooth.name)
        reduction = hand.modifiers.new("Hand curvature reduction", "DECIMATE")
        reduction.ratio = .23
        reduction.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=reduction.name)
        relax = hand.modifiers.new("Relax reduced hand facets", "SMOOTH")
        relax.factor, relax.iterations = .25, 2
        bpy.ops.object.modifier_apply(modifier=relax.name)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        patch = bmesh.new()
        patch.from_mesh(hand.data)
        bpy.data.objects.remove(hand, do_unlink=True)
        # Only the new hand is remeshed. The original wrist edge and every
        # retained body vertex keep their coordinates, weights and UVs.
        bmesh.ops.bisect_plane(patch, geom=list(patch.verts)+list(patch.edges)+list(patch.faces),
                              dist=1e-7, plane_co=point(.045), plane_no=along,
                              clear_inner=True, clear_outer=False)
        removed = [v for v in surface.verts
                   if v.co.x*sign > .49 and v.co.z < 1.02 and local(v)[0] > .035]
        bmesh.ops.delete(surface, geom=removed, context="VERTS")
        bmesh.ops.delete(surface, geom=[e for e in surface.edges if not e.link_faces], context="EDGES")
        old_loop = {v for edge in surface.edges if edge.is_boundary
                    for v in edge.verts if v.co.x*sign > .49 and v.co.z < 1.02}
        new_loop = {v for edge in patch.edges if edge.is_boundary for v in edge.verts}
        def ordered(vertices):
            start = min(vertices, key=lambda v: math.atan2(local(v)[2], local(v)[1]))
            result, previous, current = [], None, start
            while current not in result:
                result.append(current)
                neighbors = [edge.other_vert(current) for edge in current.link_edges
                             if edge.is_boundary and edge.other_vert(current) in vertices
                             and edge.other_vert(current) != previous]
                if not neighbors:
                    raise RuntimeError("Hand wrist is not a closed boundary loop")
                previous, current = current, neighbors[0]
            if len(result) != len(vertices):
                raise RuntimeError("Hand wrist has multiple boundary loops")
            area = sum(local(a)[1]*local(b)[2]-local(b)[1]*local(a)[2]
                       for a, b in zip(result, result[1:]+result[:1]))
            if area < 0:
                result = [result[0]]+list(reversed(result[1:]))
            return result
        if not old_loop or not new_loop:
            raise RuntimeError("Hand graft lost its wrist boundary")
        old_loop, new_loop = ordered(old_loop), ordered(new_loop)
        def arc_lengths(loop):
            lengths = [0]
            for a, b in zip(loop, loop[1:]+loop[:1]):
                lengths.append(lengths[-1]+(b.co-a.co).length)
            return [value/lengths[-1] for value in lengths]
        old_progress, new_progress = arc_lengths(old_loop), arc_lengths(new_loop)
        mapping = {}
        for vertex in patch.verts:
            added = surface.verts.new(vertex.co)
            mapping[vertex] = added
            if weights:
                p, _, face_index, _ = reference.find_nearest(vertex.co)
                face = original_faces[face_index]
                # The source is triangulated before weighting. Interpolate
                # its existing field; never solve the body's heat weights again.
                corners = list(face.verts)[:3]
                bary = barycentric_transform(p, *(v.co for v in corners),
                                             Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
                for corner, amount in zip(corners, bary):
                    for group, weight in corner[source_weights].items():
                        added[weights][group] = added[weights].get(group, 0)+weight*max(0, amount)
                total = sum(added[weights].values())
                for group in added[weights].keys():
                    added[weights][group] /= total
        patch_uv = patch.loops.layers.uv.active
        new_faces = []
        for face in patch.faces:
            added = surface.faces.new([mapping[v] for v in face.verts])
            new_faces.append(added)
            added.smooth = True
            if uv and patch_uv:
                for dst, src in zip(added.loops, face.loops):
                    dst[uv].uv = src[patch_uv].uv
        new_loop = [mapping[v] for v in new_loop]
        i = j = 0
        while i < len(old_loop) or j < len(new_loop):
            a, b = old_loop[i % len(old_loop)], new_loop[j % len(new_loop)]
            old_next = old_progress[i+1] if i < len(old_loop) else math.inf
            new_next = new_progress[j+1] if j < len(new_loop) else math.inf
            if old_next < new_next:
                corners = [a, old_loop[(i+1) % len(old_loop)], b]
                i += 1
            else:
                corners = [a, new_loop[(j+1) % len(new_loop)], b]
                j += 1
            face = surface.faces.new(corners)
            new_faces.append(face)
            face.smooth = True
            if uv:
                coords = [(math.atan2(local(loop.vert)[2], local(loop.vert)[1])/math.tau+.5,
                           local(loop.vert)[0]) for loop in face.loops]
                wraps = max(p[0] for p in coords)-min(p[0] for p in coords) > .5
                for loop, (angle, u) in zip(face.loops, coords):
                    loop[uv].uv = ((angle+.5) % 1 if wraps else angle, u)
        patch.free()
        bmesh.ops.triangulate(surface, faces=new_faces)
    bmesh.ops.recalc_face_normals(surface, faces=list(surface.faces))
    if any(not edge.is_manifold for edge in surface.edges):
        raise RuntimeError("Hand graft has an open or nonmanifold seam")
    surface.to_mesh(body.data)
    surface.free()
    source.free()
    body.data.update()


def deform_candidate(sculpt):
    """Keep the sculpt editable while testing a provisional deformation mesh."""
    body = sculpt.copy()
    body.data = sculpt.data.copy()
    body.name = "HumanAnatomy-Deform"
    bpy.context.scene.collection.objects.link(body)
    sculpt.hide_set(True)
    sculpt.hide_render = True
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    collapsible = body.vertex_groups.new(name="collapsible-body")
    protected = set()
    for vertex in body.data.vertices:
        x, y, z = vertex.co
        along_hand = (abs(x)-.515)*.60 - (z-.98)*.80
        if abs(x) > .49 and z < 1.02 and along_hand > .035:
            protected.add(vertex.index)
        else:
            collapsible.add([vertex.index], 1, "REPLACE")
    hand_triangles = sum(len(face.vertices)-2 for face in body.data.polygons
                         if any(index in protected for index in face.vertices))
    reduction = body.modifiers.new("Curvature-preserving candidate reduction", "DECIMATE")
    # Zero-weight hand vertices cannot collapse; their pads must survive the body reduction.
    reduction.vertex_group, reduction.vertex_group_factor = collapsible.name, 1
    # Provisional body allowance plus preserved hands, not a measured runtime limit.
    reduction.ratio = min(1, (9000+hand_triangles) / sum(len(face.vertices)-2 for face in body.data.polygons))
    reduction.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=reduction.name)
    body.vertex_groups.remove(body.vertex_groups["collapsible-body"])
    topology = bmesh.new()
    topology.from_mesh(body.data)
    bmesh.ops.recalc_face_normals(topology, faces=list(topology.faces))
    if any(not edge.is_manifold for edge in topology.edges):
        raise RuntimeError("Anatomy retopology has an open or nonmanifold seam")
    topology.to_mesh(body.data)
    topology.free()
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    bones = [
        ("root", (0, 0, 0), (0, 0, .20), None),
        ("pelvis", (0, .01, .94), (0, .006, 1.08), "root"),
        ("spine", (0, .006, 1.08), (0, 0, 1.27), "pelvis"),
        ("chest", (0, 0, 1.27), (0, .005, 1.46), "spine"),
        ("neck", (0, .005, 1.46), (0, .008, 1.57), "chest"),
        ("head", (0, .008, 1.57), (0, .008, 1.78), "neck"),
    ]
    for side, sign in (("L", 1), ("R", -1)):
        def p(x, y, z):
            return (sign * x, y, z)
        bones.extend([
            ("clavicle." + side, p(.025, 0, 1.43), p(.207, 0, 1.413), "chest"),
            ("upper-arm." + side, p(.207, 0, 1.413), p(.375, -.012, 1.177), "clavicle." + side),
            ("forearm." + side, p(.375, -.012, 1.177), p(.515, -.018, .98), "upper-arm." + side),
            ("elbow-volume." + side, p(.375, -.012, 1.177), p(.433, -.015, 1.095), "upper-arm." + side),
            ("hand." + side, p(.515, -.018, .98), p(.596, -.018, .872), "forearm." + side),
            ("thigh." + side, p(.094, .012, .94), p(.12, -.022, .515), "pelvis"),
            ("shin." + side, p(.12, -.022, .515), p(.124, .004, .105), "thigh." + side),
            ("knee-volume." + side, p(.12, -.022, .515), p(.121, -.016, .415), "thigh." + side),
            ("foot." + side, p(.124, .004, .105), p(.124, -.105, .046), "shin." + side),
            ("toe." + side, p(.124, -.105, .046), p(.124, -.15, .036), "foot." + side),
        ])
    arm = bpy.data.objects.new("HumanAnatomy-Rig", bpy.data.armatures.new("HumanAnatomy-Skeleton"))
    bpy.context.scene.collection.objects.link(arm)
    body.select_set(False)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in bones:
        bone = arm.data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = arm.data.edit_bones[parent]
        bone.use_deform = name != "root"
    bpy.ops.object.mode_set(mode="OBJECT")
    body.select_set(True)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    # Interpolate the already authored weights instead of re-solving the whole
    # body's heat field after a local facial topology edit.
    facial_form(body, sculpt)
    power_grip(body)
    power_grip(sculpt)
    deform_groups = {group.index for group in body.vertex_groups
                     if group.name in arm.data.bones and arm.data.bones[group.name].use_deform}
    for vertex in body.data.vertices:
        weights = [entry.weight for entry in vertex.groups
                   if entry.group in deform_groups and entry.weight > 0]
        # glTF otherwise silently assigns unweighted vertices to a neutral joint.
        if (not weights or len(weights) > 4 or not all(math.isfinite(w) for w in weights)
                or abs(sum(weights) - 1) > 1e-5):
            raise RuntimeError(f"Invalid deform weights at vertex {vertex.index}: {weights}")
    for modifier in body.modifiers:
        if modifier.type == "ARMATURE":
            modifier.use_deform_preserve_volume = False
    inspection_clips(arm)
    check_grip_tracking(body, arm)
    body["authoring_status"] = "Provisional reduced mesh and heat weights; deep-bend review required"
    return body, arm


def inspection_clips(arm):
    """Keep the original bend and add isolated local-forearm-roll studies."""
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 0, 60
    for clip_name, bending, rolling in INSPECTION_CLIPS:
        arm.animation_data_create()
        arm.animation_data.action = None
        for frame in (range(61) if rolling else (0, 15, 30, 45, 60)):
            phase = frame / 15
            lower = min(3, int(phase))
            amount = ((1-(phase-lower))*math.sin(math.pi*lower/4)
                      + (phase-lower)*math.sin(math.pi*(lower+1)/4))
            bend = amount if bending else 0
            for bone in arm.pose.bones:
                bone.rotation_mode = "XYZ"
                bone.rotation_euler = (0, 0, 0)
                bone.location = (0, 0, 0)
            arm.pose.bones["pelvis"].location.y = -.175 * bend
            arm.pose.bones["spine"].rotation_euler.x = .20 * bend
            for side in ("L", "R"):
                arm.pose.bones["thigh." + side].rotation_euler.x = -.60 * bend
                arm.pose.bones["shin." + side].rotation_euler.x = 1.30 * bend
                arm.pose.bones["foot." + side].rotation_euler.x = -.70 * bend
                arm.pose.bones["forearm." + side].rotation_euler.x = -1.45 * bend
                # Bisector bones retain joint cross-section volume under linear skinning.
                arm.pose.bones["elbow-volume." + side].rotation_euler.x = -.725 * bend
                arm.pose.bones["knee-volume." + side].rotation_euler.x = .65 * bend
            if rolling:
                # Roll about the already-flexed forearm axis, not the upper-arm axis.
                for name, fraction in (("forearm.R", 1), ("elbow-volume.R", .5)):
                    rotation = (Matrix.Rotation(-1.45*bend*fraction, 3, "X")
                                @ Matrix.Rotation(math.pi/2*amount*fraction, 3, "Y"))
                    arm.pose.bones[name].rotation_euler = rotation.to_euler("XYZ")
            for bone in arm.pose.bones:
                bone.keyframe_insert("rotation_euler", frame=frame)
                bone.keyframe_insert("location", frame=frame)
        action = arm.animation_data.action
        action.name = clip_name
        track = arm.animation_data.nla_tracks.new()
        track.name = action.name
        track.mute = True
        strip = track.strips.new(action.name, 0, action)
        strip.action_slot = action.slots[0]
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = "LINEAR"
    arm.animation_data.action = bpy.data.actions["bend"]
    arm.animation_data.action_slot = arm.animation_data.action.slots[0]
    scene.frame_set(0)


def check_grip_tracking(body, arm):
    """The roll study must not slide grip-region skin relative to rigid hand gear."""
    center, axis = Vector((-.5732, -.051, .9024)), Vector((-.8, 0, .6))
    points = [vertex.co.copy() for vertex in body.data.vertices]
    ids = [i for i, point in enumerate(points)
           if abs((point-center).dot(axis)) < .045
           and ((point-center)-axis*(point-center).dot(axis)).length < .047]
    if not ids:
        raise RuntimeError("Pronation study has no grip-region surface")
    scene = bpy.context.scene
    original = arm.animation_data.action
    maxima = {}
    for track in arm.animation_data.nla_tracks:
        action = track.strips[0].action
        arm.animation_data.action = action
        arm.animation_data.action_slot = action.slots[0]
        maximum = 0
        for frame in range(61):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            rigid = arm.pose.bones["hand.R"].matrix @ arm.data.bones["hand.R"].matrix_local.inverted()
            maximum = max(maximum, max((mesh.vertices[i].co-rigid@points[i]).length for i in ids))
            evaluated.to_mesh_clear()
        if maximum > 1e-6:
            raise RuntimeError(f"{action.name}: grip surface drifts {maximum} metres from rigid hand gear")
        maxima[action.name] = maximum
    arm.animation_data.action = original
    arm.animation_data.action_slot = original.slots[0]
    scene.frame_set(0)
    print({"grip_surface_vertices": len(ids), "rigid_tracking_max_metres": maxima})


def export_candidate(body, arm, output=OUTPUT, name="human-anatomy"):
    bpy.context.scene.frame_set(0)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    output.mkdir(parents=True, exist_ok=True)
    # Muted owned NLA tracks associate every inspection action with this rig.
    # Suppress the duplicate active action during export, without broadcasting
    # unrelated actions from other Blender scenes onto the selected skeleton.
    action = arm.animation_data.action
    if arm.animation_data.nla_tracks:
        arm.animation_data.action = None
    # Editable anatomy faces -Y; exported native forward is +Y. Rotate the
    # complete bound assembly, then restore authoring space before saving it.
    authoring_matrix = arm.matrix_world.copy()
    try:
        arm.matrix_world = Matrix.Rotation(math.pi, 4, "Z") @ authoring_matrix
        bpy.context.view_layer.update()
        bpy.ops.export_scene.gltf(
            filepath=str(output / f"{name}.glb"), export_format="GLB",
            use_selection=True, use_active_scene=True, export_yup=True, export_skins=True,
            export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
            export_frame_step=1, export_def_bones=True, export_all_influences=False,
            export_anim_slide_to_zero=True, export_reset_pose_bones=True,
            export_anim_single_armature=False, export_bake_animation=True,
            export_hierarchy_flatten_bones=False, export_hierarchy_flatten_objs=False,
            export_apply=False, export_texcoords=True, export_normals=True, export_tangents=True,
            export_attributes=True,
        )
    finally:
        arm.matrix_world = authoring_matrix
        arm.animation_data.action = action
        if action:
            arm.animation_data.action_slot = action.slots[0]
        bpy.context.scene.frame_set(0)
    bpy.data.libraries.write(str(output / f"{name}.blend"), {bpy.context.scene},
                             path_remap="RELATIVE", fake_user=True, compress=True)


def build():
    if SCENE in bpy.data.scenes:
        raise RuntimeError("Candidate scene already exists; inspect it before rebuilding")
    if any(name in bpy.data.actions for name, _, _ in INSPECTION_CLIPS):
        raise RuntimeError("An inspection action name is already in use; build in a fresh Blender session")
    scene = bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    parts = []
    parts.append(loft("thorax-pelvis", [
        ((0, .015, .85), .040, .067),
        ((0, .012, .90), .145, .105),
        ((0, .018, .95), .176, .123),
        ((0, .015, 1.00), .172, .113),
        ((0, .006, 1.08), .141, .091),
        ((0, .000, 1.17), .150, .098),
        ((0, -.008, 1.27), .187, .119),
        ((0, -.004, 1.37), .206, .123),
        ((0, .003, 1.44), .190, .091),
        ((0, .010, 1.49), .123, .068),
        ((0, .005, 1.52), .060, .055),
    ]))
    parts.append(loft("neck", [
        ((0, .015, 1.45), .065, .063),
        ((0, .016, 1.52), .052, .052),
        ((0, .006, 1.59), .056, .052),
    ]))
    head_sections = [
        ((0, -.029, 1.562), .036, .042),
        ((0, -.015, 1.585), .056, .064),
        ((0, -.001, 1.62), .071, .076),
        ((0, .006, 1.66), .078, .083),
        ((0, .009, 1.70), .077, .087),
        ((0, .010, 1.745), .075, .083),
        ((0, .009, 1.778), .052, .061),
        ((0, .008, 1.794), .010, .014),
    ]
    dense_head = []
    for lower, upper in zip(head_sections, head_sections[1:]):
        steps = max(1, round((upper[0][2] - lower[0][2]) / .005))
        for step in range(steps):
            t = step / steps
            dense_head.append((Vector(lower[0]).lerp(Vector(upper[0]), t),
                               lower[1] * (1 - t) + upper[1] * t,
                               lower[2] * (1 - t) + upper[2] * t))
    dense_head.append(head_sections[-1])
    head = loft("cranial-jaw-profile", dense_head, segments=96)
    # Facial relief remains geometry, with a brow, cheek and chin silhouette.
    for vertex in head.data.vertices:
        x, y, z = vertex.co
        if y < -.025:
            front = min(1, (-y - .025) / .045)
            nose = .036 * math.exp(-(x / .014) ** 2 - ((z - 1.651) / .031) ** 2)
            alar = .010 * math.exp(-((abs(x) - .012) / .007) ** 2
                                   - ((z - 1.641) / .008) ** 2)
            brow = .011 * math.exp(-((z - 1.696) / .008) ** 2)
            sockets = .014 * math.exp(-((abs(x) - .032) / .017) ** 2
                                     - ((z - 1.678) / .011) ** 2)
            cheek = .009 * math.exp(-((abs(x) - .043) / .020) ** 2
                                    - ((z - 1.652) / .016) ** 2)
            vertex.co.y -= front * (nose + alar + brow + cheek - sockets)
    parts.append(head)
    for side, sign in (("L", 1), ("R", -1)):
        def point(x, y, z):
            return (sign * x, y, z)
        parts.append(loft("leg." + side, [
            (point(.094, .016, 1.035), .074, .085),
            (point(.100, .015, .96), .085, .100),
            (point(.104, .010, .88), .086, .105),
            (point(.113, -.002, .77), .087, .101),
            (point(.118, -.013, .64), .068, .077),
            (point(.12, -.030, .54), .055, .060),
            (point(.12, -.025, .50), .053, .055),
            (point(.121, .013, .42), .073, .079),
            (point(.122, .016, .34), .067, .077),
            (point(.123, .010, .25), .050, .058),
            (point(.124, .004, .13), .030, .038),
            (point(.124, .004, .075), .034, .040),
        ]))
        parts.append(loft("patella." + side, [
            (point(.120, -.073, .482), .012, .009),
            (point(.120, -.075, .500), .026, .015),
            (point(.120, -.075, .524), .034, .018),
            (point(.120, -.067, .545), .030, .014),
            (point(.120, -.062, .560), .008, .004),
        ], segments=20))
        foot = loft("foot." + side, [
            (point(.124, .065, .050), .015, .022),
            (point(.124, .045, .051), .030, .038),
            (point(.124, .010, .062), .035, .050),
            (point(.121, -.030, .066), .038, .053),
            (point(.120, -.075, .049), .047, .034),
            (point(.119, -.120, .037), .053, .023),
            (point(.116, -.162, .033), .046, .020),
            (point(.112, -.185, .032), .029, .016),
            (point(.109, -.195, .032), .008, .008),
        ], depth=(0, 0, 1))
        for vertex in foot.data.vertices:
            x, y, z = vertex.co
            offset = x - sign * .124
            if sign * offset < 0 and z < .05:
                vertex.co.z += .018 * math.exp(-((y + .025) / .04) ** 2)
        parts.append(foot)
        arm_axis = Vector((sign * .60, 0, -.80))
        across = Vector((sign * .80, 0, .60))
        parts.append(loft("clavicular-shoulder." + side, [
            (point(.065, .012, 1.483), .028, .055),
            (point(.110, .008, 1.470), .030, .065),
            (point(.170, .003, 1.450), .038, .075),
            (point(.210, .000, 1.420), .043, .073),
        ], across=(sign * .30, 0, .954)))
        parts.append(loft("arm." + side, [
            (point(.065, .000, 1.422), .028, .045),
            (point(.145, .002, 1.422), .077, .079),
            (point(.202, .001, 1.405), .073, .075),
            (point(.266, .000, 1.341), .069, .074),
            (point(.322, -.005, 1.254), .059, .063),
            (point(.360, -.010, 1.197), .053, .053),
            (point(.380, -.013, 1.170), .055, .057),
            (point(.413, -.015, 1.125), .058, .061),
            (point(.465, -.018, 1.049), .044, .048),
            (point(.504, -.018, .995), .027, .029),
            (point(.517, -.018, .977), .026, .026),
        ], across=across))
        wrist = Vector(point(.515, -.018, .98))
        parts.append(loft("palm." + side, [
            (wrist, .026, .025),
            (wrist + arm_axis * .037, .040, .023),
            (wrist + arm_axis * .082, .038, .021),
            (wrist + arm_axis * .096, .032, .017),
        ], segments=16, across=across))
        def digit(name, sections):
            obj = loft(name, sections, segments=12, across=across)
            # Ring depth follows the curl; the shared across axis preserves finger spacing.
            for i, (center, width, thickness) in enumerate(sections):
                before = sections[max(0, i-1)][0]
                after = sections[min(len(sections)-1, i+1)][0]
                normal = (after-before).cross(across).normalized()
                for j in range(12):
                    angle = math.tau*j/12
                    obj.data.vertices[i*12+j].co = (center + across*(width*math.cos(angle))
                                                   + normal*(thickness*math.sin(angle)))
            surface = bmesh.new()
            surface.from_mesh(obj.data)
            bmesh.ops.recalc_face_normals(surface, faces=list(surface.faces))
            surface.to_mesh(obj.data)
            surface.free()
            parts.append(obj)

        # A 34mm cylindrical grip runs along 'across', centered beyond the palm.
        grip = wrist + arm_axis*.097 + Vector((0, -.033, 0))
        for finger, (offset, end_angle) in enumerate(((-.028, -1.55), (-.009, -2.0),
                                                     (.011, -1.85), (.030, -1.30))):
            base = wrist + arm_axis * .084 + across * offset
            sections = [(base, .0085, .010)]
            for t in (0, .25, .5, .75, 1):
                angle = 1.20 + (end_angle-1.20)*t
                center = grip + across*offset + arm_axis*(.026*math.cos(angle))
                center += Vector((0, .026*math.sin(angle), 0))
                radius = .008*(1-t) + .005*t
                sections.append((center, radius, radius))
            digit(f"finger-{finger}.{side}", sections)
        thumb_base = wrist + arm_axis * .023 - across * .026
        digit("thumb." + side, [
            (thumb_base, .017, .017),
            (wrist + arm_axis*.047 - across*.040 + Vector((0, -.016, 0)), .014, .013),
            (wrist + arm_axis*.075 - across*.045 + Vector((0, -.038, 0)), .011, .011),
            (wrist + arm_axis*.095 - across*.034 + Vector((0, -.054, 0)), .006, .007),
        ])
        parts.append(loft("ear." + side, [
            (point(.073, .011, 1.627), .007, .012),
            (point(.080, .009, 1.656), .012, .018),
            (point(.075, .010, 1.687), .006, .012),
        ], segments=12))
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        bpy.context.view_layer.objects.active = part
        subdivision = part.modifiers.new("Anatomical cross-section interpolation", "SUBSURF")
        subdivision.levels = 2
        bpy.ops.object.modifier_apply(modifier=subdivision.name)
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = "HumanAnatomy-Sculpt"
    body.data.remesh_voxel_size = .004
    bpy.ops.object.voxel_remesh()
    relaxation = body.vertex_groups.new(name="surface-relaxation")
    for vertex in body.data.vertices:
        x, y, z = vertex.co
        along_hand = (abs(x)-.515)*.60 - (z-.98)*.80
        preserve = min(1, max(0, (along_hand-.015)/.025)) if abs(x) > .49 and z < 1.02 else 0
        relaxation.add([vertex.index], 1-preserve, "REPLACE")
    smooth = body.modifiers.new("Surface relaxation", "SMOOTH")
    # Whole-body relaxation otherwise shrinks fingertip pads into sharp hooks.
    smooth.vertex_group = relaxation.name
    smooth.factor, smooth.iterations = .65, 12
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    body.vertex_groups.remove(body.vertex_groups["surface-relaxation"])
    # Blend muscle roots locally; global smoothing would erase face and fingers.
    junctions = body.vertex_groups.new(name="anatomical-junctions")
    for vertex in body.data.vertices:
        x, y, z = vertex.co
        shoulder = ((abs(x) - .18) / .17) ** 2 + ((z - 1.43) / .14) ** 2 + (y / .30) ** 2
        hip = ((abs(x) - .11) / .14) ** 2 + ((z - .96) / .16) ** 2 + (y / .17) ** 2
        weight = max(0, 1 - min(shoulder, hip)) ** 2
        if weight:
            junctions.add([vertex.index], weight, "REPLACE")
    blend = body.modifiers.new("Sculpt anatomical junctions", "SMOOTH")
    blend.vertex_group, blend.factor, blend.iterations = junctions.name, .8, 100
    bpy.ops.object.modifier_apply(modifier=blend.name)
    body.vertex_groups.remove(body.vertex_groups["anatomical-junctions"])
    # Sculpt lip separation after the union/relaxation that establishes the body.
    for vertex in body.data.vertices:
        x, y, z = vertex.co
        if y < -.025 and 1.58 < z < 1.64:
            front = min(1, (-y - .025) / .045)
            mouth_line = 1.612 + .001 * math.exp(-(x / .008) ** 2)
            upper_lip = .006 * math.exp(-(x / .030) ** 2 - ((z - mouth_line - .004) / .006) ** 2)
            lower_lip = .0065 * math.exp(-(x / .028) ** 2 - ((z - mouth_line + .006) / .007) ** 2)
            crease = .0045 * math.exp(-(x / .031) ** 4 - ((z - mouth_line) / .003) ** 2)
            vertex.co.y -= front * (upper_lip + lower_lip - crease)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    material = bpy.data.materials.new("anatomy-neutral-clay")
    material.diffuse_color = (.46, .43, .39, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (.46, .43, .39, 1)
    shader.inputs["Roughness"].default_value = .82
    body.data.materials.clear()
    body.data.materials.append(material)
    body["authoring_status"] = "Provisional sculpt; not retopologized, rigged or accepted"
    scene.render.fps = 30
    runtime, arm = deform_candidate(body)
    export_candidate(runtime, arm)
    print({"source": str(OUTPUT / "human-anatomy.blend"),
           "vertices": len(body.data.vertices), "faces": len(body.data.polygons)})


if __name__ == "__main__":
    build()
