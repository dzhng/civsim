import bpy
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[5]
source = root/'packages/soldier-assets/assets/source/heavy-surfaces'
def read(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(path)) as (available, requested):
        requested.scenes = ['HeavyKitCandidate']
    scene = requested.scenes[0]
    bpy.context.window.scene = scene
    scene.frame_set(0)
    parts = {}
    for obj in scene.objects:
        if obj.type != 'MESH' or obj.name in ('HeavyKit-Deform', 'HeavySurfaces-Deform', 'HumanAnatomy-Sculpt'):
            continue
        parts[obj.name] = {
            'positions': [list(v.co) for v in obj.data.vertices],
            'faces': [list(p.vertices) for p in obj.data.polygons],
            'weights': [[(g.group,g.weight) for g in v.groups] for v in obj.data.vertices],
            'groups': [g.name for g in obj.vertex_groups],
            'matrix': [list(row) for row in obj.matrix_world],
        }
    arm = next(obj for obj in scene.objects if obj.type=='ARMATURE')
    bones = [(b.name,b.parent.name if b.parent else None,[list(row) for row in b.matrix_local]) for b in arm.data.bones]
    return {'parts':parts,'bones':bones}

before, after = read(source/'clay-input.blend'), read(source/'heavy-surfaces.blend')
assert before == after, 'Surface authoring changed source geometry, groups, weights, transforms or rig'
result = {'sourceSha256':hashlib.sha256((source/'clay-input.blend').read_bytes()).hexdigest(),
    'partsCompared':len(before['parts']), 'bonesCompared':len(before['bones']),
    'sourceGeometryWeightsTransformsRigIdentical':True}
out = root/'specs/battle-model-quality/assets/evidence/10/source-check.json'
out.write_text(json.dumps(result,indent=2)+'\n')
print(result)
