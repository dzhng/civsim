"""Compose pike equipment states from the saved fitted medium and heavy kits.

No anatomy regeneration: the supplied medium source owns the two-hand actions,
and the supplied heavy source owns sword-sidearm actions and modular mail.
"""
import argparse
import importlib.util
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("anatomy", HERE / "blender-human-anatomy.py")
anatomy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(anatomy)
spec = importlib.util.spec_from_file_location("foot_variant", HERE / "blender-foot-variant.py")
foot_variant = importlib.util.module_from_spec(spec)
spec.loader.exec_module(foot_variant)
NAMES = ("phalanx", "medium-phalanx", "heavy-phalanx-rest", "medium-phalanx-rest",
         "heavy-phalanx-sidearm", "medium-phalanx-sidearm")


def build(source, donor, output, name):
    with bpy.data.libraries.load(str(source)) as (data, target):
        target.scenes = [next(n for n in data.scenes if n == "MediumPhalanxCandidate")]
    scene = target.scenes[0]
    bpy.context.window.scene = scene
    scene.name = "PikeFamily-" + name
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    heavy = name == "phalanx" or name.startswith("heavy-")
    sidearm = name.endswith("-sidearm")
    body = scene.objects["MediumPhalanx-Deform"]
    death_support = {(curve.array_index, key.co.x): key.co.y
                     for layer in bpy.data.actions["death"].layers for strip in layer.strips
                     for bag in strip.channelbags for curve in bag.fcurves
                     if curve.data_path == 'pose.bones["root"].location'
                     for key in curve.keyframe_points}
    parts = [o for o in scene.objects if o.type == "MESH" and o != body]
    for part in parts:
        part.hide_set(False)
        part.hide_render = False
    if heavy or sidearm:
        with bpy.data.libraries.load(str(donor)) as (data, target):
            target.scenes = [next(n for n in data.scenes if n == "HeavyMotionCandidate")]
        donor_scene = target.scenes[0]
        donor_arm = next(o for o in donor_scene.objects if o.type == "ARMATURE")
        # The two saved assemblies share the same rest skeleton, not scaled rigs.
        assert [(b.name, tuple(b.head_local), tuple(b.tail_local)) for b in arm.data.bones] == [
            (b.name, tuple(b.head_local), tuple(b.tail_local)) for b in donor_arm.data.bones]
        wanted = ["Mail shirt"] if heavy else []
        if sidearm:
            wanted += ["Sword grip", "Sword pommel", "Sword guard", "Sword blade"]
        for label in wanted:
            original = next(o for o in donor_scene.objects if o.name == label)
            part = original.copy()
            part.data = original.data.copy()
            scene.collection.objects.link(part)
            fitted_world = part.matrix_world.copy()
            part.parent = arm
            part.matrix_world = fitted_world
            part.hide_set(False)
            part.hide_render = False
            for modifier in part.modifiers:
                if modifier.type == "ARMATURE":
                    modifier.object = arm
            parts.append(part)
        if sidearm:
            previous = {strip.action for track in arm.animation_data.nla_tracks for strip in track.strips}
            arm.animation_data_clear()
            for action in previous:
                bpy.data.actions.remove(action)
            arm.animation_data_create()
            for donor_track in donor_arm.animation_data.nla_tracks:
                track = arm.animation_data.nla_tracks.new()
                track.name, track.mute = donor_track.name, True
                for old in donor_track.strips:
                    action = old.action
                    action.name = donor_track.name
                    if donor_track.name == "death":
                        # The medium tunic/panels remain beneath either armor
                        # variant, so sword states retain their supported landing.
                        for layer in action.layers:
                            for channel_strip in layer.strips:
                                for bag in channel_strip.channelbags:
                                    for curve in bag.fcurves:
                                        if curve.data_path == 'pose.bones["root"].location':
                                            for key in curve.keyframe_points:
                                                key.co.y = death_support[(curve.array_index, key.co.x)]
                    strip = track.strips.new(donor_track.name, int(old.frame_start), action)
                    strip.action_slot = action.slots[0]
    for part in parts[:]:
        remove = ((heavy and part.name.startswith(("Leather ", "Shoulder bronze stud")))
                  or (sidearm and part.name.startswith(("Pike ", "Sheathed sword"))))
        if remove:
            parts.remove(part)
            bpy.data.objects.remove(part, do_unlink=True)
    if heavy:
        parts.append(foot_variant.add_helmet_crest(scene, arm))
        # Let the crested helmet roll onto its side during the landing instead
        # of driving rigid horsehair through the ground. The neck/root stay put.
        death = next(strip.action for track in arm.animation_data.nla_tracks
                     if track.name == "death" for strip in track.strips)
        for layer in death.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        if curve.data_path == 'pose.bones["head"].rotation_euler' and curve.array_index == 2:
                            for key in curve.keyframe_points:
                                t = max(0, min(1, (key.co.x-20)/10))
                                key.co.y += .15 * t*t*(3-2*t)
        # Lengthen the forward shaft beyond its two fitted purchases; neither
        # contact nor the action trajectory is moved by the equipment variant.
        if not sidearm:
            pike = next(p for p in parts if p.name == "Pike shaft")
            vertices = [v.co.copy() for v in pike.data.vertices]
            axis = (sum(vertices[-24:], Vector())/24 - sum(vertices[:24], Vector())/24).normalized()
            origin = sum(vertices[:24], Vector())/24
            for part in parts:
                if part.name.startswith("Pike "):
                    for vertex in part.data.vertices:
                        distance = (vertex.co-origin).dot(axis)
                        if distance > 1.5:
                            vertex.co += axis * (.6 * min(1, (distance-1.5)/2.5))
    bpy.context.window.scene = scene
    scene["equipment_source"] = str(source)
    scene["appearance_name"] = name
    if heavy or sidearm:
        bpy.data.objects.remove(body, do_unlink=True)
        foot_variant.export_parts(scene, arm, parts, output, name, body_name="MediumPhalanx-Deform")
    else:
        for part in parts:
            part.hide_set(True)
            part.hide_render = True
        anatomy.export_candidate(body, arm, output, name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--donor", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name", choices=NAMES, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    build(args.source, args.donor, args.output, args.name)
