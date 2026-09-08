"""Original mounted family on the saved fitted human; offline authoring only."""
import importlib.util
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = Path(__file__).resolve().parent
STRIDES = json.loads((HERE / "mounted-strides.json").read_text())
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("anatomy", HERE / "blender-human-anatomy.py")
anatomy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(anatomy)
motion_spec = importlib.util.spec_from_file_location("motion", HERE / "blender-heavy-motion.py")
motion = importlib.util.module_from_spec(motion_spec)
motion_spec.loader.exec_module(motion)
equipment_spec = importlib.util.spec_from_file_location("equipment", HERE / "blender-foot-variant.py")
equipment = importlib.util.module_from_spec(equipment_spec)
equipment_spec.loader.exec_module(equipment)


def material(name, color, roughness=.8):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    return result


def surface(name, sections, material, bone, across=(1, 0, 0), depth=(0, 1, 0), segments=20):
    obj = anatomy.loft(name, sections, segments, across, depth)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1, "REPLACE")
    # Simple longitudinal UVs keep this original untextured surface ready for
    # the existing exporter, without sampling the donor's human equipment atlas.
    uv = obj.data.uv_layers.new(name="UVMap")
    for loop in obj.data.loops:
        ring, around = divmod(loop.vertex_index, segments)
        uv.data[loop.index].uv = (around/segments, ring/(len(sections)-1))
    return obj


def cord(name, points, radius, material, bone):
    """Small original leather/mane paths with cross-sections normal to the path."""
    points = [Vector(point) for point in points]
    vertices, faces = [], []
    sides = 8
    for i, center in enumerate(points):
        tangent = (points[min(i+1, len(points)-1)]-points[max(i-1, 0)]).normalized()
        axis = Vector((1, 0, 0)) if abs(tangent.x) < .9 else Vector((0, 1, 0))
        u = tangent.cross(axis).normalized()
        v = tangent.cross(u).normalized()
        for j in range(sides):
            angle = math.tau*j/sides
            vertices.append(center+radius*(u*math.cos(angle)+v*math.sin(angle)))
    for i in range(len(points)-1):
        for j in range(sides):
            a, b = i*sides+j, i*sides+(j+1)%sides
            faces.append((a, b, b+sides, a+sides))
    faces.extend([tuple(reversed(range(sides))), tuple(range(len(vertices)-sides, len(vertices)))])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj.vertex_groups.new(name=bone).add(list(range(len(vertices))), 1, "REPLACE")
    return obj


def horse_source(arm):
    """Rounded longitudinal forms, with four separately supported limb chains."""
    coat = material("mount-bay-coat", (.22, .085, .035))
    dark = material("mount-mane-tail", (.035, .024, .018))
    hoof = material("mount-hoof", (.085, .073, .060))
    leather = material("mount-tack-leather", (.105, .045, .020))
    parts, bones = [], []
    bones.extend([
        ("mount-root", (0, 0, 0), (0, 0, .2), None),
        ("mount-body", (0, .15, 1.18), (0, -.55, 1.30), "mount-root"),
        ("mount-neck", (0, -.55, 1.30), (0, -.94, 1.87), "mount-body"),
        ("mount-head", (0, -.94, 1.87), (0, -1.36, 1.55), "mount-neck"),
        ("mount-tail", (0, .88, 1.31), (0, 1.12, .73), "mount-body"),
    ])
    parts.append(surface("Horse barrel and croup", [
        ((0, .93, 1.18), .11, .18), ((0, .76, 1.21), .29, .31),
        ((0, .45, 1.20), .35, .36), ((0, .05, 1.17), .38, .36),
        ((0, -.30, 1.20), .34, .36), ((0, -.56, 1.23), .27, .32),
        ((0, -.69, 1.25), .16, .22),
    ], coat, "mount-body", depth=(0, 0, 1), segments=32))
    parts.append(surface("Horse neck", [
        ((0, -.48, 1.30), .24, .27), ((0, -.63, 1.49), .21, .26),
        ((0, -.75, 1.69), .16, .21), ((0, -.90, 1.84), .12, .15),
        ((0, -.98, 1.90), .10, .11),
    ], coat, "mount-neck"))
    parts.append(surface("Horse head and muzzle", [
        ((0, -.91, 1.98), .055, .075), ((0, -1.00, 1.90), .14, .14),
        ((0, -1.12, 1.76), .12, .14), ((0, -1.29, 1.57), .095, .10),
        ((0, -1.39, 1.48), .12, .075), ((0, -1.44, 1.46), .09, .045),
    ], coat, "mount-head", depth=(0, .70710678, -.70710678)))
    for side, x in (("L", .26), ("R", -.26)):
        for end, y in (("fore", -.48), ("hind", .62)):
            # Hind stifle points forward and hock backward; the fore carpus is
            # closer to straight. Bone axes follow these authored rest joints.
            top = Vector((x, y, 1.22))
            knee = Vector((x, y+(-.22 if end == "hind" else .055), .90))
            hock = Vector((x, y+(.14 if end == "hind" else .025), .50))
            ankle = Vector((x, y+(.05 if end == "hind" else .035), .20))
            toe = Vector((x, y-.06, .085))
            prefix = f"mount-{end}.{side}"
            bones.extend([(prefix+"-upper", top, knee, "mount-body"),
                          (prefix+"-lower", knee, hock, prefix+"-upper"),
                          (prefix+"-cannon", hock, ankle, prefix+"-lower"),
                          (prefix+"-foot", ankle, toe, prefix+"-cannon")])
            for label, a, b, radius in (("upper", top, knee, .18 if end == "hind" else .145),
                                        ("lower", knee, hock, .085),
                                        ("cannon", hock, ankle, .044)):
                part = surface(prefix+" "+label, [
                    (a, radius, radius), (a.lerp(b, .35), radius*.95, radius*.9),
                    (a.lerp(b, .8), radius*.7, radius*.7), (b, .045, .05),
                ], coat, prefix+"-"+label)
                if label == "upper":
                    shoulder = part.vertex_groups.new(name="mount-body")
                    for ring, weight in ((0, .85), (1, .35)):
                        ids = list(range(ring*20, (ring+1)*20))
                        shoulder.add(ids, weight, "REPLACE")
                        part.vertex_groups[prefix+"-upper"].add(ids, 1-weight, "REPLACE")
                parts.append(part)
            parts.append(surface(prefix+" hoof", [
                ((x, toe.y, .005), .073, .10), ((x, toe.y, .085), .069, .095),
                ((x, ankle.y, .20), .038, .045), (ankle, .034, .038),
            ], hoof, prefix+"-foot"))
        parts.append(surface("Horse ear."+side, [
            ((x*.31, -.96, 1.94), .040, .045),
            ((x*.38, -.95, 2.06), .032, .027),
            ((x*.42, -.97, 2.15), .004, .006),
        ], coat, "mount-head", segments=12))
    parts.append(surface("Horse tail", [
        ((0, .86, 1.35), .06, .06), ((0, 1.02, 1.16), .08, .065),
        ((0, 1.12, .85), .085, .06), ((0, 1.13, .49), .035, .03),
    ], dark, "mount-tail"))
    parts.append(surface("Horse mane", [
        ((0, -.45, 1.50), .035, .055), ((0, -.63, 1.75), .035, .07),
        ((0, -.81, 1.92), .03, .06), ((0, -.94, 2.00), .02, .025),
    ], dark, "mount-neck", segments=12))
    parts.append(surface("Saddle pad and seat", [
        ((0, .33, 1.45), .30, .055), ((0, .18, 1.52), .28, .045),
        ((0, -.08, 1.52), .27, .045), ((0, -.23, 1.47), .29, .06),
    ], leather, "mount-body", depth=(0, 0, 1), segments=24))
    for side, sign in (("L", 1), ("R", -1)):
        parts.append(surface("Horse eye."+side, [
            ((sign*.119, -1.042, 1.844), .017, .014),
            ((sign*.132, -1.042, 1.844), .015, .012),
            ((sign*.139, -1.042, 1.844), .004, .005),
        ], dark, "mount-head", across=(0, 1, 0), depth=(0, 0, 1), segments=12))
        parts.append(cord("Bridle cheek."+side, [
            (sign*.105, -.96, 1.98), (sign*.15, -1.07, 1.80),
            (sign*.13, -1.34, 1.54),
        ], .012, leather, "mount-head"))
    parts.append(cord("Bridle noseband", [
        (.125*math.cos(t), -1.34-.055*math.sin(t), 1.535+.065*math.sin(t))
        for t in [math.tau*i/24 for i in range(25)]
    ], .012, leather, "mount-head"))
    parts.append(cord("Saddle girth", [
        (.385*math.cos(t), -.12, 1.19+.36*math.sin(t))
        for t in [math.tau*i/32 for i in range(33)]
    ], .027, leather, "mount-body"))
    palm = arm.data.bones["hand.L"].head_local.lerp(arm.data.bones["hand.L"].tail_local, .45)
    for sign in (-1, 1):
        start = Vector((sign*.13, -1.34, 1.54))
        points = [start.lerp(palm, i/12)-Vector((0, 0, .09*math.sin(math.pi*i/12)))
                  for i in range(13)]
        rein = cord(f"Leather rein {sign}", points, .007, leather, "mount-head")
        hand = rein.vertex_groups.new(name="hand.L")
        for ring in range(13):
            blend = ring/12
            ids = list(range(ring*8, (ring+1)*8))
            rein.vertex_groups["mount-head"].add(ids, 1-blend, "REPLACE")
            hand.add(ids, blend, "REPLACE")
        parts.append(rein)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in bones:
        bone = arm.data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = arm.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in parts:
        obj.parent = arm
        modifier = obj.modifiers.new("Mounted skin", "ARMATURE")
        modifier.object = arm
    return parts


def seated_pose(arm, ready):
    for bone in arm.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = ready.get(bone.name, (0, 0, 0))
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    for side, sign in (("L", 1), ("R", -1)):
        motion.aim(arm, "thigh."+side, (sign*.27, -.16, -.37))
        motion.aim(arm, "shin."+side, (sign*.025, .075, -.405))
        foot = arm.data.bones["foot."+side].matrix_local.to_quaternion()
        motion.orient(arm, "foot."+side, Matrix.Rotation(.12, 3, "X").to_quaternion() @ foot)
        arm.pose.bones["knee-volume."+side].rotation_euler = tuple(
            value*.5 for value in arm.pose.bones["shin."+side].rotation_euler)
    bpy.context.view_layer.update()


def weapon_source(parts, arm, weapon):
    if weapon == "sword":
        return
    wood = material("mounted-weapon-wood", (.24, .12, .045))
    bronze = material("mounted-weapon-bronze", (.42, .26, .09), .4)
    grip = next(obj for obj in parts if obj.name == "Sword grip")
    anchor = sum((v.co for v in grip.data.vertices), Vector())/len(grip.data.vertices)
    blade = next(obj for obj in parts if obj.name == "Sword blade")
    center = sum((v.co for v in blade.data.vertices), Vector())/len(blade.data.vertices)
    direction = (center-anchor).normalized()
    for obj in parts[:]:
        if weapon == "lance" and obj.name.startswith("Sword"):
            parts.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
    if weapon == "lance":
        arm["lance_axis"] = list(direction)
        shaft = cord("Mounted lance shaft", [anchor-direction*.55, anchor+direction*2.1],
                     .018, wood, "hand.R")
        tip = cord("Mounted lance bronze head", [anchor+direction*2.08, anchor+direction*2.34],
                   .027, bronze, "hand.R")
        parts.extend([shaft, tip])
    else:
        hand = arm.data.bones["hand.L"]
        anchor = hand.head_local.lerp(hand.tail_local, .45)
        # The bow is centered on the saved palm, not independently moved in a
        # shot. Its long axis is in the hand's bind plane; upper action keys own
        # the complete held assembly.
        axis = hand.matrix_local.to_3x3().col[2]
        arm["bow_axis"] = list(axis)
        normal = hand.matrix_local.to_3x3().col[0]
        points = [anchor+axis*(.62*t)+normal*(.16*t*t) for t in [i/8 for i in range(-8, 9)]]
        parts.append(cord("Mounted bow stave", points, .014, wood, "hand.L"))
        middle = anchor-normal*.13
        string = cord("Mounted bow string", [points[0], middle, points[-1]],
                      .002, bronze, "hand.L")
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="EDIT")
        bone = arm.data.edit_bones.new("bow-string")
        bone.head, bone.tail = middle, middle+normal*.1
        bone.parent = arm.data.edit_bones["hand.L"]
        bpy.ops.object.mode_set(mode="OBJECT")
        string.vertex_groups["hand.L"].remove(list(range(8, 16)))
        string.vertex_groups.new(name="bow-string").add(list(range(8, 16)), 1, "REPLACE")
        arm["bow_string_straight"] = list((points[0]+points[-1])*.5)
        parts.append(string)
    for obj in parts:
        if obj.parent is None:
            obj.parent = arm
            obj.modifiers.new("Mounted skin", "ARMATURE").object = arm


def mount_leg(arm, prefix, ankle, rotation=None):
    rotation = rotation or Quaternion()
    upper, lower = (arm.pose.bones[prefix+suffix] for suffix in ("-upper", "-lower"))
    origin = upper.head.copy()
    cannon = arm.data.bones[prefix+"-cannon"]
    hock = ankle+rotation @ (cannon.head_local-cannon.tail_local)
    distance = (hock-origin).length
    if distance >= upper.bone.length+lower.bone.length:
        raise ValueError(f"Unreachable authored hoof {prefix}: {distance}")
    knee = motion.limb_joint(origin, hock, upper.bone.length, lower.bone.length,
                             rotation @ Vector((0, -1 if "hind" in prefix else 1, 0)))
    motion.aim(arm, upper.name, knee-origin)
    motion.aim(arm, lower.name, hock-knee)
    motion.aim(arm, cannon.name, ankle-hock)
    foot = arm.data.bones[prefix+"-foot"]
    motion.orient(arm, foot.name, rotation @ foot.matrix_local.to_quaternion())


def mount_gait(arm, phase, running):
    body = arm.pose.bones["mount-body"]
    # Lower the shoulder onto flexed legs; authored hoof targets, not vertical
    # body bob alone, supply support. No target solver survives into runtime.
    height = (-.23+.025*math.sin(math.tau*phase) if running
              else -.18+.008*math.cos(2*math.tau*phase))
    body.location = body.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, height))
    bpy.context.view_layer.update()
    offsets = ({"hind.R": 0, "hind.L": .22, "fore.R": .22, "fore.L": .44}
               if running else {"hind.L": 0, "fore.L": .25, "hind.R": .5, "fore.R": .75})
    duty = .25 if running else .64
    stride = STRIDES["run" if running else "walk"]
    for limb, offset in offsets.items():
        step = (phase-offset) % 1
        foot = arm.data.bones["mount-"+limb+"-foot"]
        ankle = foot.head_local.copy()
        # Small authored sole clearance accommodates the fixed-rate baked
        # local-angle interpolation; it is not an exact hoof-plant claim.
        ankle.z += .008
        half = stride*duty/2
        if step < duty:
            ankle.y += -half+stride*step
        else:
            swing = (step-duty)/(1-duty)
            ankle.y += half*math.cos(math.pi*swing)
            ankle.z += (.32 if running else .15)*math.sin(math.pi*swing)
        mount_leg(arm, "mount-"+limb, ankle)
    arm.pose.bones["mount-neck"].rotation_euler.x = .035*math.sin(math.tau*phase)
    arm.pose.bones["mount-tail"].rotation_euler.z = .08*math.sin(math.tau*phase)


def mounted_upper(arm, weapon):
    if weapon != "bow":
        motion.carry_arm(arm, "L", 0, False)
    motion.aim(arm, "upper-arm.R", (-.25, -.15, -1), -math.pi/4)
    motion.aim(arm, "forearm.R", (-.10, -1, .20), -math.pi/2)


def lance_direction(arm, direction, amount=1):
    """Orient the connected forearm using the actual saved shaft axis."""
    bpy.context.view_layer.update()
    hand = arm.pose.bones["hand.R"]
    transform = hand.matrix @ hand.bone.matrix_local.inverted()
    axis = (transform.to_3x3() @ Vector(arm["lance_axis"])).normalized()
    correction = Quaternion().slerp(axis.rotation_difference(Vector(direction).normalized()), amount)
    forearm = arm.pose.bones["forearm.R"]
    motion.orient(arm, forearm.name, correction @ forearm.matrix.to_quaternion())


def bow_release(arm, phase):
    # One shot: drawing to the cheek, release at .6, then recovery. These are
    # source poses only; the observed engine release owns the gameplay event.
    draw = min(1, phase/.5)
    draw = draw*draw*(3-2*draw)
    recovery = max(0, (phase-.6)/.4)
    motion.aim(arm, "upper-arm.L", (.15, -.95, -.1))
    motion.aim(arm, "forearm.L", (-.05, -1, .1))
    chest = arm.pose.bones["chest"].head
    target = chest+Vector((-.03-.17*draw, -.36+.17*draw, .11-.08*recovery))
    upper, lower = arm.pose.bones["upper-arm.R"], arm.pose.bones["forearm.R"]
    elbow = motion.limb_joint(upper.head, target, upper.bone.length, lower.bone.length,
                              Vector((-1, 0, 0)))
    motion.aim(arm, upper.name, elbow-upper.head)
    motion.aim(arm, lower.name, target-elbow)
    string = arm.pose.bones["bow-string"]
    base = string.parent.matrix @ string.parent.bone.matrix_local.inverted() @ string.bone.matrix_local
    if phase < .6:
        hand = arm.pose.bones["hand.R"]
        target = hand.head.lerp(hand.tail, .45)
    else:
        hand = arm.pose.bones["hand.L"]
        target = hand.matrix @ hand.bone.matrix_local.inverted() @ Vector(arm["bow_string_straight"])
    string.location = base.to_3x3().inverted() @ (target-base.translation)


def author_actions(arm, scene, ready, weapon, parts):
    hooves = {part.name.removesuffix(" hoof"): part for part in parts if part.name.endswith(" hoof")}
    actions = [("idle", 60), ("ready", 60), ("walk", 24), ("run", 24),
               ("melee", 24), ("hit", 18), ("death", 60)]
    if weapon == "bow":
        actions.append(("release", 30))
    for clip, frames in actions:
        arm.animation_data.action = None
        for frame in range(frames+1):
            phase = min(frame/frames, .9) if clip == "death" else frame/frames
            seated_pose(arm, ready)
            mounted_upper(arm, weapon)
            if clip in ("walk", "run"):
                mount_gait(arm, phase, clip == "run")
                arm.pose.bones["spine"].rotation_euler.x += .025*math.sin(math.tau*phase)
            else:
                arm.pose.bones["chest"].rotation_euler.x += .008*math.sin(math.tau*phase)
                arm.pose.bones["mount-neck"].rotation_euler.x = .012*math.sin(math.tau*phase)
            if clip == "release":
                bow_release(arm, phase)
            elif clip == "melee":
                effort = math.sin(math.pi*phase)**2
                arm.pose.bones["chest"].rotation_euler.y += .18*effort
                if weapon == "lance":
                    motion.aim(arm, "upper-arm.R", (-.2, -.15-.55*effort, -1))
                    motion.aim(arm, "forearm.R", (-.1, -1, .2-.35*effort), -math.pi/2)
                else:
                    motion.aim(arm, "upper-arm.R", (-.3-.5*effort, -.3, -.8+.65*effort))
                    motion.aim(arm, "forearm.R", (-.2, -1, .6-1.1*effort), -math.pi/2)
            elif clip == "hit":
                recoil = math.sin(math.pi*phase)**2
                arm.pose.bones["spine"].rotation_euler.x -= .18*recoil
                arm.pose.bones["mount-neck"].rotation_euler.x -= .1*recoil
                body = arm.pose.bones["mount-body"]
                body.location = body.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, -.045*recoil))
                bpy.context.view_layer.update()
                for limb in ("fore.L", "fore.R", "hind.L", "hind.R"):
                    mount_leg(arm, "mount-"+limb, arm.data.bones["mount-"+limb+"-foot"].head_local.copy())
            elif clip == "death":
                yield_phase = min(1, phase/.75)
                fall = yield_phase*yield_phase*(3-2*yield_phase)
                settle = math.sin(math.pi*max(0, (phase-.75)/.15))*.025
                body = arm.pose.bones["mount-body"]
                rotation = Matrix.Rotation(1.48*fall, 3, "Y").to_quaternion()
                motion.orient(arm, body.name, rotation @ body.bone.matrix_local.to_quaternion())
                body.location = body.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, -.76*fall+settle))
                arm.pose.bones["spine"].rotation_euler.x += .16*fall
                arm.pose.bones["chest"].rotation_euler.x += .25*fall
                arm.pose.bones["chest"].rotation_euler.z -= .12*fall
                arm.pose.bones["head"].rotation_euler.z += .16*fall
                bpy.context.view_layer.update()
                for side, sign in (("L", 1), ("R", -1)):
                    motion.aim(arm, "thigh."+side,
                               rotation @ Vector((sign*(.27-.10*fall), -.16, -.37)))
                    motion.aim(arm, "shin."+side, rotation @ Vector((sign*.025, .075, -.405)))
                    motion.orient(arm, "foot."+side,
                                  rotation @ arm.data.bones["foot."+side].matrix_local.to_quaternion())
                upper, lower = arm.pose.bones["upper-arm.L"], arm.pose.bones["forearm.L"]
                target = lower.tail.lerp(upper.head+Vector((-.42, -.12, .035)), fall)
                hint = (upper.tail-upper.head).normalized().lerp(Vector((0, -1, 1)).normalized(), fall)
                elbow = motion.limb_joint(upper.head, target, upper.bone.length, lower.bone.length,
                                          hint)
                motion.aim(arm, upper.name, elbow-upper.head)
                normal = Vector((1, 0, 0)).lerp(Vector((0, 0, -1)), fall)
                motion.shield_forearm(arm, target-elbow, normal)
                if weapon == "bow":
                    hand = arm.pose.bones["hand.L"]
                    transform = hand.matrix @ hand.bone.matrix_local.inverted()
                    axis = (transform.to_3x3() @ Vector(arm["bow_axis"])).normalized()
                    horizontal = Vector((axis.x, axis.y, 0)).normalized()
                    correction = Quaternion().slerp(axis.rotation_difference(horizontal), fall)
                    motion.orient(arm, hand.name, correction @ hand.matrix.to_quaternion())
                for limb in ("fore.L", "fore.R", "hind.L", "hind.R"):
                    prefix = "mount-"+limb
                    foot = arm.data.bones[prefix+"-foot"]
                    ankle = foot.head_local.copy()
                    ankle.x = ankle.x*(1-fall)+(-.62+(.07 if limb.endswith("R") else -.07))*fall
                    # Roll onto the side while the hoof envelope stays above
                    # the floor. Upper-side legs can then rest over the lower
                    # pair; no world-root translation or runtime IK is added.
                    ankle.z = -min((rotation @ (v.co-foot.head_local)).z
                                   for v in hooves[prefix].data.vertices)+.005
                    ankle.z += (.11 if limb.endswith("R") else .01)*fall
                    mount_leg(arm, prefix, ankle, rotation)
                if weapon == "lance":
                    lance_direction(arm, (0, -1, 0), fall)
            if weapon == "lance" and clip != "death":
                lance_direction(arm, (0, -.1, 1) if clip == "idle" else (0, -1, .12))
            for side in ("L", "R"):
                helper = arm.pose.bones["elbow-volume."+side]
                parent = helper.parent.matrix @ helper.parent.bone.matrix_local.inverted() @ helper.bone.matrix_local
                motion.orient(arm, helper.name, parent.to_quaternion().slerp(
                    arm.pose.bones["forearm."+side].matrix.to_quaternion(), .5))
            for bone in arm.pose.bones:
                bone.keyframe_insert("rotation_euler", frame=frame)
                bone.keyframe_insert("location", frame=frame)
                bone.keyframe_insert("scale", frame=frame)
        action = arm.animation_data.action
        action.name, action["author"] = clip, "mounted-family"
        if clip in ("walk", "run"):
            action["stride_distance_m"] = STRIDES[clip]
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = "LINEAR"
        track = arm.animation_data.nla_tracks.new()
        track.name, track.mute = clip, True
        strip = track.strips.new(clip, 0, action)
        strip.action_slot = action.slots[0]
    arm.animation_data.action = bpy.data.actions["ready"]
    arm.animation_data.action_slot = arm.animation_data.action.slots[0]
    scene.frame_set(0)


def build(source, output, name, weapon):
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    arm = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    arm.animation_data.action = bpy.data.actions["ready"]
    arm.animation_data.action_slot = arm.animation_data.action.slots[0]
    scene.frame_set(0)
    ready = {bone.name: bone.rotation_euler.copy() for bone in arm.pose.bones}
    # The donor remains untouched. New mounted motions replace the foot actions
    # only in this new assembly, not in the fitted human's canonical source.
    arm.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    for bone in arm.pose.bones:
        bone.matrix_basis.identity()
    parts = [obj for obj in scene.objects if obj.type == "MESH"
             and obj.name != "HumanAnatomy-Sculpt"
             and (not obj.name.endswith("-Deform") or obj.name == "HumanAnatomy-Deform")]
    for obj in list(scene.objects):
        if obj.type == "MESH" and obj not in parts:
            bpy.data.objects.remove(obj, do_unlink=True)
    offset = Vector((0, 0, .68))
    for obj in parts:
        for vertex in obj.data.vertices:
            vertex.co += offset
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in arm.data.edit_bones:
        bone.head += offset
        bone.tail += offset
    bpy.ops.object.mode_set(mode="OBJECT")
    if weapon != "bow":
        parts.append(equipment.add_helmet_crest(scene, arm))
    parts.extend(horse_source(arm))
    weapon_source(parts, arm, weapon)
    for part in parts:
        part.parent = arm
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    arm.data.edit_bones["root"].parent = arm.data.edit_bones["mount-body"]
    bpy.ops.object.mode_set(mode="OBJECT")
    scene.render.fps = 30
    arm.animation_data_create()
    author_actions(arm, scene, ready, weapon, parts)
    if weapon == "bow":
        equipment.author_held_equipment(scene, arm,
            [part for part in parts if part.name.startswith("Sword")],
            {"melee"}, bone_name="held-sword")
    equipment.export_parts(scene, arm, parts, output, name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name", default="mounted-study")
    parser.add_argument("--weapon", choices=["sword", "lance", "bow"], default="sword")
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    build(args.source, args.output, args.name, args.weapon)
