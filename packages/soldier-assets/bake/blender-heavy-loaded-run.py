"""Isolated whole-body run study. Preserve the combined source and every other action."""
import argparse
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[3]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("motion", ROOT / "packages/soldier-assets/bake/blender-heavy-motion.py")
motion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(motion)


def curves(action):
    return [(curve.data_path, curve.array_index,
             [(tuple(key.co), key.interpolation, tuple(key.handle_left), tuple(key.handle_right))
              for key in curve.keyframe_points])
            for layer in action.layers for strip in layer.strips
            for bag in strip.channelbags for curve in bag.fcurves]


def build(source, output):
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    arm = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    controls = {action.name: curves(action) for action in bpy.data.actions if action.name != "run"}
    for track in arm.animation_data.nla_tracks:
        track.mute = True
    action = bpy.data.actions["run"]
    arm.animation_data.action = action
    arm.animation_data.action_slot = action.slots[0]
    soles = {side: scene.objects["Sandal sole." + side] for side in ("L", "R")}
    # Freeze the fitted arm carriage before editing the trunk. Wrist/grip keys survive.
    carriage = []
    for frame in range(25):
        scene.frame_set(frame)
        carriage.append({name: arm.pose.bones[name].matrix.to_quaternion().copy()
                         for name in ("upper-arm.L", "forearm.L", "upper-arm.R", "forearm.R")})
    changed = {"pelvis", "spine", "chest", "neck", "head"}
    changed.update(name + "." + side for side in ("L", "R")
                   for name in ("thigh", "shin", "knee-volume", "foot", "upper-arm", "forearm", "elbow-volume"))
    untouched = [(path, index, keys) for path, index, keys in curves(action)
                 if not any(path.startswith(f'pose.bones["{name}"]') for name in changed)]
    for frame in range(25):
        scene.frame_set(frame)
        phase = frame / 24
        half = phase % .5
        stride = math.cos(math.tau * phase)
        # Loading occurs after touchdown. Chest response lags the pelvis; the
        # neck stabilizes the gaze instead of adding the same bob to every joint.
        load = math.cos(2 * math.tau * (phase - .11))
        delayed = math.cos(2 * math.tau * (phase - .15))
        for name, pitch, turn, roll in (
            ("pelvis", .10 + .035 * load, .085 * stride, -.025 * stride),
            ("spine", .28 + .065 * load, -.08 * stride, .035 * stride),
            ("chest", .32 + .070 * delayed, -.145 * stride, .060 * stride),
            ("neck", .11 + .025 * delayed, -.035 * stride, .020 * stride),
            ("head", .015, -.020 * stride, .006 * stride),
        ):
            rotation = Matrix.Rotation(turn, 3, "Z") @ Matrix.Rotation(pitch, 3, "X") @ Matrix.Rotation(roll, 3, "Y")
            motion.orient(arm, name, rotation.to_quaternion() @ arm.data.bones[name].matrix_local.to_quaternion())
        arm.pose.bones["pelvis"].location = (0, 0, 0)
        bpy.context.view_layer.update()
        minimum = {}
        for side in ("R", "L"):
            step = (phase + (0 if side == "R" else .5)) % 1
            # Flex under impact, extend against the floor, then fold the recovering
            # leg. Ground travel stays linear at the authoritative 3.23m/s.
            knee = motion.cycle_value(((0, .38), (.11, .88), (.23, .54), (.35, .24),
                                       (.51, 1.85), (.69, 1.35), (.88, .54), (1, .38)), step)
            roll = motion.cycle_value(((0, -.12), (.07, 0), (.18, 0), (.35, .80),
                                       (.50, .60), (.73, -.24), (1, -.12)), step)
            # The foot lands nearer the hip and leaves farther behind it; a
            # symmetric reach ahead made landing the lowest point of the bounce.
            travel = -.32 + 3.23 * .8 * step if step < .35 else .1322 + .4522 * math.cos(math.pi * (step - .35) / .65)
            heel = max(soles[side].data.vertices, key=lambda vertex: vertex.co.y).co
            toe = min(soles[side].data.vertices, key=lambda vertex: vertex.co.y).co
            pivot = toe.lerp(heel, .5 + .5 * math.cos(math.pi * min(step / .35, 1))) - arm.data.bones["foot." + side].head_local
            travel -= (Matrix.Rotation(roll, 3, "X") @ pivot - pivot).y
            travel -= arm.pose.bones["thigh." + side].head.y - arm.data.bones["thigh." + side].head_local.y
            thigh = motion.thigh_angle(arm, side, knee, travel)
            motion.orient(arm, "thigh." + side, Matrix.Rotation(thigh, 3, "X").to_quaternion() @ arm.data.bones["thigh." + side].matrix_local.to_quaternion())
            arm.pose.bones["shin." + side].rotation_euler.x = knee
            arm.pose.bones["knee-volume." + side].rotation_euler.x = knee / 2
            bpy.context.view_layer.update()
            motion.orient(arm, "foot." + side, Matrix.Rotation(roll, 3, "X").to_quaternion() @ arm.data.bones["foot." + side].matrix_local.to_quaternion())
            for name, gain in (("upper-arm." + side, 1), ("forearm." + side, .55)):
                swing = (.15 if side == "R" else .07) * math.sin(math.tau * phase - .25)
                delta = Matrix.Rotation(.055 * delayed + gain * swing, 3, "X") @ Matrix.Rotation(.035 * stride, 3, "Y")
                motion.orient(arm, name, delta.to_quaternion() @ carriage[frame][name])
            helper = arm.pose.bones["elbow-volume." + side]
            base = helper.parent.matrix @ helper.parent.bone.matrix_local.inverted() @ helper.bone.matrix_local
            motion.orient(arm, helper.name, base.to_quaternion().slerp(arm.pose.bones["forearm." + side].matrix.to_quaternion(), .5))
            foot = arm.pose.bones["foot." + side]
            transform = foot.matrix @ foot.bone.matrix_local.inverted()
            minimum[side] = min((transform @ vertex.co).z for vertex in soles[side].data.vertices)
        clearance = .025 * math.sin(math.pi * (half - .35) / .15) if half > .35 else 0
        offset = -min(minimum.values()) + clearance
        support = "R" if phase % 1 < .5 else "L"
        if half <= .35:
            assert abs(minimum[support] + offset) < .0001, (frame, "support foot lost floor")
        pelvis = arm.pose.bones["pelvis"]
        pelvis.location = pelvis.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, offset))
        for name in changed:
            arm.pose.bones[name].keyframe_insert("rotation_euler", frame=frame)
        pelvis.keyframe_insert("location", frame=frame)
    assert controls == {action.name: curves(action) for action in bpy.data.actions if action.name != "run"}
    assert untouched == [(path, index, keys) for path, index, keys in curves(action)
                         if not any(path.startswith(f'pose.bones["{name}"]') for name in changed)]
    motion.anatomy.export_candidate(scene.objects["HeavyKit-Deform"], arm, output, "heavy-run")
    (output / "controls.json").write_text(json.dumps({"inputSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "glbSha256": hashlib.sha256((output / "heavy-run.glb").read_bytes()).hexdigest(),
        "exactNonRunActions": list(controls), "exactUntouchedRunChannels": len(untouched),
        "changedJoints": sorted(changed), "duration": .8, "prescribedSpeed": 3.23}, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=ROOT / "packages/soldier-assets/assets/source/heavy-kit/heavy-kit.blend")
    parser.add_argument("--output", type=Path, default=ROOT / "throwaway/wholebody-run/source")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    build(args.source, args.output)
