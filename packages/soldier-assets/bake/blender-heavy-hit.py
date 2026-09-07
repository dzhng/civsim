"""Append a manual-review heavy hit reaction to the saved fitted kit."""
import argparse
import importlib.util
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("heavy_motion", HERE / "blender-heavy-motion.py")
motion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(motion)


def author_hit(arm, scene):
    clip, author = "hit", "heavy-hit-study"
    controls, base, feet, _ = motion.begin_ready_action(arm, scene, clip, author)
    ankles = {side: arm.pose.bones["foot." + side].head.copy() for side in ("L", "R")}
    # No impact direction is observed by the consumer. This is a compact
    # generic yielding reaction, with both supports and all purchases retained.
    for frame in range(19):
        phase = frame / 18
        yield_amount = motion.cycle_value(((0, 0), (1/6, .2), (1/3, 1), (.56, .55), (.78, -.08), (1, 0)), phase)
        settle = motion.cycle_value(((0, 0), (1/6, .15), (7/18, 1), (.67, .3), (.78, -.12), (1, 0)), phase)
        for bone in arm.pose.bones:
            bone.rotation_euler, bone.location = base[bone.name]
        if frame not in (0, 18):
            pelvis = arm.pose.bones["pelvis"]
            pelvis.location += pelvis.bone.matrix_local.to_3x3().inverted() @ Vector((0, .020 * yield_amount, -.060 * settle))
            for name, delta in {
                "spine": (-.055 * yield_amount, 0, 0),
                "chest": (.155 * yield_amount, 0, 0),
                "neck": (-.030 * yield_amount, 0, 0),
                "head": (.045 * yield_amount, 0, 0),
            }.items():
                rest = base[name][0]
                arm.pose.bones[name].rotation_euler = (rest.to_quaternion() @ Euler(delta, "XYZ").to_quaternion()).to_euler("XYZ", rest)
            bpy.context.view_layer.update()
            for side in ("L", "R"):
                motion.place_supported_leg(arm, side, ankles[side])
                motion.orient(arm, "foot." + side, feet[side])
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    motion.finish_ready_action(arm, clip, author, None, controls)


def build(source, output):
    with bpy.data.libraries.load(str(source)) as (data, target):
        target.scenes = [next(name for name in data.scenes if name in ("HeavyKitCandidate", "HeavyMotionCandidate"))]
    scene = target.scenes[0]
    bpy.context.window.scene = scene
    arm = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    body = scene.objects["HeavyKit-Deform"]
    author_hit(arm, scene)
    motion.anatomy.export_candidate(body, arm, output, "heavy-kit")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    build(args.source, args.output)
