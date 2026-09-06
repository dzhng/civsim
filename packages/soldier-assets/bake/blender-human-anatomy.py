"""Locally authored editable human sculpt candidate; no downloaded geometry.

Execute in Blender with this file's __file__ defined. The dedicated scene keeps
unrelated open scenes untouched. This is a proportion study, not accepted game
topology: remeshing joins anatomical volumes before deformation retopology.
"""

import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


OUTPUT = Path(__file__).resolve().parents[1] / "assets/source/human-anatomy"
SCENE = "HumanAnatomyCandidate"


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
    reduction = body.modifiers.new("Curvature-preserving candidate reduction", "DECIMATE")
    # Provisional inspection density, not a measured runtime limit.
    reduction.ratio = min(1, 9000 / sum(len(face.vertices) - 2 for face in body.data.polygons))
    reduction.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=reduction.name)
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
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 0, 60
    for frame in (0, 15, 30, 45, 60):
        amount = math.sin(math.pi * frame / 60)
        for bone in arm.pose.bones:
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = (0, 0, 0)
            bone.location = (0, 0, 0)
        arm.pose.bones["pelvis"].location.y = -.175 * amount
        arm.pose.bones["spine"].rotation_euler.x = .20 * amount
        for side in ("L", "R"):
            arm.pose.bones["thigh." + side].rotation_euler.x = -.60 * amount
            arm.pose.bones["shin." + side].rotation_euler.x = 1.30 * amount
            arm.pose.bones["foot." + side].rotation_euler.x = -.70 * amount
            arm.pose.bones["forearm." + side].rotation_euler.x = -1.45 * amount
            # Bisector bones retain joint cross-section volume under linear skinning.
            arm.pose.bones["elbow-volume." + side].rotation_euler.x = -.725 * amount
            arm.pose.bones["knee-volume." + side].rotation_euler.x = .65 * amount
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    arm.animation_data.action.name = "bend"
    for layer in arm.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = "LINEAR"
    scene.frame_set(0)
    body["authoring_status"] = "Provisional reduced mesh and heat weights; deep-bend review required"
    return body, arm


def export_candidate(body, arm):
    bpy.context.scene.frame_set(0)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT / "human-anatomy.glb"), export_format="GLB",
        use_selection=True, use_active_scene=True, export_yup=True, export_skins=True,
        export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
        export_frame_step=1, export_def_bones=True, export_all_influences=False,
        export_anim_slide_to_zero=True, export_reset_pose_bones=True,
        export_anim_single_armature=False, export_bake_animation=True,
        export_hierarchy_flatten_bones=False, export_hierarchy_flatten_objs=False,
        export_apply=False, export_texcoords=True, export_normals=True, export_tangents=True,
    )
    bpy.data.libraries.write(str(OUTPUT / "human-anatomy.blend"), {bpy.context.scene},
                             path_remap="RELATIVE", fake_user=True, compress=True)


def build():
    if SCENE in bpy.data.scenes:
        raise RuntimeError("Candidate scene already exists; inspect it before rebuilding")
    if "bend" in bpy.data.actions:
        raise RuntimeError("Unrelated bend action already exists; build in a fresh Blender session")
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
            lips = .009 * math.exp(-(x / .028) ** 2 - ((z - 1.612) / .009) ** 2)
            mouth = .007 * math.exp(-(x / .025) ** 2 - ((z - 1.612) / .002) ** 2)
            cheek = .009 * math.exp(-((abs(x) - .043) / .020) ** 2
                                    - ((z - 1.652) / .016) ** 2)
            vertex.co.y -= front * (nose + alar + brow + lips + cheek - sockets - mouth)
    parts.append(head)
    for side, sign in (("L", 1), ("R", -1)):
        def point(x, y, z):
            return (sign * x, y, z)
        parts.append(loft("leg." + side, [
            (point(.094, .016, 1.035), .074, .085),
            (point(.100, .015, .96), .085, .100),
            (point(.104, .010, .88), .086, .105),
            (point(.113, -.002, .77), .080, .094),
            (point(.118, -.013, .64), .062, .070),
            (point(.12, -.030, .54), .055, .060),
            (point(.12, -.025, .50), .053, .055),
            (point(.121, .001, .42), .059, .067),
            (point(.122, .009, .34), .058, .068),
            (point(.123, .006, .25), .044, .050),
            (point(.124, .004, .13), .030, .038),
            (point(.124, .004, .075), .034, .040),
        ]))
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
            (point(.145, .002, 1.422), .077, .079),
            (point(.202, .001, 1.405), .073, .075),
            (point(.266, .000, 1.341), .069, .074),
            (point(.322, -.005, 1.254), .057, .061),
            (point(.360, -.010, 1.197), .047, .047),
            (point(.380, -.013, 1.170), .049, .049),
            (point(.413, -.015, 1.125), .049, .053),
            (point(.465, -.018, 1.049), .039, .042),
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
        for finger, (offset, length) in enumerate(((-.028, .068), (-.009, .081),
                                                  (.011, .076), (.030, .058))):
            base = wrist + arm_axis * .084 + across * offset
            parts.append(loft(f"finger-{finger}.{side}", [
                (base, .0085, .010),
                (base + arm_axis * (length * .45) + Vector((0, -.002, 0)), .008, .009),
                (base + arm_axis * (length * .82) + Vector((0, -.008, 0)), .0065, .007),
                (base + arm_axis * length + Vector((0, -.013, 0)), .004, .005),
            ], segments=12, across=across))
        thumb_base = wrist + arm_axis * .023 - across * .026
        thumb_axis = (arm_axis * .5 - across * .86).normalized()
        parts.append(loft("thumb." + side, [
            (thumb_base, .017, .017),
            (thumb_base + thumb_axis * .025, .013, .013),
            (thumb_base + thumb_axis * .051 + arm_axis * .01, .009, .010),
            (thumb_base + thumb_axis * .064 + arm_axis * .018, .004, .005),
        ], segments=12, across=arm_axis))
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
    smooth = body.modifiers.new("Surface relaxation", "SMOOTH")
    smooth.factor, smooth.iterations = .65, 12
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    # Blend muscle roots locally; global smoothing would erase face and fingers.
    junctions = body.vertex_groups.new(name="anatomical-junctions")
    for vertex in body.data.vertices:
        x, y, z = vertex.co
        shoulder = ((abs(x) - .16) / .14) ** 2 + ((z - 1.43) / .12) ** 2 + (y / .15) ** 2
        hip = ((abs(x) - .11) / .14) ** 2 + ((z - .96) / .16) ** 2 + (y / .17) ** 2
        weight = max(0, 1 - min(shoulder, hip)) ** 2
        if weight:
            junctions.add([vertex.index], weight, "REPLACE")
    blend = body.modifiers.new("Sculpt anatomical junctions", "SMOOTH")
    blend.vertex_group, blend.factor, blend.iterations = junctions.name, .8, 100
    bpy.ops.object.modifier_apply(modifier=blend.name)
    body.vertex_groups.remove(body.vertex_groups["anatomical-junctions"])
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
