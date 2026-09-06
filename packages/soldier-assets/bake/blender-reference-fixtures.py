"""Original Blender export diagnostics, not production soldier artwork.

Run from any directory with Blender --background --factory-startup
--python-exit-code 1 --python <this-file>. The test assets contain source, GLB and Blender-evaluated
surface landmarks. The browser oracle must compare these against GLTFLoader,
never against the crowd baker that this fixture is intended to challenge.
"""

import hashlib
import json
import math
from pathlib import Path
import struct

import bpy
import bmesh
from mathutils import Vector


OUTPUT = Path(__file__).resolve().parents[1] / "assets/test/blender-reference"
FPS = 24
FRAMES = (0, 6, 12, 18, 24)


def yup(v):
    return [round(v[0], 7), round(v[2], 7), round(-v[1], 7)]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = 24
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    bpy.context.preferences.filepaths.save_version = 0


def checker_material():
    image = bpy.data.images.new("authored-uv-checker", width=64, height=64)
    pixels = []
    for y in range(64):
        for x in range(64):
            value = 0.72 if (x // 8 + y // 8) % 2 else 0.22
            pixels.extend((value, value * 0.96, value * 0.88, 1))
    image.pixels = pixels
    image.pack()
    material = bpy.data.materials.new("neutral-checker")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = 0.8
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Closest"
    material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return material


def diagnostic_material():
    material = bpy.data.materials.new("neutral-diagnostic")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.45, 0.45, 0.45, 1)
    shader.inputs["Roughness"].default_value = 0.8
    return material


def rig_from_bones(definitions):
    ancestor = bpy.data.objects.new("transformed-ancestor", None)
    bpy.context.collection.objects.link(ancestor)
    ancestor.location = (0.37, -0.23, 0.11)
    ancestor.rotation_euler.z = 0.21
    arm = bpy.data.objects.new("deform-rig", bpy.data.armatures.new("deform-skeleton"))
    bpy.context.collection.objects.link(arm)
    arm.parent = ancestor
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in definitions:
        bone = arm.data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = arm.data.edit_bones[parent]
        bone.use_deform = not name.startswith("control-")
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def mesh_object(name, vertices, faces, weights, arm, material):
    data = bpy.data.meshes.new(name)
    # A nonidentity mesh object transform exercises its bind-space relationship
    # with the armature, independently of the shared transformed ancestor.
    offset = Vector((0.13, -0.07, 0.04))
    data.from_pydata([Vector(v) - offset for v in vertices], [], faces)
    data.update()
    uv = data.uv_layers.new(name="UVMap")
    # Project each original face before triangulation: both triangles inherit
    # the same planar coordinates, and one scale keeps checker cells square.
    for polygon in data.polygons:
        dominant = max(range(3), key=lambda axis: abs(polygon.normal[axis]))
        axes = [axis for axis in range(3) if axis != dominant]
        points = [data.vertices[index].co for index in polygon.vertices]
        minimum = [min(point[axis] for point in points) for axis in axes]
        span = max(max(point[axis] for point in points) - minimum[i]
                   for i, axis in enumerate(axes))
        for loop in polygon.loop_indices:
            point = data.vertices[data.loops[loop].vertex_index].co
            uv.data[loop].uv = tuple((point[axis] - minimum[i]) / span
                                    for i, axis in enumerate(axes))
    triangles = bmesh.new()
    triangles.from_mesh(data)
    bmesh.ops.triangulate(triangles, faces=list(triangles.faces))
    triangles.to_mesh(data)
    triangles.free()
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = arm
    obj.location = offset
    obj.data.materials.append(material)
    for index, influences in enumerate(weights):
        if not 1 <= len(influences) <= 4 or abs(sum(influences.values()) - 1) > 1e-6:
            raise ValueError(f"{name} vertex {index}: use one to four normalized deform weights")
        for bone, weight in influences.items():
            group = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
            group.add([index], weight, "REPLACE")
    modifier = obj.modifiers.new("deform", "ARMATURE")
    modifier.object = arm
    modifier.use_deform_preserve_volume = False
    return obj


def box(name, center, size, bone, arm, material):
    vertices = [tuple(center[i] + sign[i] * size[i] / 2 for i in range(3))
                for sign in ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                             (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1))]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh_object(name, vertices, faces, [{bone: 1}] * 8, arm, material)


def limb(name, points, radius, influences, arm, material):
    vertices = []
    for point in points:
        # The diagnostic limbs lie along Z or X; a local ring is orthogonal to
        # their long axis so their bend is visible in both principal views.
        axis = (Vector(points[-1]) - Vector(points[0])).normalized()
        across = axis.cross(Vector((0, 1, 0))).normalized()
        for a in range(8):
            v = Vector(point) + radius * (math.cos(a * math.tau / 8) * across
                                         + math.sin(a * math.tau / 8) * Vector((0, 1, 0)))
            vertices.append(v)
    faces = []
    for ring in range(len(points) - 1):
        for a in range(8):
            faces.append((ring * 8 + a, ring * 8 + (a + 1) % 8,
                          (ring + 1) * 8 + (a + 1) % 8, (ring + 1) * 8 + a))
    faces.extend([tuple(reversed(range(8))), tuple(range(len(vertices) - 8, len(vertices)))])
    return mesh_object(name, vertices, faces, [w for w in influences for _ in range(8)], arm, material)


def action(arm, name, rotations, translations=None):
    arm.animation_data_clear()
    for bone in arm.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
    for frame in FRAMES:
        phase = math.sin(math.pi * frame / 24)
        for bone_name, axis, amplitude in rotations:
            bone = arm.pose.bones[bone_name]
            bone.rotation_euler[axis] = amplitude * phase
            bone.keyframe_insert("rotation_euler", frame=frame)
        for bone_name, axis, amplitude in translations or []:
            bone = arm.pose.bones[bone_name]
            bone.location[axis] = amplitude * phase
            bone.keyframe_insert("location", frame=frame)
    result = arm.animation_data.action
    result.name = name
    result.use_fake_user = True
    # Explicit linear interpolation makes keyed sample times and intermediate
    # Blender poses agree with the export's baked linear tracks.
    for layer in result.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = "LINEAR"
    return result


def pose(arm, clip, frame):
    arm.animation_data_create()
    arm.animation_data.action = clip
    arm.animation_data.action_slot = clip.slots[0]
    for bone in arm.pose.bones:
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def evaluated_vertices(objects):
    graph = bpy.context.evaluated_depsgraph_get()
    result = {}
    for obj in objects:
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        result[obj.name] = [yup(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices]
        evaluated.to_mesh_clear()
    return result


def human():
    reset()
    arm = rig_from_bones([
        ("root", (0, 0, 0), (0, 0, 0.3), None),
        ("pelvis", (0, 0, 0.85), (0, 0, 1.05), "root"),
        ("spine", (0, 0, 1.05), (0, 0, 1.5), "pelvis"),
        ("upper-arm", (0.2, 0, 1.45), (0.55, 0, 1.45), "spine"),
        ("forearm", (0.55, 0, 1.45), (0.88, 0, 1.45), "upper-arm"),
        ("hand", (0.88, 0, 1.45), (1.0, 0, 1.45), "forearm"),
        ("thigh", (-0.13, 0, 0.88), (-0.13, 0, 0.48), "pelvis"),
        ("shin", (-0.13, 0, 0.48), (-0.13, 0, 0.08), "thigh"),
        ("control-elbow", (0.55, 0, 1.45), (0.88, 0, 1.45), "root"),
    ])
    constraint = arm.pose.bones["forearm"].constraints.new("COPY_ROTATION")
    constraint.target = arm
    constraint.subtarget = "control-elbow"
    constraint.owner_space = constraint.target_space = "LOCAL"
    material = diagnostic_material()
    objects = [
        box("torso", (0, 0, 1.27), (0.36, 0.22, 0.48), "spine", arm, material),
        box("head", (0, 0, 1.67), (0.22, 0.24, 0.28), "spine", arm, material),
        box("support-leg", (0.14, 0, 0.46), (0.17, 0.18, 0.82), "pelvis", arm, material),
        limb("elbow-surface", [(x, 0, 1.45) for x in (0.2, 0.47, 0.55, 0.63, 0.88)], 0.08,
             [{"upper-arm": 1}, {"upper-arm": .85, "forearm": .15},
              {"spine": .1, "upper-arm": .4, "forearm": .4, "hand": .1},
              {"upper-arm": .15, "forearm": .85}, {"forearm": 1}], arm, material),
        limb("knee-surface", [(-.13, 0, z) for z in (.88, .56, .48, .40, .08)], .09,
             [{"thigh": 1}, {"thigh": .9, "shin": .1}, {"thigh": .5, "shin": .5},
              {"thigh": .1, "shin": .9}, {"shin": 1}], arm, material),
        box("shield", (0.98, -.13, 1.38), (.44, .07, .50), "hand", arm, checker_material()),
        box("shield-grip", (.9, -.06, 1.45), (.055, .12, .055), "hand", arm, material),
        box("forward-marker", (0, -.45, .06), (.08, .65, .07), "root", arm, material),
        box("forward-tip", (.055, -.80, .06), (.19, .10, .10), "root", arm, material),
    ]
    marker_mask = objects[-1].data.attributes.new(name="_FACTION_MASK", type="FLOAT", domain="POINT")
    for datum, value in zip(marker_mask.data, (0, .25, .75, 1, 0, .25, .75, 1)):
        datum.value = value
    bend = action(arm, "bend", [("control-elbow", 0, -1.45), ("thigh", 0, -.4),
                                 ("shin", 0, 1.3), ("spine", 1, .12)])
    return arm, objects, [bend], []


def mounted():
    reset()
    arm = rig_from_bones([
        ("root", (0, 0, 0), (0, 0, .3), None),
        ("horse-body", (0, 0, .9), (0, -.4, .9), "root"),
        ("horse-front-leg", (0, -.48, .9), (0, -.48, .1), "horse-body"),
        ("horse-back-leg", (0, .48, .9), (0, .48, .1), "horse-body"),
        ("rider-pelvis", (0, 0, 1.2), (0, 0, 1.45), "horse-body"),
        ("rider-legs", (0, 0, 1.2), (0, 0, .7), "rider-pelvis"),
        ("rider-spine", (0, 0, 1.45), (0, 0, 1.9), "rider-pelvis"),
        ("rider-arm", (.16, 0, 1.8), (.55, 0, 1.8), "rider-spine"),
        ("rider-head", (0, 0, 1.9), (0, 0, 2.15), "rider-spine"),
    ])
    material = diagnostic_material()
    objects = [
        box("horse-body-surface", (0, 0, .95), (.45, 1.2, .42), "horse-body", arm, material),
        box("horse-neck-head", (0, -.72, 1.19), (.27, .42, .55), "horse-body", arm, material),
        box("horse-front-left", (-.16, -.48, .48), (.12, .15, .78), "horse-front-leg", arm, material),
        box("horse-front-right", (.16, -.48, .48), (.12, .15, .78), "horse-front-leg", arm, material),
        box("horse-back-left", (-.16, .48, .48), (.12, .15, .78), "horse-back-leg", arm, material),
        box("horse-back-right", (.16, .48, .48), (.12, .15, .78), "horse-back-leg", arm, material),
        box("rider-seat", (0, 0, 1.3), (.32, .29, .24), "rider-pelvis", arm, material),
        box("rider-left-leg", (-.3, 0, 1.0), (.12, .18, .6), "rider-legs", arm, material),
        box("rider-right-leg", (.3, 0, 1.0), (.12, .18, .6), "rider-legs", arm, material),
        box("rider-torso", (0, 0, 1.66), (.30, .20, .43), "rider-spine", arm, material),
        box("rider-head-surface", (0, 0, 2.01), (.2, .23, .26), "rider-head", arm, material),
        box("rider-action-arm", (.36, 0, 1.8), (.42, .11, .11), "rider-arm", arm, material),
    ]
    gait = action(arm, "gait", [("horse-front-leg", 0, .5), ("horse-back-leg", 0, -.5),
                                ("rider-pelvis", 0, .1)], [("horse-body", 2, .06)])
    upper = action(arm, "rider-action", [("rider-spine", 1, .5), ("rider-arm", 0, -1.1),
                                         ("rider-head", 1, -.2)])
    return arm, objects, [gait, upper], ["rider-spine", "rider-arm", "rider-head"]


def glb_accessors(path):
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + json_length])
    binary = data[28 + json_length:]

    def accessor(index):
        item = document["accessors"][index]
        view = document["bufferViews"][item["bufferView"]]
        count = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[item["type"]]
        scalar = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[item["componentType"]]
        size = struct.calcsize("<" + scalar * count)
        start = view.get("byteOffset", 0) + item.get("byteOffset", 0)
        return [struct.unpack_from("<" + scalar * count, binary, start + i * view.get("byteStride", size))
                for i in range(item["count"])]
    return document, accessor


def export_fixture(name, build):
    arm, objects, clips, mask = build()
    samples = []
    for clip in clips:
        for frame in (0, 6, 12, 24):
            pose(arm, clip, frame)
            samples.append({"name": f"{clip.name}-{frame}", "clip": clip.name,
                            "seconds": frame / FPS, "positions": evaluated_vertices(objects)})
    if mask:
        for frame in (6, 12):
            pose(arm, clips[1], frame)
            upper = {name: arm.pose.bones[name].matrix_basis.copy() for name in mask}
            pose(arm, clips[0], frame)
            for bone_name, matrix in upper.items():
                arm.pose.bones[bone_name].matrix_basis = matrix
            bpy.context.view_layer.update()
            samples.append({"name": f"composed-{frame}", "clip": "composed", "seconds": frame / FPS,
                            "positions": evaluated_vertices(objects)})
    pose(arm, clips[0], 0)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / f"{name}.blend"), compress=True)
    glb = OUTPUT / f"{name}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb), export_format="GLB", export_yup=True, export_skins=True,
        export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
        export_frame_step=1, export_def_bones=True, export_all_influences=False,
        export_anim_slide_to_zero=True, export_reset_pose_bones=True,
        export_anim_single_armature=True, export_bake_animation=True,
        export_hierarchy_flatten_bones=False, export_hierarchy_flatten_objs=False,
        export_apply=False, export_texcoords=True, export_normals=True, export_tangents=True,
        export_attributes=True,
    )
    document, accessor = glb_accessors(glb)
    assert len(document["skins"]) == 1, "Export one composite deform skeleton per fixture"
    joint_names = [document["nodes"][i]["name"] for i in document["skins"][0]["joints"]]
    assert not any(n.startswith("control-") for n in joint_names), "Control bones leaked into deform skin"
    assert {a["name"] for a in document["animations"]} == {c.name for c in clips}
    mappings = []
    maximum_weights = 0
    for node in document["nodes"]:
        if "mesh" not in node:
            continue
        obj = next(o for o in objects if o.name == node["name"])
        # Blender's skin exporter bakes mesh object/world transforms into its
        # POSITION accessor and inverse binds; match that exported bind space.
        source = [Vector(yup(obj.matrix_world @ v.co)) for v in obj.data.vertices]
        for primitive_index, primitive in enumerate(document["meshes"][node["mesh"]]["primitives"]):
            attrs = primitive["attributes"]
            assert "JOINTS_1" not in attrs, "Export exceeds four influences; reduce source weights"
            weights = accessor(attrs["WEIGHTS_0"])
            assert all(abs(sum(w) - 1) < 1e-5 for w in weights), "Exported weights are not normalized"
            maximum_weights = max(maximum_weights, max(sum(w > 1e-7 for w in row) for row in weights))
            indices = []
            for vertex in accessor(attrs["POSITION"]):
                nearest = min(range(len(source)), key=lambda i: (source[i] - Vector(vertex)).length)
                assert (source[nearest] - Vector(vertex)).length < 1e-5, "Export changed rest geometry"
                indices.append(nearest)
            mappings.append({"node": node["name"], "primitive": primitive_index,
                             "sourceVertexByGltfVertex": indices})
    if name == "human":
        assert maximum_weights == 4, "The human fixture must exercise four nonzero weights"
    metadata = {
        "fixture": name, "blender": bpy.app.version_string, "fps": FPS,
        "glbSha256": hashlib.sha256(glb.read_bytes()).hexdigest(),
        "space": "glTF Y-up world metres; Blender (x,y,z) -> (x,z,-y)",
        "facing": "Blender -Y / glTF +Z before transformed-ancestor rotation",
        "toleranceMetres": 0.00003, "riderUpperBodyMask": mask,
        "joints": joint_names, "maximumNonzeroWeights": maximum_weights,
        "meshes": mappings, "samples": samples,
    }
    (OUTPUT / f"{name}.landmarks.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"FIXTURE {name}: {len(joint_names)} deform joints, {len(mappings)} meshes, "
          f"{len(samples)} samples, maximum {maximum_weights} influences")


OUTPUT.mkdir(parents=True, exist_ok=True)
failures = []
for fixture_name, builder in (("human", human), ("mounted", mounted)):
    try:
        export_fixture(fixture_name, builder)
    except Exception as error:
        failures.append(f"{fixture_name}: {error}")
if failures:
    raise RuntimeError("; ".join(failures))
