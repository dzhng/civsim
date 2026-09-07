"""Original row14 leather equipment and two-hand carry on the retained human rig.

The committed modular heavy is a donor, never procedurally regenerated here.
This candidate does not promote a production appearance or accept shared anatomy.
"""
import hashlib
import importlib.util
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector, geometry
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "assets/source/heavy-kit/heavy-kit.blend"
OUTPUT = HERE.parent / "assets/source/medium-phalanx"


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    result = importlib.util.module_from_spec(spec)
    sys.dont_write_bytecode = True
    spec.loader.exec_module(result)
    return result


anatomy = module("anatomy", "blender-human-anatomy.py")
motion = module("motion", "blender-heavy-motion.py")
surfaces = module("surfaces", "blender-heavy-surfaces.py")


def build():
    if "MediumPhalanxCandidate" in bpy.data.scenes:
        raise RuntimeError("Build in a fresh Blender session")
    with bpy.data.libraries.load(str(SOURCE)) as (data, target):
        target.scenes = ["HeavyKitCandidate"]
    scene = target.scenes[0]
    scene.name = "MediumPhalanxCandidate"
    scene["equipment_donor_sha256"] = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.context.window.scene = scene
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    body = next(o for o in scene.objects if o.name == "HumanAnatomy-Deform")
    tunic = next(o for o in scene.objects if o.name == "Tunic")
    keep = [o for o in scene.objects if o.type == "MESH" and (
        o == body or o == tunic or o.name.startswith(("Helmet", "Sandal", "Scabbard"))
        or o.name == "Waist belt")]
    for obj in list(scene.objects):
        if obj.type == "MESH" and obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    # Keep the saved donor actions intact; new carry keys have a distinct owner.
    arm.animation_data.action = None
    for track in arm.animation_data.nla_tracks:
        track.mute = True
    for bone in arm.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    body.data.calc_loop_triangles()
    body_faces = [tuple(t.vertices) for t in body.data.loop_triangles]
    body_support = BVHTree.FromPolygons([v.co for v in body.data.vertices],body_faces,all_triangles=True)
    for obj in keep:
        obj.hide_set(False)
        obj.hide_render = False

    # Medium14 uses a sleeveless under-tunic with finished armholes beneath
    # leather shoulder fastenings. This is a deliberate construction choice,
    # not a claim that the shared body's shoulder deformation is accepted.
    # Connected components isolate the old torso/hem as a lower-weight donor.
    links = [[] for _ in tunic.data.vertices]
    for edge in tunic.data.edges:
        a, b = edge.vertices
        links[a].append(b)
        links[b].append(a)
    remaining = set(range(len(links)))
    components = []
    while remaining:
        component, pending = set(), [next(iter(remaining))]
        while pending:
            i = pending.pop()
            if i not in component:
                component.add(i)
                pending.extend(links[i])
        remaining -= component
        components.append(component)
    torso_vertices = set().union(*(component for component in components
        if min(tunic.data.vertices[i].co.z for i in component) <= 1.1))
    donor = tunic.data
    donor_groups = [group.name for group in tunic.vertex_groups]
    donor.calc_loop_triangles()
    donor_faces = [tuple(t.vertices) for t in donor.loop_triangles
                   if all(i in torso_vertices for i in t.vertices)]
    donor_tree = BVHTree.FromPolygons([v.co for v in donor.vertices],donor_faces,all_triangles=True)
    rows = [(.730,.230,.175),(.745,.230,.175),(.900,.219,.167),
            (1.035,.192,.148),(1.190,.220,.170),(1.270,.197,.155),
            (1.400,.174,.135),(1.490,.115,.087),(1.530,.077,.075)]
    segments = 16
    vertices = []
    for z,w,d in rows:
        for j in range(segments):
            angle = math.tau*j/segments
            hang = max(0,min(1,(1.04-z)/.22))
            fold = .008*hang*math.cos(8*angle+.35)
            vertices.append(((w+fold)*math.cos(angle),.005+(d+fold)*math.sin(angle),
                             z+.009*hang*math.cos(2*angle)))
    faces = []
    for i in range(len(rows)-1):
        for j in range(segments):
            if i in (5,6) and j in (15,0,7,8):
                continue
            faces.append((i*segments+j,i*segments+(j+1)%segments,
                          (i+1)*segments+(j+1)%segments,(i+1)*segments+j))
    mesh = bpy.data.meshes.new("Sleeveless under-tunic")
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    tunic.data = mesh
    tunic.modifiers.clear()
    tunic.vertex_groups.clear()
    for name in donor_groups:
        tunic.vertex_groups.new(name=name)
    mesh.materials.append(donor.materials[0])
    bpy.ops.object.select_all(action="DESELECT")
    tunic.select_set(True)
    bpy.context.view_layer.objects.active = tunic
    sub = tunic.modifiers.new("Tailored cloth curvature","SUBSURF")
    sub.levels = 3
    bpy.ops.object.modifier_apply(modifier=sub.name)
    # Front/back panels fold continuously over the shoulder roof. Rays follow
    # that construction frame rather than switching abruptly between axes or
    # collapsing samples onto a nearest shoulder-boundary vertex.
    construction_normals = [vertex.normal.copy() for vertex in mesh.vertices]
    fitted_support = {}
    for vertex in mesh.vertices:
        sign = 1 if vertex.co.y>=.005 else -1
        roof = min(1,max(0,(vertex.co.z-1.42)/.06))
        roof = roof*roof*(3-2*roof)
        direction = Vector((0,sign,0)).lerp(construction_normals[vertex.index],roof).normalized()
        point,_,face,_ = body_support.ray_cast(vertex.co+direction*.3,-direction,.6)
        if point is not None and (vertex.co-point).dot(direction)<.009:
            vertex.co = point+direction*.009
        if vertex.co.z>=1.08:
            if point is None:
                point,_,face,_ = body_support.find_nearest(vertex.co)
            fitted_support[vertex.index] = point,face
    mesh.update()
    outer_count = len(mesh.vertices)
    for vertex in mesh.vertices:
        # Transition from cinched lower garment to body-supported upper panels
        # continuously; a hard donor seam creases beneath a coarser armor mesh.
        upper = min(1,max(0,(vertex.co.z-1.08)/.16))
        upper = upper*upper*(3-2*upper)
        supports = []
        if vertex.index in fitted_support:
            point,face = fitted_support[vertex.index]
            corners = [body.data.vertices[k] for k in body_faces[face]]
            group_names = [g.name for g in body.vertex_groups]
            supports.append((point,corners,group_names,upper))
        if upper<1:
            point,_,face,_ = donor_tree.find_nearest(vertex.co)
            corners = [donor.vertices[k] for k in donor_faces[face]]
            supports.append((point,corners,donor_groups,1-upper))
        weights = {}
        for point,corners,group_names,share in supports:
            blend = geometry.barycentric_transform(point,*(v.co for v in corners),
                Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
            for corner,fraction in zip(corners,blend):
                for entry in corner.groups:
                    name = group_names[entry.group]
                    weights[name] = weights.get(name,0)+entry.weight*max(0,fraction)*share
        weights = sorted(weights.items(),key=lambda item:-item[1])[:4]
        total = sum(weight for _,weight in weights)
        for name,weight in weights:
            tunic.vertex_groups[name].add([vertex.index],weight/total,"REPLACE")
    solid = tunic.modifiers.new("Cloth thickness","SOLIDIFY")
    solid.thickness,solid.offset = .003,-1
    bpy.ops.object.modifier_apply(modifier=solid.name)
    for face in mesh.polygons:
        face.use_smooth = True
    tunic.modifiers.new("Shared fixed rig","ARMATURE").object = arm
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=.03)
    bpy.ops.object.mode_set(mode="OBJECT")
    tile = list(surfaces.SURFACES).index("cloth")
    tw,th = surfaces.TILE
    gutter = surfaces.GUTTER
    for loop in mesh.uv_layers.active.data:
        u,v = loop.uv
        loop.uv = ((tile%4*tw+gutter+u*(tw-2*gutter))/(4*tw),
                   (tile//4*th+gutter+v*(th-2*gutter))/(2*th))
    tunic.data.update()
    tunic.data.calc_loop_triangles()
    # Armor rests on the outside of the lining. Including its solidified
    # inner shell can select an inward normal and push buried leather deeper.
    torso_faces = [tuple(t.vertices) for t in tunic.data.loop_triangles
                   if all(i<outer_count for i in t.vertices)]
    torso_support = BVHTree.FromPolygons([v.co for v in tunic.data.vertices],torso_faces,all_triangles=True)
    support_normals = [Vector() for _ in tunic.data.vertices]
    for face in torso_faces:
        a,b,c = (tunic.data.vertices[i].co for i in face)
        normal = (b-a).cross(c-a)
        for i in face:
            support_normals[i] += normal
    support_normals = [normal.normalized() for normal in support_normals]
    materials = {name: next(m for m in bpy.data.materials if m.name == "heavy-"+name)
                 for name in surfaces.SURFACES}

    def supported_point(vertex):
        point, _, face, _ = torso_support.find_nearest(vertex.co)
        corners = [tunic.data.vertices[i] for i in torso_faces[face]]
        blend = geometry.barycentric_transform(point, *(v.co for v in corners),
            Vector((1,0,0)), Vector((0,1,0)), Vector((0,0,1)))
        normal = sum((support_normals[v.index]*w for v,w in zip(corners,blend)),Vector()).normalized()
        return point, normal, corners, blend

    def assign_weights(obj, bone=None, supports=None):
        if bone:
            obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))), 1, "REPLACE")
        else:
            groups = {g.index: obj.vertex_groups.new(name=g.name) for g in tunic.vertex_groups}
            for vertex in obj.data.vertices:
                _, _, corners, blend = supports[vertex.index] if supports is not None else supported_point(vertex)
                weights = {}
                for corner, fraction in zip(corners, blend):
                    for entry in corner.groups:
                        weights[entry.group] = weights.get(entry.group,0)+entry.weight*max(0,fraction)
                weights = sorted(weights.items(), key=lambda item:-item[1])[:4]
                total = sum(w for _,w in weights)
                for group, weight in weights:
                    groups[group].add([vertex.index], weight/total, "REPLACE")

    def finish(obj, material, bone=None):
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for face in obj.data.polygons:
            face.use_smooth = True
        obj.data.materials.append(materials[material])
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=.03)
        bpy.ops.object.mode_set(mode="OBJECT")
        tile = list(surfaces.SURFACES).index(material)
        tile_w,tile_h = surfaces.TILE
        gutter = surfaces.GUTTER
        for loop in obj.data.uv_layers.active.data:
            u,v = loop.uv
            loop.uv = ((tile%4*tile_w+gutter+u*(tile_w-2*gutter))/(4*tile_w),
                       (tile//4*tile_h+gutter+v*(tile_h-2*gutter))/(2*tile_h))
        if not obj.vertex_groups:
            assign_weights(obj,bone)
        obj.parent = arm
        obj.modifiers.new("Shared fixed rig", "ARMATURE").object = arm
        keep.append(obj)
        return obj

    def shell(name, vertices, faces, material="leather", thickness=.005, bone=None, fit=True, surface_fit=None):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices,[],faces)
        mesh.update()
        obj = bpy.data.objects.new(name,mesh)
        scene.collection.objects.link(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        sub = obj.modifiers.new("Formed leather curvature","SUBSURF")
        sub.levels = 2
        bpy.ops.object.modifier_apply(modifier=sub.name)
        supports = None
        if surface_fit:
            surface_fit(mesh)
        elif fit:
            supports = {vertex.index:supported_point(vertex) for vertex in mesh.vertices}
            for vertex in mesh.vertices:
                point, normal, _, _ = supports[vertex.index]
                if (vertex.co-point).dot(normal) < .008:
                    vertex.co += normal*(.008-(vertex.co-point).dot(normal))
        # Inner and outer leather are one physical layer. Transfer the support
        # field once, then let solidification copy it to both sides of the edge.
        assign_weights(obj,bone,supports)
        solid = obj.modifiers.new("Leather edge thickness","SOLIDIFY")
        solid.thickness,solid.offset = thickness,0
        bpy.ops.object.modifier_apply(modifier=solid.name)
        return finish(obj,material,bone)

    def loft(name, rows, material, bone, across=(1,0,0), depth=(0,1,0), segments=24):
        return finish(anatomy.loft(name,rows,segments,across,depth),material,bone)

    # A cinching belt is a leather wall, not a solid torso-crossing cap.
    # Its lining support and inner return preserve the intended thickness.
    old_belt = scene.objects["Waist belt"]
    keep.remove(old_belt)
    bpy.data.objects.remove(old_belt,do_unlink=True)
    belt_heights = (1.026,1.031,1.061,1.066)
    belt_segments = 40
    belt_vertices = [( .201*math.cos(math.tau*j/belt_segments),
                      .005+.151*math.sin(math.tau*j/belt_segments),z)
                     for z in belt_heights for j in range(belt_segments)]
    belt_faces = [(i*belt_segments+j,i*belt_segments+(j+1)%belt_segments,
                   (i+1)*belt_segments+(j+1)%belt_segments,(i+1)*belt_segments+j)
                  for i in range(len(belt_heights)-1) for j in range(belt_segments)]
    def fit_belt(mesh):
        for vertex in mesh.vertices:
            axis = Vector((0,.005,vertex.co.z))
            radial = (vertex.co-axis).normalized()
            point,_,_,_ = torso_support.ray_cast(axis+radial*.4,-radial,.4)
            if point is None:
                raise ValueError("Waist belt misses its outer lining support")
            relief = .003*min(1,(vertex.co.z-belt_heights[0])/.005,
                                (belt_heights[-1]-vertex.co.z)/.005)
            # The belt passes over the 3 mm inner returns of the two suspension
            # loops. Local bends account for that stack, not extra global slack.
            loop_support = 0
            if vertex.co.x<0:
                for y in (.015,.115):
                    edge = min(1,max(0,(abs(vertex.co.y-y)-.012)/.016))
                    loop_support = max(loop_support,1-edge*edge*(3-2*edge))
            vertex.co = point+radial*(.003+max(0,relief)+.003*loop_support)
    belt = shell("Waist belt",belt_vertices,belt_faces,bone="pelvis",thickness=.003,
                 fit=False,surface_fit=fit_belt)
    belt.data.calc_loop_triangles()
    belt_support = BVHTree.FromPolygons([v.co for v in belt.data.vertices],
        [tuple(t.vertices) for t in belt.data.loop_triangles],all_triangles=True)
    for name,anchor_y in (("Scabbard suspension 0",.015),("Scabbard suspension 1",.115)):
        strap = scene.objects[name]
        old_belt_x = -.201*math.sqrt(1-((anchor_y-.005)/.151)**2)
        half = len(strap.data.vertices)//2
        for i in range(half):
            pair = (strap.data.vertices[i],strap.data.vertices[i+half])
            center = (pair[0].co+pair[1].co)*.5
            if min(v.co.z for v in pair)<=.985:
                continue
            y,z = center.y,min(1.061,max(1.031,center.z))
            cloth_point,_,_,_=torso_support.ray_cast(Vector((-.4,y,z)),Vector((1,0,0)),.4)
            belt_point,_,_,_=belt_support.ray_cast(Vector((-.4,y,1.046)),Vector((1,0,0)),.4)
            if cloth_point is None or belt_point is None:
                raise ValueError("Suspension loop misses its lining or belt support")
            across = min(1,max(0,(old_belt_x-center.x+.008)/.024))
            inner,outer = cloth_point.x-.0025,belt_point.x-.0025
            wrap = min(1,max(0,(across-.15)/.70))
            wrap = wrap*wrap*(3-2*wrap)
            target = inner+(outer-inner)*wrap
            blend = min(1,max(0,(center.z-.985)/.041))
            blend = blend*blend*(3-2*blend)
            arch = 0
            if center.z>1.052:
                arch_blend = min(1,(center.z-1.052)/.009)
                arch_blend = arch_blend*arch_blend*(3-2*arch_blend)
                arch = max(0,1.072-.012*(2*across-1)**4-center.z)*arch_blend
            displacement = Vector(((target-center.x)*blend,0,arch))
            # Translate each thickness pair together; lower sheath attachment
            # vertices, all weights, and the original wall vector stay exact.
            for vertex in pair:
                vertex.co += displacement
        strap.data.update()

    # Narrow folded bindings finish the two existing armholes. Their outer
    # contour is the retained opening, with a 6 mm strip on the cloth side;
    # they do not span the hole or manufacture coverage across the upper arm.
    edge_faces = {}
    for polygon in tunic.data.polygons:
        if all(i<outer_count for i in polygon.vertices):
            for edge in polygon.edge_keys:
                edge_faces.setdefault(edge,[]).append(polygon)
    boundary = {}
    for (a,b),polygons in edge_faces.items():
        if len(polygons)==1:
            boundary.setdefault(a,[]).append(b)
            boundary.setdefault(b,[]).append(a)
    if any(len(neighbors)!=2 for neighbors in boundary.values()):
        raise ValueError("Under-tunic openings are not closed boundary loops")
    remaining = set(boundary)
    armholes = 0
    while remaining:
        start = next(iter(remaining))
        path,previous,current = [start],None,start
        while True:
            following = next(i for i in boundary[current] if i!=previous)
            if following==start:
                break
            path.append(following)
            previous,current = current,following
        remaining -= set(path)
        center = sum((tunic.data.vertices[i].co for i in path),Vector())/len(path)
        if abs(center.x)<.12 or not 1.2<center.z<1.5:
            continue
        vertices,faces = [],[]
        for i in path:
            source = tunic.data.vertices[i]
            adjacent = [p for edge,polygons in edge_faces.items() if i in edge for p in polygons]
            normal = sum((p.normal for p in adjacent),Vector()).normalized()
            inward = sum((p.center-source.co for p in adjacent),Vector())
            inward = (inward-normal*inward.dot(normal)).normalized()
            vertices.extend((source.co+normal*.0015,source.co+normal*.0015+inward*.006))
        for j in range(len(path)):
            k = (j+1)%len(path)
            faces.append((j*2,k*2,k*2+1,j*2+1))
        mesh = bpy.data.meshes.new("Cloth armhole binding."+("L" if center.x>0 else "R"))
        mesh.from_pydata(vertices,[],faces)
        mesh.update()
        obj = bpy.data.objects.new(mesh.name,mesh)
        scene.collection.objects.link(obj)
        for group in tunic.vertex_groups:
            obj.vertex_groups.new(name=group.name)
        for j,i in enumerate(path):
            for entry in tunic.data.vertices[i].groups:
                obj.vertex_groups[entry.group].add([j*2,j*2+1],entry.weight,"REPLACE")
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        solid = obj.modifiers.new("Folded cloth binding","SOLIDIFY")
        solid.thickness,solid.offset = .0015,-1
        bpy.ops.object.modifier_apply(modifier=solid.name)
        finish(obj,"cloth")
        armholes += 1
    if armholes!=2:
        raise ValueError("Expected exactly two under-tunic armholes")

    def leather_patch(name,planes,offset):
        # The cuirass and fastenings share real lining support and its armholes.
        # Boundary cuts interpolate that same field, never project across a void.
        outer_faces = [tuple(p.vertices) for p in tunic.data.polygons
                       if all(i<outer_count for i in p.vertices)]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([v.co for v in list(tunic.data.vertices)[:outer_count]],[],outer_faces)
        mesh.update()
        normals = [v.normal.copy() for v in mesh.vertices]
        for vertex,normal in zip(mesh.vertices,normals):
            vertex.co += normal*offset
        obj = bpy.data.objects.new(mesh.name,mesh)
        scene.collection.objects.link(obj)
        for group in tunic.vertex_groups:
            obj.vertex_groups.new(name=group.name)
        for vertex in list(tunic.data.vertices)[:outer_count]:
            for entry in vertex.groups:
                obj.vertex_groups[entry.group].add([vertex.index],entry.weight,"REPLACE")
        bm = bmesh.new()
        bm.from_mesh(mesh)
        for point,normal in planes:
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                                  plane_co=point,plane_no=normal,clear_inner=True,dist=1e-7)
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context="VERTS")
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        solid = obj.modifiers.new("Leather edge thickness","SOLIDIFY")
        solid.thickness,solid.offset = .005,0
        bpy.ops.object.modifier_apply(modifier=solid.name)
        for vertex in mesh.vertices:
            weights = sorted(((g.group,g.weight) for g in vertex.groups),key=lambda item:-item[1])[:4]
            total = sum(weight for _,weight in weights)
            for group in obj.vertex_groups:
                group.remove([vertex.index])
            for index,weight in weights:
                obj.vertex_groups[index].add([vertex.index],weight/total,"REPLACE")
        return finish(obj,"leather")

    # A higher back supports the shoulder fastening; shared lining armholes
    # leave the axilla free. The lower edge finishes above the cinching belt.
    cuirass = leather_patch("Leather cuirass",[
        ((0,0,1.070),(0,0,1)),((0,0,1.440),(0,.14,-1))],.008)
    cuirass.data.calc_loop_triangles()
    cuirass_surface = BVHTree.FromPolygons([v.co for v in cuirass.data.vertices],
        [tuple(t.vertices) for t in cuirass.data.loop_triangles],all_triangles=True)
    for sign in (1,-1):
        leather_patch("Leather shoulder fastening."+str(sign),[
            ((sign*.099,0,0),(sign,0,0)),((sign*.190,0,0),(-sign,0,0)),
            ((0,0,1.395),(0,0,1))],.012)
        for z in (1.387,1.407):
            point,normal,_,_=cuirass_surface.ray_cast(Vector((sign*.143,-.4,z)),Vector((0,1,0)))
            if point is None:
                raise ValueError("Shoulder fastening stud misses its cuirass support")
            across = normal.cross(Vector((0,0,1))).normalized()
            depth = normal.cross(across).normalized()
            loft("Shoulder bronze stud",[(point+normal*d,.007,.007) for d in (.002,.009)],
                 "bronze",None,across=across,depth=depth,segments=16)
    # Individually cut hanging panels articulate with the lining rather than
    # forming the heavy's uninterrupted mail skirt.
    for j in range(16):
        angle = math.tau*(j+.5)/16
        vertices = []
        tip = .775+.018*abs(math.sin(angle))
        for z,w,d,width in [(1.040,.199,.151,.180),(1.030,.200,.152,.180),
                           (.900,.222,.171,.165),(tip+.012,.235,.182,.145),(tip,.233,.180,.135)]:
            for delta in (-width,-width*.86,width*.86,width):
                a = angle+delta
                rounded_end = .009*(abs(delta)/width)**8 if z==tip else 0
                vertices.append((w*math.cos(a),.005+d*math.sin(a),z+rounded_end))
        shell("Leather hanging panel %02d"%j,vertices,
              [(i*4+k,i*4+k+1,(i+1)*4+k+1,(i+1)*4+k) for i in range(4) for k in range(3)],fit=True)

    # The primary pike state still carries a sheathed sidearm. This is not the
    # separate row19 sword-in-hand presentation.
    for name, rows, material in (
        ("Sheathed sword grip",[(1.025,.017),(1.135,.017)],"leather"),
        ("Sheathed sword pommel",[(1.135,.019),(1.147,.024),(1.158,.010)],"bronze"),
        ("Sheathed sword guard",[(1.020,.045),(1.031,.045)],"bronze"),
    ):
        loft(name,[((-.227,.115,z),r,r*.7) for z,r in rows],material,"pelvis")

    # Offline two-link construction authors ordinary FK keys. No solver,
    # target, constraint, or new bone enters the exported skeleton.
    torso_turn = Matrix.Rotation(math.radians(-35),3,"Z")
    motion.orient(arm,"chest",torso_turn.to_quaternion()@arm.data.bones["chest"].matrix_local.to_quaternion())
    motion.orient(arm,"neck",arm.data.bones["neck"].matrix_local.to_quaternion())
    motion.orient(arm,"head",arm.data.bones["head"].matrix_local.to_quaternion())
    grips = {"R":Vector((-.270,-.020,1.03)),"L":Vector((-.270,-.360,1.15))}
    shaft_axis = (grips["L"]-grips["R"]).normalized()
    rest_grips = {side:Vector((sign*.5732,-.051,.9024)) for side,sign in (("L",1),("R",-1))}
    transforms = {}
    for side,sign in (("R",-1),("L",1)):
        rest_along,rest_across = Vector((sign*.6,0,-.8)),Vector((sign*.8,0,.6))
        along = Vector((-sign,-.2,-.1))
        across = shaft_axis*(-sign)
        source_basis = Matrix((rest_across,rest_along,rest_across.cross(rest_along))).transposed()
        hand = arm.data.bones["hand."+side]
        shoulder = arm.pose.bones["upper-arm."+side].head.copy()
        upper = arm.data.bones["upper-arm."+side].length
        lower = arm.data.bones["forearm."+side].length
        for _ in range(24):
            along = (along-shaft_axis*along.dot(shaft_axis)).normalized()
            target_basis = Matrix((across,along,across.cross(along))).transposed()
            rotation = target_basis@source_basis.transposed()
            wrist = grips[side]-rotation@(rest_grips[side]-hand.head_local)
            delta = wrist-shoulder
            distance = delta.length
            if not abs(upper-lower) < distance < upper+lower:
                raise ValueError(f"Unreachable {side} pike wrist: {distance}")
            forward = delta.normalized()
            pole = torso_turn@Vector((sign,-1,-.3) if side=="R" else (sign,-.5,-.5))
            pole = (pole-forward*pole.dot(forward)).normalized()
            a = (upper*upper-lower*lower+distance*distance)/(2*distance)
            elbow = shoulder+forward*a+pole*math.sqrt(upper*upper-a*a)
            approach = (wrist-elbow).normalized()
            along = along.lerp(approach,.5).normalized()
        print('WRIST_APPROACH',side,math.degrees(math.acos(max(-1,min(1,approach.dot(target_basis.col[1]))))))
        # Transport the shoulder's rest frame with the turned torso before
        # aiming the humerus. A fixed world-rest aim adds an unintended axial
        # twist when the chest turns substantially for the cross-body grip.
        upper_rest = torso_turn@arm.data.bones["upper-arm."+side].matrix_local.to_3x3()
        upper_rotation = upper_rest.col[1].rotation_difference((elbow-shoulder).normalized())@upper_rest.to_quaternion()
        motion.orient(arm,"upper-arm."+side,upper_rotation)
        motion.aim(arm,"forearm."+side,wrist-elbow)
        motion.orient(arm,"hand."+side,(rotation@hand.matrix_local.to_3x3()).to_quaternion())
        helper = arm.pose.bones["elbow-volume."+side]
        base = helper.parent.matrix@helper.parent.bone.matrix_local.inverted()@helper.bone.matrix_local
        motion.orient(arm,helper.name,base.to_quaternion().slerp(arm.pose.bones["forearm."+side].matrix.to_quaternion(),.5))
        transforms[side] = arm.pose.bones["hand."+side].matrix@hand.matrix_local.inverted()
        actual = transforms[side]@rest_grips[side]
        if (actual-grips[side]).length > .0001:
            raise ValueError(f"Pike palm target drift: {side} {tuple(actual)}")
    # The forearm shield bands are constructed on this declared carry surface.
    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    posed_body = evaluated.to_mesh()
    posed_body.calc_loop_triangles()
    carry_support = BVHTree.FromPolygons([v.co for v in posed_body.vertices],
        [tuple(t.vertices) for t in posed_body.loop_triangles],all_triangles=True)
    evaluated.to_mesh_clear()
    for frame in (0,30):
        for bone in arm.pose.bones:
            bone.keyframe_insert("rotation_euler",frame=frame)
            bone.keyframe_insert("location",frame=frame)
    action = arm.animation_data.action
    action.name = "pike-carry"
    action["author"] = "medium-phalanx"
    track = arm.animation_data.nla_tracks.new()
    track.name,track.mute = action.name,True
    strip = track.strips.new(action.name,0,action)
    strip.action_slot = action.slots[0]
    # Author the pike in its held pose, then inverse-bind to its rear hand.
    cross = shaft_axis.cross(Vector((0,0,1))).normalized()
    depth = shaft_axis.cross(cross).normalized()
    inverse = transforms["R"].inverted()
    for name,rows,material,segments in (
        ("Pike shaft",[(-1.10,.0175),(-1.08,.0175),(.36,.017),(3.12,.012)],"wood",24),
        ("Pike iron socket",[(3.10,.014),(3.25,.012)],"iron",24),
        ("Pike spearhead",[(3.24,.012),(3.34,.031),(3.53,.001)],"iron",4),
        ("Pike butt",[(-1.28,.001),(-1.12,.020),(-1.07,.019)],"iron",16),
    ):
        obj = loft(name,[(grips["R"]+shaft_axis*t,r,r if segments!=4 else .004) for t,r in rows],
                   material,"hand.R",cross,depth,segments)
        for vertex in obj.data.vertices:
            vertex.co = inverse@vertex.co

    # Small convex shield carried on the forearm. The two bands leave the
    # fingers unobstructed; complete-kit views retain this real occlusion.
    forearm = arm.pose.bones["forearm.L"]
    forearm_axis = (forearm.tail-forearm.head).normalized()
    # A proximal forearm mounting puts the hand and shaft beyond the rim;
    # the board keeps a protective forward face instead of becoming a tray.
    shield_normal = Vector((0,-1,0))
    shield_normal = (shield_normal-forearm_axis*shield_normal.dot(forearm_axis)).normalized()
    shield_center = forearm.head.lerp(forearm.tail,.05)+shield_normal*.100
    print("PIKE_SHIELD_PLANE_DISTANCE",(grips["L"]-shield_center).dot(shield_normal))
    shield_up = Vector((0,0,1))
    shield_up = (shield_up-shield_normal*shield_up.dot(shield_normal)).normalized()
    shield_across = shield_normal.cross(shield_up)
    fore_inverse = (forearm.matrix@forearm.bone.matrix_local.inverted()).inverted()
    shield = loft("Small round shield",[(shield_center+shield_normal*d,r,r) for d,r in
        [(-.014,.265),(0,.270),(.012,.263),(.055,.200),(.075,.100),(.080,.004)]],
        "shield-hide","forearm.L",shield_across,shield_up,48)
    shield.data.calc_loop_triangles()
    shield_support = BVHTree.FromPolygons([v.co for v in shield.data.vertices],
        [tuple(t.vertices) for t in shield.data.loop_triangles],all_triangles=True)
    for vertex in shield.data.vertices:
        vertex.co = fore_inverse@vertex.co
    for fraction in (.50,.78):
        center = forearm.head.lerp(forearm.tail,fraction)
        axis = (forearm.tail-forearm.head).normalized()
        across = axis.cross(Vector((0,0,1))).normalized()
        depth = axis.cross(across).normalized()
        vertices = [center+axis*edge+across*(.058*math.cos(math.tau*j/24))+depth*(.047*math.sin(math.tau*j/24))
                    for edge in (-.013,.013) for j in range(24)]
        def fit_band(mesh):
            for vertex in mesh.vertices:
                on_axis = center+axis*(vertex.co-center).dot(axis)
                radial = (vertex.co-on_axis).normalized()
                point,normal,_,_=carry_support.ray_cast(on_axis,radial,.15)
                if point is None:
                    raise ValueError("Forearm band misses its skin support")
                if normal.dot(radial)<=.05:
                    raise ValueError("Forearm band axis is outside its skin support")
                vertex.co = point+normal*.0045
        band = shell("Shield forearm band",vertices,[(j,(j+1)%24,(j+1)%24+24,j+24) for j in range(24)],
                     bone="forearm.L",thickness=.003,fit=False,surface_fit=fit_band)
        for vertex in band.data.vertices:
            vertex.co = fore_inverse@vertex.co
        skin_point,_,_,_=carry_support.ray_cast(center,shield_normal,.15)
        board_point,_,_,_=shield_support.ray_cast(center,shield_normal,.25)
        if skin_point is None or board_point is None:
            raise ValueError(f"Shield band attachment misses support: fraction={fraction}, skin={skin_point}, board={board_point}")
        start,end = skin_point+shield_normal*.006,board_point+shield_normal*.003
        tab = shell("Shield band attachment",
            [start.lerp(end,t)+axis*edge for t in (0,.08,.92,1) for edge in (-.013,.013)],
            [(i*2,i*2+1,i*2+3,i*2+2) for i in range(3)],bone="forearm.L",thickness=.003,fit=False)
        for vertex in tab.data.vertices:
            vertex.co = fore_inverse@vertex.co
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    copies = []
    for obj in keep:
        copy = obj.copy()
        copy.data = obj.data.copy()
        scene.collection.objects.link(copy)
        copy.select_set(True)
        copies.append(copy)
        obj.hide_set(True)
        obj.hide_render = True
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    runtime = copies[0]
    runtime.name = "MediumPhalanx-Deform"
    bm = bmesh.new()
    bm.from_mesh(runtime.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bm.to_mesh(runtime.data)
    bm.free()
    anatomy.export_candidate(runtime,arm,OUTPUT,"medium-phalanx")
    print({"source":str(OUTPUT),"parts":len(keep),"carry_grips":{k:list(v) for k,v in grips.items()}})


if __name__ == "__main__":
    build()
