import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

CONTACT_HEIGHT_FRACTION = 0.3


def clear_scene():
    bpy.ops.wm.read_homefile(use_empty=True)


def import_clip(path):
    bpy.ops.import_scene.fbx(filepath=str(path), automatic_bone_orientation=True)
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            return obj
    raise SystemExit('no armature in %s' % path)


def bone_named(armature, suffix):
    for bone in armature.pose.bones:
        if bone.name.lower().endswith(suffix):
            return bone
    raise SystemExit('rig has no bone ending in %s' % suffix)


def world_head(armature, bone):
    return armature.matrix_world @ bone.matrix @ Vector((0.0, 0.0, 0.0))


def sample_frames(armature, hips, feet, frames):
    samples = []
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        samples.append({
            'frame': frame,
            'hips': world_head(armature, hips).copy(),
            'feet': [world_head(armature, foot).copy() for foot in feet],
        })
    return samples


def contact_threshold(samples, index):
    heights = [sample['feet'][index].z for sample in samples]
    return min(heights) + (max(heights) - min(heights)) * CONTACT_HEIGHT_FRACTION


def stance_travel(samples, index, seconds_per_frame):
    threshold = contact_threshold(samples, index)
    travel = Vector((0.0, 0.0, 0.0))
    counted = 0
    for previous, current in zip(samples, samples[1:]):
        if previous['feet'][index].z > threshold or current['feet'][index].z > threshold:
            continue
        step = (current['feet'][index] - previous['feet'][index]) - (current['hips'] - previous['hips'])
        travel += Vector((step.x, step.y, 0.0))
        counted += 1
    if counted == 0:
        raise SystemExit('clip has no stance frames, so its ground speed cannot be measured')
    return travel / (counted * seconds_per_frame)


def measure_ground_motion(samples, seconds_per_frame):
    drift = Vector((0.0, 0.0, 0.0))
    for index in range(len(samples[0]['feet'])):
        drift += stance_travel(samples, index, seconds_per_frame)
    drift /= len(samples[0]['feet'])
    speed = drift.length
    if speed < 1e-4:
        raise SystemExit('clip feet do not slide against the hips, so it carries no walk')
    return -drift / speed, speed


def original_hips_locations(armature, hips, frames):
    locations = []
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        locations.append(hips.location.copy())
    return locations


def bake_root_motion(hips, frames, origins, forward, speed, rest, seconds_per_frame):
    for order, frame in enumerate(frames):
        bpy.context.scene.frame_set(frame)
        offset = forward * speed * (order * seconds_per_frame)
        hips.location = origins[order] + rest @ offset
        hips.keyframe_insert(data_path='location', frame=frame)


def residual_ground_speed(armature, hips, feet, frames, seconds_per_frame):
    samples = sample_frames(armature, hips, feet, frames)
    residual = Vector((0.0, 0.0, 0.0))
    for index in range(len(feet)):
        threshold = contact_threshold(samples, index)
        travel = Vector((0.0, 0.0, 0.0))
        counted = 0
        for previous, current in zip(samples, samples[1:]):
            if previous['feet'][index].z > threshold or current['feet'][index].z > threshold:
                continue
            step = current['feet'][index] - previous['feet'][index]
            travel += Vector((step.x, step.y, 0.0))
            counted += 1
        if counted:
            residual += travel / (counted * seconds_per_frame)
    return residual / len(feet)


def export_glb(target):
    bpy.ops.export_scene.gltf(
        filepath=str(target),
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_apply=False,
        export_yup=True,
    )


def process(source, target):
    clear_scene()
    armature = import_clip(source)
    scene = bpy.context.scene
    seconds_per_frame = 1.0 / scene.render.fps
    hips = bone_named(armature, 'hips')
    feet = [bone_named(armature, 'leftfoot'), bone_named(armature, 'rightfoot')]
    action = armature.animation_data.action
    first, last = (int(round(value)) for value in action.frame_range)
    frames = list(range(first, last + 1))

    samples = sample_frames(armature, hips, feet, frames)
    forward, speed = measure_ground_motion(samples, seconds_per_frame)
    rest = (armature.matrix_world.to_3x3() @ armature.data.bones[hips.name].matrix_local.to_3x3()).inverted()
    origins = original_hips_locations(armature, hips, frames)

    residuals = []
    hipsTravel = []
    for _ in range(4):
        bake_root_motion(hips, frames, origins, forward, speed, rest, seconds_per_frame)
        moved = sample_frames(armature, hips, feet, [frames[0], frames[-1]])
        hipsTravel.append(round((moved[-1]['hips'] - moved[0]['hips']).length, 4))
        residual = residual_ground_speed(armature, hips, feet, frames, seconds_per_frame)
        residuals.append(round(residual.dot(forward), 4))
        if abs(residual.dot(forward)) < 0.01:
            break
        speed -= residual.dot(forward)

    action.name = target.stem
    export_glb(target)

    return {
        'clip': target.stem,
        'forward': [round(value, 4) for value in forward],
        'frames': len(frames),
        'fps': scene.render.fps,
        'hipsTravel': hipsTravel,
        'residualsAlongForward': residuals,
        'speed': round(speed, 4),
    }


def main():
    arguments = sys.argv[sys.argv.index('--') + 1:]
    if len(arguments) != 2:
        raise SystemExit('usage: blender -b -P blender-bake-root-motion.py -- <source.fbx> <target.glb>')
    report = process(Path(arguments[0]), Path(arguments[1]))
    print('BAKE_REPORT ' + json.dumps(report))


main()
