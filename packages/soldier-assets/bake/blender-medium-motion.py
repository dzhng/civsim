"""Pike motion on the saved fitted medium assembly.

Run in Blender on SOURCE.blend, then -- --clip CLIP --output DIRECTORY.
Only the selected action changes; geometry and every other action stay intact.
"""
import argparse
import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("motion", HERE / "blender-heavy-motion.py")
motion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(motion)
GRIP_CENTERS = {side: Vector((sign * .5732, -.051, .9024)) for side, sign in (("L", 1), ("R", -1))}
POLEARM_ACTIONS = ("hit", "death", "guarded-backward-walk", "guarded-left-walk", "guarded-right-walk")


def author_polearm_action(arm, donor, clip):
    """Reuse fitted body motion, retaining the connected two-hand weapon chain."""
    scene = bpy.context.scene
    controls = {a.name: motion.action_signature(a) for a in bpy.data.actions if a.name != clip}
    old = bpy.data.actions.get(clip)
    if old:
        if old.get("author") != "medium-polearm-" + clip:
            raise ValueError(f"Refusing to replace unrelated {clip}")
        for track in list(arm.animation_data.nla_tracks):
            if any(strip.action == old for strip in track.strips):
                arm.animation_data.nla_tracks.remove(track)
        arm.animation_data.action = None
        bpy.data.actions.remove(old)
    ready = bpy.data.actions["pike-ready"]
    arm.animation_data.action = ready
    arm.animation_data.action_slot = ready.slots[0]
    scene.frame_set(0)
    upper = {b.name: (b.rotation_euler.copy(), b.location.copy()) for b in arm.pose.bones
             if b.name.startswith(("clavicle.", "upper-arm.", "forearm.", "hand.", "elbow-volume."))}
    with bpy.data.libraries.load(str(donor)) as (data, target):
        if clip not in data.actions or len(data.armatures) != 1:
            raise ValueError(f"Donor must contain {clip} and one fitted rig")
        target.actions, target.armatures = [clip], data.armatures[:]
    source, rig = target.actions[0], target.armatures[0]
    signature = lambda data: [(b.name, b.parent.name if b.parent else None,
                               tuple(tuple(row) for row in b.matrix_local), b.length)
                              for b in data.bones]
    if signature(rig) != signature(arm.data):
        raise ValueError("Polearm motion requires the same fitted rest rig")
    bpy.data.armatures.remove(rig)
    source.name = "polearm-donor-" + clip
    arm.animation_data.action = source
    arm.animation_data.action_slot = source.slots[0]
    frames = range(round(source.frame_range[0]), round(source.frame_range[1]) + 1)
    poses = []
    for frame in frames:
        scene.frame_set(frame)
        poses.append({b.name: (b.rotation_euler.copy(), b.location.copy()) for b in arm.pose.bones})
    distance = source.get("stride_distance_m")
    arm.animation_data.action = None
    bpy.data.actions.remove(source)
    for frame, pose in zip(frames, poses):
        scene.frame_set(frame)
        for bone in arm.pose.bones:
            bone.rotation_euler, bone.location = upper.get(bone.name, pose[bone.name])
        if clip == "death":
            # The medium leather panels and small shield seat below the donor's
            # fitted armor. Preserve the initial supports, then land on this kit.
            t = max(0, min(1, (frame - 20) / 4))
            root = arm.pose.bones["root"]
            root.location += root.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, .020 * t * t * (3 - 2 * t)))
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    motion.finish_ready_action(arm, clip, "medium-polearm-" + clip, distance, controls)


def upright_carry(arm, original_forearm, phase, running=False):
    old_axis = original_forearm.to_3x3().col[1].normalized()
    old_normal = Vector((0, -1, 0))
    old_normal = (old_normal - old_axis * old_normal.dot(old_axis)).normalized()
    step = math.tau * phase
    lean = .18 + .025 * math.sin(2 * step) if running else .045 + .012 * math.sin(2 * step)
    turn = math.radians(10) + (.055 if running else .04) * math.sin(step)
    torso_turn = Matrix.Rotation(turn, 3, "Z") @ Matrix.Rotation(lean, 3, "X")
    for name, yaw, pitch in (("spine", 0, lean), ("chest", turn, lean),
                             ("neck", 0, .055 if running else .015), ("head", 0, .015)):
        rotation = Matrix.Rotation(yaw, 3, "Z") @ Matrix.Rotation(pitch, 3, "X")
        motion.orient(arm, name, rotation.to_quaternion() @ arm.data.bones[name].matrix_local.to_quaternion())
    # The held load lags the chest; connected elbow flex absorbs their relative
    # motion. A wider lateral carry gives the advancing ankle room below it.
    # A slight rearward upright rake brings the lower purchase forward, keeping
    # the left wrist aligned while the shield-bearing elbow hangs at the flank.
    shaft = Vector((.008 * math.sin(step - .5), .28 + .015 * math.sin(2 * step - .7), 1)).normalized()
    rise = arm.pose.bones["pelvis"].head.z - arm.data.bones["pelvis"].head_local.z
    right_grip = Vector((.30 + (.015 if running else .008) * math.sin(step - .5),
                         (-.27 if running else -.23) + (.015 if running else .006) * math.sin(2 * step - .7),
                         1.38 + .6 * rise + (.022 if running else .012) * math.sin(2 * step - .7)))
    # Closely spaced lower purchases let the elbows hang beneath the load,
    # carrying the shield at flank without folding a forearm beside the face.
    grips = {"R": right_grip, "L": right_grip - shaft * .16}
    for side, sign in (("R", -1), ("L", 1)):
        rest_grip = GRIP_CENTERS[side]
        rest_along, rest_across = Vector((sign * .6, 0, -.8)), Vector((sign * .8, 0, .6))
        source = Matrix((rest_across, rest_along, rest_across.cross(rest_along))).transposed()
        along, across = Vector((-sign, -.2, -.1)), shaft * -sign
        hand = arm.data.bones["hand." + side]
        shoulder = arm.pose.bones["upper-arm." + side].head.copy()
        upper, lower = (arm.data.bones[n + "." + side].length for n in ("upper-arm", "forearm"))
        for _ in range(24):
            along = (along - shaft * along.dot(shaft)).normalized()
            target = Matrix((across, along, across.cross(along))).transposed()
            rotation = target @ source.transposed()
            wrist = grips[side] - rotation @ (rest_grip - hand.head_local)
            delta = wrist - shoulder
            reach, forward = delta.length, delta.normalized()
            if not abs(upper - lower) < reach < upper + lower:
                raise ValueError(f"Unreachable upright {side} wrist")
            pole = torso_turn @ Vector((.25, -.7, -1) if side == "L" else (0, -.8, -1))
            pole = (pole - forward * pole.dot(forward)).normalized()
            distance = (upper * upper - lower * lower + reach * reach) / (2 * reach)
            elbow = shoulder + forward * distance + pole * math.sqrt(upper * upper - distance * distance)
            along = along.lerp((wrist - elbow).normalized(), .5).normalized()
        upper_rest = torso_turn @ arm.data.bones["upper-arm." + side].matrix_local.to_3x3()
        motion.orient(arm, "upper-arm." + side,
            upper_rest.col[1].rotation_difference(elbow - shoulder) @ upper_rest.to_quaternion())
        if side == "L":
            axis = (wrist - elbow).normalized()
            normal = Vector((1, 0, 0))
            normal = (normal - axis * normal.dot(axis)).normalized()
            source_frame = Matrix((old_normal, old_axis.cross(old_normal), old_axis)).transposed()
            target_frame = Matrix((normal, axis.cross(normal), axis)).transposed()
            motion.orient(arm, "forearm.L",
                (target_frame @ source_frame.transposed()).to_quaternion() @ original_forearm.to_quaternion())
        else:
            motion.aim(arm, "forearm.R", wrist - elbow)
        motion.orient(arm, "hand." + side, (rotation @ hand.matrix_local.to_3x3()).to_quaternion())
        helper = arm.pose.bones["elbow-volume." + side]
        base = helper.parent.matrix @ helper.parent.bone.matrix_local.inverted() @ helper.bone.matrix_local
        motion.orient(arm, helper.name, base.to_quaternion().slerp(arm.pose.bones["forearm." + side].matrix.to_quaternion(), .5))


def author_pike_ready(arm):
    """Held-hedge ready study, not a measurement of the engine's brace ramp."""
    pelvis = arm.pose.bones["pelvis"]
    pelvis.location = pelvis.bone.matrix_local.to_3x3().inverted() @ (Vector((0, -.035, .890)) - pelvis.bone.head_local)
    bpy.context.view_layer.update()
    for side, sign in (("L", 1), ("R", -1)):
        foot = arm.pose.bones["foot." + side]
        direction = foot.bone.tail_local - foot.bone.head_local
        direction.z = 0
        motion.place_supported_leg(arm, side, Vector((sign * .15, -.14 if side == "L" else .10, .093)), direction.normalized())
        motion.orient(arm, foot.name, foot.bone.matrix_local.to_quaternion())
    # Both established arm chains travel with the common trunk, preserving
    # purchases without choosing a different elbow branch for a static load.
    arm.pose.bones["spine"].rotation_euler.x += .14
    arm.pose.bones["neck"].rotation_euler.x -= .10
    bpy.context.view_layer.update()
    for frame in (0, 30):
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)


def author_at_ease(arm):
    carry = bpy.data.actions["pike-carry"]
    arm.animation_data.action = carry
    arm.animation_data.action_slot = carry.slots[0]
    bpy.context.scene.frame_set(0)
    forearm = arm.pose.bones["forearm.L"].matrix.copy()
    clip, author = "at-ease", "medium-upright-rest"
    controls, base, _, _ = motion.begin_ready_action(arm, bpy.context.scene, clip, author)
    for frame in (0, 30):
        for bone in arm.pose.bones:
            bone.rotation_euler, bone.location = base[bone.name]
        bpy.context.view_layer.update()
        upright_carry(arm, forearm, 0)
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    motion.finish_ready_action(arm, clip, author, None, controls)


def author_pike_thrust(arm):
    ready = {b.name: (b.rotation_euler.copy(), b.location.copy()) for b in arm.pose.bones}
    pelvis = arm.pose.bones["pelvis"]
    feet = {side: arm.pose.bones["foot." + side].head.copy() for side in ("L", "R")}
    hands = {side: arm.pose.bones["hand." + side].matrix.copy() for side in ("L", "R")}
    support = [arm.pose.bones[name + ".L"] for name in ("upper-arm", "forearm")]
    support_rotations = [bone.matrix.to_quaternion() for bone in support]
    support_directions = [bone.tail - bone.head for bone in support]
    support_bend = support[1].head - support[0].head
    grips = {side: hands[side] @ arm.data.bones["hand." + side].matrix_local.inverted() @ center
             for side, center in GRIP_CENTERS.items()}
    axis = (grips["L"] - grips["R"]).normalized()
    # One effort, not the simulation's damage cadence. Ease into preparation,
    # accelerate through extension, then recover under the held weapon's load.
    # Pelvis travel/height, trunk lean, and weapon travel have separate loads:
    # the body braces forward while the hands retrieve the shaft.
    keys = ((0, 0, 0, 0, 0, 0), (6, .055, -.015, -.12, -.18, .10),
            (15, -.09, -.008, .15, .435, -.40), (19, -.095, -.04, .16, .433, -.40),
            (32, -.045, -.015, .065, -.02, 0),
            (39, 0, 0, 0, 0, 0))
    previous = {}
    for frame in range(40):
        bpy.context.scene.frame_set(frame)
        for name, (rotation, location) in ready.items():
            arm.pose.bones[name].rotation_euler = rotation
            arm.pose.bones[name].location = location
        if frame not in (0, 39):
            a, b = next((a, b) for a, b in zip(keys, keys[1:]) if a[0] <= frame <= b[0])
            t = (frame - a[0]) / (b[0] - a[0])
            t = t * t * (3 - 2 * t)
            travel, height, lean, reach, turn = (a[i] + (b[i] - a[i]) * t for i in (1, 2, 3, 4, 5))
            pelvis.location += pelvis.bone.matrix_local.to_3x3().inverted() @ Vector((0, travel, height))
            bpy.context.view_layer.update()
            for side in ("L", "R"):
                foot = arm.pose.bones["foot." + side]
                motion.place_supported_leg(arm, side, feet[side], Vector((0, -1, 0)))
                motion.orient(arm, foot.name, foot.bone.matrix_local.to_quaternion())
            arm.pose.bones["spine"].rotation_euler.x += lean
            arm.pose.bones["neck"].rotation_euler.x -= lean * .7
            bpy.context.view_layer.update()
            # Unwind the shoulders around the planted body: the rear arm gains
            # reach while the front shoulder follows its already extended hand.
            if turn:
                spine = arm.pose.bones["spine"]
                motion.orient(arm, spine.name, Quaternion((0, 0, 1), turn) @ spine.matrix.to_quaternion())
            # The held shaft travels axially, independently of the leaning trunk.
            # Elbow flex absorbs that difference without a new bend branch.
            for side in ("L", "R"):
                upper, lower, hand = (arm.pose.bones[n + "." + side] for n in ("upper-arm", "forearm", "hand"))
                shoulder, old_elbow = upper.head.copy(), lower.head.copy()
                wrist = hands[side].translation + axis * reach
                upper_rotation, lower_rotation = (b.matrix.to_quaternion() for b in (upper, lower))
                old_upper, old_lower = upper.tail - upper.head, lower.tail - lower.head
                bend_hint = old_elbow - shoulder
                if side == "L":
                    # The shield follows this forearm. Keep its anatomical bend
                    # reference in ready-world space instead of inheriting torso
                    # yaw as an extra elbow swivel; the actual wrist still moves.
                    upper_rotation, lower_rotation = support_rotations
                    old_upper, old_lower = support_directions
                    bend_hint = support_bend
                delta = wrist - shoulder
                distance = delta.length
                u, v = upper.bone.length, lower.bone.length
                if not abs(u - v) < distance < u + v:
                    raise ValueError(f"Unreachable thrust {side} wrist at frame {frame}: {distance:.6f} outside ({abs(u-v):.6f}, {u+v:.6f})")
                elbow = motion.limb_joint(shoulder, wrist, u, v, bend_hint)
                motion.orient(arm, upper.name, old_upper.rotation_difference(elbow - shoulder) @ upper_rotation)
                motion.orient(arm, lower.name, old_lower.rotation_difference(wrist - elbow) @ lower_rotation)
                motion.orient(arm, hand.name, hands[side].to_quaternion())
                helper = arm.pose.bones["elbow-volume." + side]
                base = helper.parent.matrix @ helper.parent.bone.matrix_local.inverted() @ helper.bone.matrix_local
                motion.orient(arm, helper.name, base.to_quaternion().slerp(lower.matrix.to_quaternion(), .5))
        for bone in arm.pose.bones:
            if frame not in (0, 39):
                bone.rotation_euler = bone.rotation_euler.to_quaternion().to_euler("XYZ", previous[bone.name])
            previous[bone.name] = bone.rotation_euler.copy()
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)


def author(arm, clip):
    source = "pike-ready" if clip == "pike-thrust" else "pike-carry"
    arm.animation_data.action = bpy.data.actions[source]
    arm.animation_data.action_slot = arm.animation_data.action.slots[0]
    bpy.context.scene.frame_set(0)
    original_forearm = arm.pose.bones["forearm.L"].matrix.copy()
    carry = {b.name: b.rotation_euler.copy() for b in arm.pose.bones}
    if clip in ("pike-ready", "pike-thrust"):
        for track in list(arm.animation_data.nla_tracks):
            if track.name == clip:
                arm.animation_data.nla_tracks.remove(track)
        if clip in bpy.data.actions:
            bpy.data.actions.remove(bpy.data.actions[clip])
        action = bpy.data.actions[source].copy()
        action.name = clip
    else:
        action = bpy.data.actions[clip]
    arm.animation_data.action = action
    arm.animation_data.action_slot = action.slots[0]
    if clip in ("pike-ready", "pike-thrust"):
        bpy.context.scene.frame_set(0)
        (author_pike_thrust if clip == "pike-thrust" else author_pike_ready)(arm)
        action["author"] = "medium-held-" + clip
        track = arm.animation_data.nla_tracks.new()
        track.name, track.mute = clip, True
        strip = track.strips.new(clip, 0, action)
        strip.action_slot = action.slots[0]
        bpy.context.scene.frame_set(0)
        return
    upper = [n for n in carry if n in ("spine", "chest", "neck", "head")
             or n.startswith(("clavicle.", "upper-arm.", "forearm.", "hand.", "elbow-volume."))]
    # The donor's .9 s / 1.53 m walk follows the class-independent 1.7 m/s
    # floor. Keep its planted travel keys while the arms absorb the held load.
    # Run keeps its existing .8 s lower-body action for the first carry study;
    # its actual support travel is measured before assigning stride calibration.
    frames = 24 if clip == "run" else 27
    previous = {}
    for frame in range(frames + 1):
        bpy.context.scene.frame_set(frame)
        phase = frame / frames
        for name in upper:
            arm.pose.bones[name].rotation_euler = carry[name]
        upright_carry(arm, original_forearm, phase, running=clip == "run")
        for name in upper:
            bone = arm.pose.bones[name]
            if name in previous:
                # Equivalent Euler branches must not spin a wrist between keys.
                bone.rotation_euler = bone.rotation_euler.to_quaternion().to_euler("XYZ", previous[name])
            previous[name] = bone.rotation_euler.copy()
            bone.keyframe_insert("rotation_euler", frame=frame)
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = "LINEAR"
    action["author"] = "medium-upright-" + clip
    bpy.context.scene.frame_set(0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--clip", choices=("walk", "run", "pike-ready", "pike-thrust", "at-ease") + POLEARM_ACTIONS, required=True)
    parser.add_argument("--donor", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    if args.clip == "at-ease":
        author_at_ease(arm)
    elif args.clip in POLEARM_ACTIONS:
        if args.donor is None:
            parser.error("polearm reactions and guarded travel require --donor")
        author_polearm_action(arm, args.donor, args.clip)
    else:
        author(arm, args.clip)
    motion.anatomy.export_candidate(bpy.data.objects["MediumPhalanx-Deform"], arm, args.output, "medium-phalanx")
