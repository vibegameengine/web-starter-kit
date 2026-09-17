import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

CONTACT_HEIGHT_FRACTION = 0.3
ALREADY_TRAVELS = 0.1


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


def stance_steps(samples, index, seconds_per_frame):
    threshold = contact_threshold(samples, index)
    steps = []
    for previous, current in zip(samples, samples[1:]):
        if previous['feet'][index].z > threshold or current['feet'][index].z > threshold:
            continue
        step = (current['feet'][index] - previous['feet'][index]) - (current['hips'] - previous['hips'])
        steps.append(Vector((step.x, step.y, 0.0)) / seconds_per_frame)
    return steps


def median(values):
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def step_length_speed(samples, seconds_per_frame):
    widest = 0.0
    for sample in samples:
        gap = sample['feet'][0] - sample['feet'][1]
        widest = max(widest, Vector((gap.x, gap.y, 0.0)).length)
    duration = len(samples) * seconds_per_frame
    return (widest * 2.0) / duration if duration > 0 else 0.0


def planted_steps(samples, seconds_per_frame):
    thresholds = [contact_threshold(samples, index) for index in range(len(samples[0]['feet']))]
    steps = []
    for previous, current in zip(samples, samples[1:]):
        best = None
        for index in range(len(current['feet'])):
            if previous['feet'][index].z > thresholds[index] or current['feet'][index].z > thresholds[index]:
                continue
            step = (current['feet'][index] - previous['feet'][index]) - (current['hips'] - previous['hips'])
            flat = Vector((step.x, step.y, 0.0)) / seconds_per_frame
            if best is None or flat.length > best.length:
                best = flat
        if best is not None:
            steps.append(best)
    return steps


def travel_axis(samples, seconds_per_frame):
    steps = planted_steps(samples, seconds_per_frame)
    if not steps:
        raise SystemExit('clip has no stance frames, so its travel direction cannot be measured')
    drift = Vector((0.0, 0.0, 0.0))
    for step in steps:
        drift += step
    if drift.length < 1e-4:
        raise SystemExit('clip feet do not slide against the hips, so it carries no walk')
    return -drift.normalized()


def measure_ground_motion(samples, seconds_per_frame):
    axis = travel_axis(samples, seconds_per_frame)
    speed = step_length_speed(samples, seconds_per_frame)
    if speed < 1e-4:
        raise SystemExit('clip feet never separate, so it carries no step')
    return axis, speed


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


def residual_ground_speed(armature, hips, feet, frames, seconds_per_frame, axis):
    """Signed world speed of the foot that is standing most still, median over the clip.

    The planted foot is defined physically - the one whose WORLD velocity is
    smallest - so this shares no arithmetic with the estimator it checks.
    """
    samples = sample_frames(armature, hips, feet, frames)
    thresholds = [contact_threshold(samples, index) for index in range(len(feet))]
    stillest = []
    for previous, current in zip(samples, samples[1:]):
        best = None
        for index in range(len(feet)):
            if previous['feet'][index].z > thresholds[index] or current['feet'][index].z > thresholds[index]:
                continue
            step = (current['feet'][index] - previous['feet'][index]) / seconds_per_frame
            flat = Vector((step.x, step.y, 0.0))
            if best is None or flat.length < best.length:
                best = flat
        if best is not None:
            stillest.append(best.dot(axis))
    return median(stillest)


def export_glb(target):
    bpy.ops.export_scene.gltf(
        filepath=str(target),
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_apply=False,
        export_yup=True,
    )


def sweep_ground_speed(armature, hips, feet, frames, origins, axis, rest, seconds_per_frame, candidates):
    """Bake each candidate speed and report how still the stillest foot is.

    The objective shares nothing with any estimator: a correct speed leaves one
    foot standing in world space, so the median of the per-frame minimum world
    foot speed is the thing to minimise.
    """
    curve = []
    for candidate in candidates:
        bake_root_motion(hips, frames, origins, axis, candidate, rest, seconds_per_frame)
        samples = sample_frames(armature, hips, feet, frames)
        thresholds = [contact_threshold(samples, index) for index in range(len(feet))]
        stillest = []
        for previous, current in zip(samples, samples[1:]):
            best = None
            for index in range(len(feet)):
                if previous['feet'][index].z > thresholds[index] or current['feet'][index].z > thresholds[index]:
                    continue
                step = (current['feet'][index] - previous['feet'][index]) / seconds_per_frame
                flat = Vector((step.x, step.y, 0.0)).length
                if best is None or flat < best:
                    best = flat
            if best is not None:
                stillest.append(best)
        curve.append((candidate, median(stillest)))
    return curve


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
    duration = len(frames) * seconds_per_frame
    rootTravel = (samples[-1]['hips'] - samples[0]['hips'])
    rootSpeed = Vector((rootTravel.x, rootTravel.y, 0.0)).length / duration
    if rootSpeed > ALREADY_TRAVELS:
        action.name = target.stem
        export_glb(target)
        return {
            'baked': False,
            'clip': target.stem,
            'forward': [round(value, 4) for value in Vector((rootTravel.x, rootTravel.y, 0.0)).normalized()],
            'frames': len(frames),
            'fps': scene.render.fps,
            'residualsAlongForward': [0.0],
            'speed': round(rootSpeed, 4),
        }

    forward, speed = measure_ground_motion(samples, seconds_per_frame)
    strideSpeed = step_length_speed(samples, seconds_per_frame)
    rest = (armature.matrix_world.to_3x3() @ armature.data.bones[hips.name].matrix_local.to_3x3()).inverted()
    origins = original_hips_locations(armature, hips, frames)

    sweep = sweep_ground_speed(
        armature, hips, feet, frames, origins, forward, rest, seconds_per_frame,
        [round(0.6 + 0.1 * step, 2) for step in range(0, 25)],
    )
    best_candidate, best_error = min(sweep, key=lambda row: row[1])
    speed = best_candidate

    residuals = []
    hipsTravel = []
    for _ in range(4):
        bake_root_motion(hips, frames, origins, forward, speed, rest, seconds_per_frame)
        moved = sample_frames(armature, hips, feet, [frames[0], frames[-1]])
        hipsTravel.append(round((moved[-1]['hips'] - moved[0]['hips']).length, 4))
        residual = residual_ground_speed(armature, hips, feet, frames, seconds_per_frame, forward)
        residuals.append(round(residual, 4))
        if abs(residual) < 0.01:
            break
        speed -= residual

    action.name = target.stem
    export_glb(target)

    return {
        'baked': True,
        'clip': target.stem,
        'strideSpeed': round(strideSpeed, 4),
        'sweepBest': [best_candidate, round(best_error, 4)],
        'sweepCurve': [[row[0], round(row[1], 3)] for row in sweep if row[0] in (0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0)],
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
