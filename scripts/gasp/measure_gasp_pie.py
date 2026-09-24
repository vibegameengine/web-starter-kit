import json
import math
import os

import unreal

OUT = os.path.join(unreal.Paths.project_saved_dir(), 'gasp_measure')
os.makedirs(OUT, exist_ok=True)

PROGRAMME = [
    ('settle', 3.0, None, None),
    ('idle', 2.0, None, None),
    ('run_forward', 3.0, (0.0, 1.0), None),
    ('stop', 2.5, None, None),
    ('run_right', 3.0, (1.0, 0.0), None),
    ('run_back', 3.0, (0.0, -1.0), None),
    ('stop_again', 2.5, None, None),
    ('sprint_forward', 3.0, (0.0, 1.0), 'IA_Sprint'),
    ('stop_sprint', 2.5, None, None),
    ('walk_toggle', 0.2, None, 'IA_Walk'),
    ('walk_forward', 3.0, (0.0, 1.0), None),
    ('stop_walk', 2.5, None, None),
]
SHOTS = {('idle', 1.0), ('run_forward', 2.5), ('stop', 0.1), ('run_right', 0.4), ('run_back', 0.4), ('sprint_forward', 2.5), ('walk_forward', 2.5)}

state = {'phase': -1, 'phase_time': 0.0, 'frames': [], 'handle': None, 'started': False, 'wait': 0.0, 'shots': set(), 'forward': None}


def press(game, name, value=None):
    argument = f' X={value[0]} Y={value[1]}' if value else ''
    unreal.SystemLibrary.execute_console_command(game, f'Input.+action {name}{argument}')


def release(game, name):
    unreal.SystemLibrary.execute_console_command(game, f'Input.-action {name}')


def world():
    return unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()


def local(vector, yaw_degrees):
    yaw = math.radians(yaw_degrees)
    forward = vector.x * math.cos(yaw) + vector.y * math.sin(yaw)
    right = -vector.x * math.sin(yaw) + vector.y * math.cos(yaw)
    return forward, right, vector.z


def sample(game, pawn, name, delta):
    camera = unreal.GameplayStatics.get_player_camera_manager(game, 0)
    location = pawn.get_actor_location()
    yaw = pawn.get_actor_rotation().yaw
    velocity = pawn.get_velocity()
    camera_location = camera.get_camera_location()
    camera_rotation = camera.get_camera_rotation()
    offset = camera_location - location
    forward, right, up = local(offset, yaw)
    return {
        'camera_fov': camera.get_fov_angle(),
        'camera_offset_local': [forward, right, up],
        'camera_offset_world': [offset.x, offset.y, offset.z],
        'camera_pitch': camera_rotation.pitch,
        'camera_yaw': camera_rotation.yaw,
        'delta': delta,
        'phase': name,
        'phase_time': state['phase_time'],
        'position': [location.x, location.y, location.z],
        'speed': math.hypot(velocity.x, velocity.y),
        'vertical_speed': velocity.z,
        'yaw': yaw,
    }


def finish():
    with open(os.path.join(OUT, 'frames.json'), 'w', encoding='utf-8') as handle:
        json.dump(state['frames'], handle)
    unreal.log(f'gasp_measure: wrote {len(state["frames"])} frames')
    unreal.unregister_slate_post_tick_callback(state['handle'])
    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).editor_request_end_play()
    unreal.log('gasp_measure: done')
    unreal.SystemLibrary.quit_editor()


def tick(delta):
    game = world()
    if not state['started']:
        state['wait'] += delta
        if state['wait'] > 5.0:
            unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).editor_request_begin_play()
            state['started'] = True
        return
    if game is None:
        return
    pawn = unreal.GameplayStatics.get_player_pawn(game, 0)
    if pawn is None:
        return
    if state['phase'] < 0:
        state['phase'] = 0
        state['forward'] = pawn.get_actor_rotation().yaw
    name, duration, stick, button = PROGRAMME[state['phase']]
    if state['phase_time'] == 0.0:
        if stick is not None:
            press(game, 'IA_Move', stick)
        if button is not None:
            press(game, button)
    state['frames'].append(sample(game, pawn, name, delta))
    for shot_phase, at in SHOTS:
        key = (shot_phase, at)
        if shot_phase == name and state['phase_time'] >= at and key not in state['shots']:
            state['shots'].add(key)
            unreal.SystemLibrary.execute_console_command(game, f'HighResShot 1280x720 filename={OUT}/{shot_phase}.png')
    state['phase_time'] += delta
    if state['phase_time'] >= duration:
        if stick is not None:
            release(game, 'IA_Move')
        if button is not None:
            release(game, button)
        state['phase'] += 1
        state['phase_time'] = 0.0
        if state['phase'] >= len(PROGRAMME):
            finish()


state['handle'] = unreal.register_slate_post_tick_callback(tick)
unreal.log('gasp_measure: armed')
