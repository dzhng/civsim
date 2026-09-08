import bpy
import importlib.util
import math
import sys
from pathlib import Path
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[2]
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('motion',ROOT/'packages/soldier-assets/bake/blender-heavy-motion.py')
motion=importlib.util.module_from_spec(spec)
spec.loader.exec_module(motion)
source=ROOT/'throwaway/heavy-death/control/heavy-kit.blend'
with bpy.data.libraries.load(str(source)) as (data,target):
    target.scenes=[next(n for n in data.scenes if n in ('HeavyKitCandidate','HeavyMotionCandidate'))]
scene=target.scenes[0]
bpy.context.window.scene=scene
arm=next(o for o in scene.objects if o.type=='ARMATURE')
controls,base,feet,soles=motion.begin_ready_action(arm,scene,'death','heavy-death-study')
ankles={s:arm.pose.bones['foot.'+s].head.copy() for s in ('L','R')}

# Coarse supported poses only. Intermediates have not earned a motion verdict.
for frame,x,z,roll in [(0,0,.88,0),(6,.02,.78,4),(14,.09,.60,25),(24,.20,.32,65),(33,.24,.25,85),(42,.24,.278,90)]:
    scene.frame_set(frame)
    for bone in arm.pose.bones:
        bone.rotation_euler,bone.location=base[bone.name]
    if frame:
        pelvis=arm.pose.bones['pelvis']
        pelvis.location=pelvis.bone.matrix_local.to_3x3().inverted()@(Vector((x,.015,z))-pelvis.bone.head_local)
        rotation=Matrix.Rotation(math.radians(roll),3,'Y').to_quaternion()
        motion.orient(arm,'pelvis',rotation@pelvis.bone.matrix_local.to_quaternion())
        if frame<=14:
            upper=arm.pose.bones['upper-arm.L']
            direction=upper.tail-upper.head
            forearm_rotation=arm.pose.bones['forearm.L'].matrix.to_quaternion()
            motion.orient(arm,'upper-arm.L',direction.rotation_difference(direction+Vector((0,-.25,0)))@upper.matrix.to_quaternion())
            motion.orient(arm,'forearm.L',forearm_rotation)
        if frame>=24:
            motion.aim(arm,'upper-arm.L',(.1,-1,.4))
            motion.shield_forearm(arm,(-.3,-1,-.15),(0,0,1))
            motion.aim(arm,'upper-arm.R',(-.2,.8,-.4) if frame>=33 else (-.15,.75,.10),-math.pi/4)
            motion.aim(arm,'forearm.R',(.7,.7,-.1) if frame>=33 else (.8,.5,.05),0)
            if frame>=33:
                for name,angle in [('neck',10),('head',20)]:
                    motion.orient(arm,name,rotation@Matrix.Rotation(math.radians(angle),3,'Y').to_quaternion()@arm.data.bones[name].matrix_local.to_quaternion())
        for side in ('L','R'):
            if frame<=14:
                ankle,foot_rotation=ankles[side],feet[side]
            else:
                foot_rotation=rotation@feet[side]
                foot=arm.data.bones['foot.'+side]
                transform=foot_rotation.to_matrix()@foot.matrix_local.to_3x3().inverted()
                offsets=[transform@(v.co-foot.head_local) for v in soles[side].data.vertices]
                ankle=Vector((-.50 if side=='L' else -.40,-.15 if side=='L' else .18,
                              .005-min(p.z for p in offsets)))
            motion.place_supported_leg(arm,side,ankle)
            motion.orient(arm,'foot.'+side,foot_rotation)
    for bone in arm.pose.bones:
        bone.keyframe_insert('rotation_euler',frame=frame)
        bone.keyframe_insert('location',frame=frame)
motion.finish_ready_action(arm,'death','heavy-death-study',None,controls)
motion.anatomy.export_candidate(scene.objects['HeavyKit-Deform'],arm,ROOT/'throwaway/heavy-death/g','heavy-kit')
