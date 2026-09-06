"""Six locally authored surface diagnostics, not soldier artwork.

Run with Blender --background --factory-startup --python-exit-code 1 --python FILE.
Uses the existing source-export/landmark oracle; does not regenerate its soldiers.
"""
import importlib.util
import math
import sys
from pathlib import Path
import bpy

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("fixture", Path(__file__).with_name("blender-reference-fixtures.py"))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
fixture.OUTPUT = Path(__file__).resolve().parents[1] / "assets/test/material-swatches"
PALETTE = [(.55, .31, .20), (.45, .42, .34), (.16, .08, .035),
           (.30, .32, .34), (.28, .17, .075), (.55, .40, .17)]


def image(name, channel):
    result = bpy.data.images.new(name, width=96, height=32)
    if channel != "base":
        result.colorspace_settings.name = "Non-Color"
    pixels = []
    for y in range(32):
        for x in range(96):
            # Each strip has its own tile; asymmetric cells expose UV reversal.
            u, v = (x % 16) / 15, y / 31
            if channel == "base":
                a = .68 + .22 * u + .10 * v
                color = tuple(a * c for c in PALETTE[x // 16])
            elif channel == "normal":
                nx, ny = .28 * math.sin(u * math.tau), .22 * math.cos(v * math.tau)
                color = (.5 + nx / 2, .5 + ny / 2, .5 + math.sqrt(1 - nx*nx - ny*ny) / 2)
            else:
                color = (.45 + .55 * v, .65 + .35 * u, 1)
            pixels.extend((*color, 1))
    result.pixels = pixels
    result.pack()
    return result


def build():
    fixture.reset()
    arm = fixture.rig_from_bones([
        ("root", (0, 0, .6), (0, 0, 1.5), None),
        ("bend", (0, 0, 1.5), (0, 0, 2.4), "root"),
    ])
    images = {name: image("swatches-" + name, name) for name in ("base", "normal", "orm")}
    definitions = [
        ("skin", .65, 0, .25),
        ("cloth", .95, 0, .65),
        ("leather", .72, 0, .45),
        ("mail", .58, 1, .85),
        ("wood", .8, 0, .5),
        ("metal", .25, 1, .2),
    ]
    objects = []
    for index, (name, roughness, metallic, normal_scale) in enumerate(definitions):
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        nodes, links = material.node_tree.nodes, material.node_tree.links
        shader = nodes.get("Principled BSDF")
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = metallic
        textures = {}
        for channel, source in images.items():
            node = nodes.new("ShaderNodeTexImage")
            node.image = source
            node.interpolation = "Closest"
            textures[channel] = node
        links.new(textures["base"].outputs["Color"], shader.inputs["Base Color"])
        normal = nodes.new("ShaderNodeNormalMap")
        normal.inputs["Strength"].default_value = normal_scale
        links.new(textures["normal"].outputs["Color"], normal.inputs["Color"])
        links.new(normal.outputs["Normal"], shader.inputs["Normal"])
        separate = nodes.new("ShaderNodeSeparateColor")
        links.new(textures["orm"].outputs["Color"], separate.inputs[0])
        for channel, factor, socket in (("Green", roughness, "Roughness"), ("Blue", metallic, "Metallic")):
            mul = nodes.new("ShaderNodeMath")
            mul.operation = "MULTIPLY"
            mul.inputs[1].default_value = factor
            links.new(separate.outputs[channel], mul.inputs[0])
            links.new(mul.outputs[0], shader.inputs[socket])
        group = bpy.data.node_groups.get("glTF Material Output")
        if group is None:
            group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
            group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        output = nodes.new("ShaderNodeGroup")
        output.node_tree = group
        links.new(separate.outputs["Red"], output.inputs["Occlusion"])
        x = (index - 2.5) * .75
        vertices = [(x + side * .3, 0, z + .6) for z in (0, .45, .9, 1.35, 1.8) for side in (-1, 1)]
        faces = [(row*2, row*2+1, row*2+3, row*2+2) for row in range(4)]
        weights = [{"root": 1-t, "bend": t} for t in (0, .1, .5, .9, 1) for _ in range(2)]
        obj = fixture.mesh_object(name, vertices, faces, weights, arm, material)
        # Inset half a texel so nearest sampling never crosses a material tile.
        uv = obj.data.uv_layers.active
        for loop in obj.data.loops:
            vertex = loop.vertex_index
            u = (index * 16 + .5 + (vertex % 2) * 15) / 96
            v = (.5 + (vertex // 2) / 4 * 31) / 32
            uv.data[loop.index].uv = (u, v)
        objects.append(obj)
    clip = fixture.action(arm, "bend", [("bend", 0, math.radians(50))])
    return arm, objects, [clip], []


fixture.OUTPUT.mkdir(parents=True, exist_ok=True)
fixture.export_fixture("swatches", build)
