"""Remaining spear and two-hand sword equipment on the saved fitted foot rig."""
import argparse
import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


foot = module("foot", "blender-foot-variant.py")
motion = module("motion", "blender-heavy-motion.py")
LOOKS = {
    "light-spear": ("light", "round", "cap"),
    "heavy-spear": ("heavy", "tall", "bronze"),
    "medium-spear": ("medium", "round", "bronze"),
    "longsword": ("medium", "none", "bronze"),
}
GRIP = Vector((-.5732, -.051, .9024))
AXIS = Vector((.8, 0, -.6))


def build(source, output, name):
    sword = name == "longsword"
    grip_origin, weapon_axis = GRIP, AXIS
    if sword:
        with bpy.data.libraries.load(str(source)) as (data, target):
            target.scenes = ["MediumPhalanxCandidate"]
        scene = target.scenes[0]
        bpy.context.window.scene = scene
        arm = next(obj for obj in scene.objects if obj.type == "ARMATURE")
        body = scene.objects["MediumPhalanx-Deform"]
        parts = [obj for obj in scene.objects if obj.type == "MESH" and obj != body]
        shaft = scene.objects["Pike shaft"]
        begin = sum((v.co for v in shaft.data.vertices[:24]), Vector()) / 24
        end = sum((v.co for v in shaft.data.vertices[-24:]), Vector()) / 24
        weapon_axis = (end - begin).normalized()
        grip_origin = begin + weapon_axis * 1.10
        bpy.data.objects.remove(body, do_unlink=True)
        for track in arm.animation_data.nla_tracks:
            rename = {"pike-ready": "twohand-ready", "pike-carry": "twohand-carry",
                      "pike-thrust": "sword-effort"}.get(track.name)
            if rename:
                track.name = track.strips[0].action.name = rename
    else:
        scene, arm, parts = foot.build(source, output, name, *LOOKS[name], export=False)
    for part in parts[:]:
        if part.name.startswith("Sword ") or (sword and (part.name.startswith("Pike ") or "shield" in part.name.lower())):
            parts.remove(part)
            bpy.data.objects.remove(part, do_unlink=True)
    if name == "heavy-spear":
        parts.append(foot.add_helmet_crest(scene, arm))

    def piece(label, sections, material):
        obj = foot.anatomy.loft(label,
            [(grip_origin + weapon_axis * along, width, depth) for along, width, depth in sections],
            12, Vector((0, 1, 0)), weapon_axis.cross(Vector((0, 1, 0))))
        obj.data.materials.append(bpy.data.materials["heavy-" + material])
        obj.vertex_groups.new(name="hand.R").add(list(range(len(obj.data.vertices))), 1, "REPLACE")
        obj.parent = arm
        obj.modifiers.new("Fitted hand attachment", "ARMATURE").object = arm
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        tile = list(foot.surfaces.SURFACES).index(material)
        for loop in obj.data.uv_layers.active.data:
            loop.uv.x = (tile % 4 + loop.uv.x) / 4
            loop.uv.y = (tile // 4 + loop.uv.y) / 2
        parts.append(obj)

    if sword:
        piece("Longsword two-hand grip", [(-.08, .023, .023), (.38, .023, .023)], "leather")
        piece("Longsword pommel", [(-.11, .035, .035), (-.07, .035, .035)], "bronze")
        piece("Longsword guard", [(.375, .12, .025), (.405, .12, .025)], "bronze")
        piece("Longsword blade", [(.41, .042, .008), (1.19, .035, .007), (1.41, .001, .001)], "iron")
    else:
        piece("Spear shaft", [(-.68, .017, .017), (1.25, .017, .017)], "wood")
        piece("Spear leaf head", [(1.23, .018, .008), (1.34, .042, .009),
                                   (1.52, .001, .001)], "iron")
        piece("Spear butt", [(-.74, .004, .004), (-.67, .021, .021)], "bronze")

    tracks = list(arm.animation_data.nla_tracks)
    for track in tracks:
        track.mute = True
    for track in tracks:
        action = track.strips[0].action
        if sword and action.name in {"bend", "pronation", "bend-pronation", "ready", "twohand-carry"}:
            continue
        arm.animation_data.action, arm.animation_data.action_slot = action, action.slots[0]
        first, last = (round(v) for v in action.frame_range)
        # Harvest before editing so integer keys never recursively sample the
        # modified arm. Existing lower body and torso keys remain the donor's.
        frames = []
        for frame in range(first, last + 1):
            scene.frame_set(frame)
            chest = arm.pose.bones["chest"].matrix @ arm.data.bones["chest"].matrix_local.inverted()
            hand = arm.pose.bones["hand.R"].matrix @ arm.data.bones["hand.R"].matrix_local.inverted()
            support = arm.pose.bones["hand.L"].matrix @ arm.data.bones["hand.L"].matrix_local.inverted()
            frames.append((frame, chest, hand, support.to_quaternion()))
        sides = ("L",) if sword else ("R",)
        for frame, chest, hand, support in frames:
            scene.frame_set(frame)
            phase = (frame - first) / max(1, last - first)
            if sword:
                direction = (hand.to_3x3() @ weapon_axis).normalized()
                # The pike's sliding purchase does not fit a sword hilt. Keep
                # its rear-hand/body effort, with the support hand on the hilt.
                motion.grip_pose(arm, "L", hand @ grip_origin + direction * .30, -direction, rotation=support)
                for prefix in ("upper-arm", "forearm", "hand", "elbow-volume"):
                    arm.pose.bones[prefix + ".L"].keyframe_insert("rotation_euler", frame=frame)
                continue
            carry = action.name in {"idle", "walk", "run"}
            reach = 0
            if action.name == "sword-effort":
                reach = -.10 * math.sin(math.pi * min(1, phase / .22)) if phase < .22 else \
                    .13 * math.sin(math.pi * min(1, (phase - .22) / .78))
            target = Vector((-.22, -.23 if carry else -.30 - reach, 1.10 if carry else 1.20))
            direction = Vector((0, -.10, 1) if carry else (0, -1, .08)).normalized()
            direction = (chest.to_3x3() @ direction).normalized()
            if action.name == "death":
                # The falling torso rotates independently of a long weapon:
                # guide the held shaft along the ground instead of levering its
                # tip through it with the chest's axial roll.
                direction = Vector((1, 0, 0))
            motion.grip_pose(arm, "R", chest @ target, direction)
            if name == "heavy-spear" and action.name == "death":
                # Same fitted crest seating used by the completed heavy pike.
                t = max(0, min(1, (frame - 20) / 10))
                arm.pose.bones["head"].rotation_euler.z += .16 * t * t * (3 - 2 * t)
                arm.pose.bones["head"].keyframe_insert("rotation_euler", frame=frame)
            for side in sides:
                for prefix in ("upper-arm", "forearm", "hand", "elbow-volume"):
                    arm.pose.bones[prefix + "." + side].keyframe_insert("rotation_euler", frame=frame)
        if not sword and action.name == "sword-effort":
            action.name = track.name = "spear-effort"
        for curve in motion.action_fcurves(action):
            if any(curve.data_path.startswith(f'pose.bones["{prefix}.{side}"]')
                   for side in sides for prefix in ("upper-arm", "forearm", "hand", "elbow-volume")):
                for key in curve.keyframe_points:
                    key.interpolation = "LINEAR"
    scene["motion_source"] = str(source)
    foot.export_parts(scene, arm, parts, output, name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--name", choices=LOOKS, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    build(args.source, args.output, args.name)
