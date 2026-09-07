"""Original heavy-infantry surfaces over a frozen, editable equipment source.

Call author_surfaces on editable parts before the geometry owner's export join.
Only material slots, UVs and faction attributes are authored here; the source rig,
positions, normals and weights remain the geometry owner's responsibility.
"""
import math
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parent / "assets/source/heavy-surfaces"
TILE = (512, 1024)
GUTTER = 24
# Linear albedos. Warm daylight belongs to the production environment.
SURFACES = {
    "skin": ((.43, .24, .145), .76, 0, .18),
    "cloth": ((.39, .34, .245), .94, 0, .25),
    "mail": ((.12, .125, .13), .78, 1, .50),
    "bronze": ((.32, .205, .095), .57, 1, .32),
    "iron": ((.40, .415, .43), .30, 1, .18),
    "leather": ((.075, .030, .012), .82, 0, .28),
    "wood": ((.22, .115, .045), .86, 0, .28),
    "shield-hide": ((.19, .135, .075), .96, 0, .65),
}


def surface_tile(name):
    """Analytic local motifs; height creates tangent normals, never lit albedo."""
    y, x = np.mgrid[:TILE[1], :TILE[0]].astype(np.float32)
    u = np.clip((x-GUTTER)/(TILE[0]-2*GUTTER-1), 0, 1)
    v = np.clip((y-GUTTER)/(TILE[1]-2*GUTTER-1), 0, 1)
    grain = (np.sin(u*831 + np.sin(v*127))*np.sin(v*937+u*83)
             + .5*np.sin(u*211+v*419))/1.5
    height = grain*.018
    tint = 1 + grain*.018
    roughness = np.ones_like(u)
    ao = np.ones_like(u)
    if name == "mail":
        # Continue the periodic weave through the gutter so the rear UV seam can
        # unwrap across1 without collapsing a strip of garment onto the tile edge.
        u = (x-GUTTER)/(TILE[0]-2*GUTTER)
        # Alternating rows overlap elliptical wire loops. Smooth profiles suppress
        # isolated binary highlights; linked relief belongs in normal/AO channels.
        height = np.zeros_like(u)
        coverage = np.zeros_like(u)
        row = np.floor(v*100)
        for row_shift in (-1, 0, 1):
            ring_row = row+row_shift
            dy = v*100-ring_row
            dx = ((u*120 + (ring_row % 2)*.5+.5) % 1)-.5
            dx += dy*.23*(1-2*(ring_row % 2))
            radius = np.sqrt((dx/.39)**2 + (dy/.70)**2)
            wire = np.exp(-((radius-1)/.22)**2)
            crossing = .65 + .25*np.cos(np.arctan2(dy, dx))
            height = wire*crossing + height*(1-wire)
            coverage = np.maximum(coverage, wire)
        tint = .40 + .60*coverage + .014*grain
        roughness = .90 + .10*(1-coverage)
        ao = .38 + .62*coverage
    elif name == "cloth":
        weave = np.sin(u*math.tau*160)*np.sin(v*math.tau*220)
        height = .07*weave + .018*grain
        tint = 1 + .018*weave + .025*np.sin(v*math.tau*19)
    elif name in ("leather", "shield-hide"):
        pores = np.sin(u*659+np.sin(v*87)*3)*np.sin(v*857+np.sin(u*69)*3)
        height = .07*pores + .02*grain
        tint = 1 + .04*grain + .018*np.sin(u*13+v*23)
        roughness = .95 + .05*pores
        if name == "shield-hide":
            # Surface scuffs and rubbed edges remain pigments/roughness, not light.
            edge = np.clip((np.abs(u-.5)-.38)*8, 0, 1)
            scratches = np.maximum(0, np.sin(u*211+v*17)-.92)*np.maximum(0, np.sin(v*41))
            mottling = np.sin(u*73+np.sin(v*41)*3)*np.sin(v*79+np.sin(u*59))
            tint += .12*edge + scratches*.8 + .10*mottling
            height += .30*mottling
            roughness = np.ones_like(u)
    elif name == "wood":
        warp = u + .006*np.sin(v*21+u*37) + .004*np.sin(v*57+u*19)
        knot = np.exp(-((u-.63)**2/.009+(v-.42)**2/.023))
        lines = np.sin(warp*math.tau*43 + knot*13)
        height = .025*lines + .02*grain
        tint = .94 + .045*lines + .05*grain + .04*np.sin(u*32+v*7)
    elif name in ("bronze", "iron"):
        hammer = np.sin(u*67+np.sin(v*93))*np.sin(v*107+np.sin(u*55))
        height = .035*hammer + .008*grain
        tint = 1 + .017*hammer
        roughness = .93 + .07*(.5+.5*hammer)
    else:
        height = .018*grain
        tint = 1 + .018*grain + .015*np.sin(u*12+v*7)
    dy, dx = np.gradient(height)
    normal = np.stack((-dx*2, -dy*2, np.ones_like(u)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    base = np.clip(np.array(SURFACES[name][0])*tint[..., None], 0, 1)
    orm = np.stack((ao, roughness, np.ones_like(u)), axis=-1)
    return {"baseColor": base, "normal": normal*.5+.5, "orm": orm}


def atlas_images():
    channels = {key: np.ones((TILE[1]*2, TILE[0]*4, 4), dtype=np.float32)
                for key in ("baseColor", "normal", "orm")}
    for index, name in enumerate(SURFACES):
        x, y = index % 4*TILE[0], index//4*TILE[1]
        for key, values in surface_tile(name).items():
            channels[key][y:y+TILE[1], x:x+TILE[0], :3] = values
    result = {}
    for key, pixels in channels.items():
        if key == "baseColor":
            # Generated-image pixels are stored in the declared image space;
            # encode linear albedo before PNG packing and runtime sRGB decoding.
            rgb = pixels[..., :3]
            pixels[..., :3] = np.where(rgb <= .0031308, 12.92*rgb, 1.055*rgb**(1/2.4)-.055)
        image = bpy.data.images.new("heavy-"+key, width=TILE[0]*4, height=TILE[1]*2)
        if key != "baseColor":
            image.colorspace_settings.name = "Non-Color"
        image.pixels.foreach_set(pixels.ravel())
        image.file_format = "PNG"
        image.filepath_raw = str(OUTPUT / (key+".png"))
        image.save()
        image.pack()
        result[key] = image
    return result


def material_set(images):
    result = {}
    occlusion = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    occlusion.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    for name, (_, roughness, metallic, scale) in SURFACES.items():
        material = bpy.data.materials.new("heavy-"+name)
        material.use_nodes = True
        nodes, links = material.node_tree.nodes, material.node_tree.links
        shader = nodes.get("Principled BSDF")
        textures = {}
        for key, image in images.items():
            texture = nodes.new("ShaderNodeTexImage")
            texture.image = image
            texture.interpolation = "Linear"
            textures[key] = texture
        links.new(textures["baseColor"].outputs["Color"], shader.inputs["Base Color"])
        normal = nodes.new("ShaderNodeNormalMap")
        normal.inputs["Strength"].default_value = scale
        links.new(textures["normal"].outputs["Color"], normal.inputs["Color"])
        links.new(normal.outputs["Normal"], shader.inputs["Normal"])
        separate = nodes.new("ShaderNodeSeparateColor")
        links.new(textures["orm"].outputs["Color"], separate.inputs[0])
        for channel, factor, socket in (("Green", roughness, "Roughness"), ("Blue", metallic, "Metallic")):
            multiply = nodes.new("ShaderNodeMath")
            multiply.operation = "MULTIPLY"
            multiply.inputs[1].default_value = factor
            links.new(separate.outputs[channel], multiply.inputs[0])
            links.new(multiply.outputs[0], shader.inputs[socket])
        output = nodes.new("ShaderNodeGroup")
        output.node_tree = occlusion
        links.new(separate.outputs["Red"], output.inputs["Occlusion"])
        result[name] = material
    return result


def region(obj):
    name = obj.name
    if name.startswith("HumanAnatomy-Deform"):
        return "skin"
    if name == "Tunic":
        return "cloth"
    if name == "Mail shirt":
        return "mail"
    if name.startswith("Helmet") or name in ("Shield boss", "Sword pommel", "Sword guard"):
        return "bronze"
    if name == "Sword blade" or name.startswith("Shield grip support"):
        return "iron"
    if name == "Shield handgrip":
        return "wood"
    if name == "Convex oval shield":
        return "shield-hide"
    if name.startswith("Sandal") or name in ("Waist belt", "Sword grip", "Scabbard"):
        return "leather"
    raise ValueError("Unassigned heavy source part: "+name)


def author_surfaces(objects):
    """Material/UV authoring seam, callable before the geometry export-copy join."""
    OUTPUT.mkdir(parents=True, exist_ok=True)
    materials = material_set(atlas_images())
    names = list(SURFACES)
    for obj in objects:
        name = region(obj)
        obj.data.materials.clear()
        obj.data.materials.append(materials[name])
        if obj.name == "Convex oval shield":
            obj.data.materials.append(materials["wood"])
            obj.data.materials.append(materials["bronze"])
        uv = obj.data.uv_layers.active
        if uv is None:
            raise ValueError(obj.name+": author UV0 before surface assignment")
        for polygon in obj.data.polygons:
            # Front hide, exposed wooden back: material identity follows authored
            # faces, not RGB. Existing shield construction retains its actual rim.
            face_name = name
            if obj.name == "Convex oval shield":
                face_name = "wood" if polygon.center.y > -.132 else ("bronze" if polygon.center.y > -.155 else name)
            polygon.material_index = [name, "wood", "bronze"].index(face_name)
            tile = names.index(face_name)
            loops = list(polygon.loop_indices)
            garment_uv = []
            if name == "mail":
                # Partition by the authored garment region: a torso wrap cannot
                # describe a sleeve axis or horizontal collar without stretching.
                center = polygon.center
                sleeve = abs(center.x) > .20 and center.z < 1.45
                collar = center.z > 1.45
                for loop in loops:
                    p = obj.data.vertices[obj.data.loops[loop].vertex_index].co
                    if collar:
                        garment_uv.append((.5+p.x/1.2, .5+p.y/.72))
                    elif sleeve:
                        side = 1 if center.x > 0 else -1
                        along = side*(p.x-side*.22)*.60-(p.z-1.44)*.80
                        radial = side*(p.x-side*.22)*.80+(p.z-1.44)*.60
                        angle = math.atan2(radial, p.y+.005)
                        garment_uv.append((.5+angle*.095/1.2, .45+along/.72))
                    else:
                        garment_uv.append((math.atan2(p.x/.23, -p.y/.16)/math.tau+.5,
                                           (p.z-.84)/.72))
                if not sleeve and not collar and max(u for u, v in garment_uv)-min(u for u, v in garment_uv) > .5:
                    garment_uv = [(u+1 if u < .5 else u, v) for u, v in garment_uv]
            for loop_index in polygon.loop_indices:
                u, v = garment_uv[loops.index(loop_index)] if garment_uv else uv.data[loop_index].uv
                if garment_uv:
                    v = min(1, max(0, v))
                uv.data[loop_index].uv = (
                    (tile%4*TILE[0]+GUTTER+u*(TILE[0]-2*GUTTER))/(4*TILE[0]),
                    (tile//4*TILE[1]+GUTTER+v*(TILE[1]-2*GUTTER))/(2*TILE[1]))
        # Restrained identification on painted shield; armor stays metal.
        mask = obj.data.attributes.new(name="_FACTION_MASK", type="FLOAT", domain="POINT")
        for vertex, value in zip(obj.data.vertices, mask.data):
            # Follow the existing concentric shield loops: a painted border stays
            # smooth without inventing geometry solely to sharpen a vertex mask.
            radius = math.hypot((vertex.co.x-.565)/.31, (vertex.co.z-.93)/.50)
            value.value = .14 if name == "shield-hide" and vertex.co.y < -.16 and .60 < radius < .86 else 0
