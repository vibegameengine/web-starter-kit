"""Second pass of the GASP dump: the parts the generic property walk cannot see.

    UnrealEditor-Cmd.exe <GameAnimationSample.uproject> -run=pythonscript
        -script=<this file> -unattended -nullrhi -nosplash

- Blueprint variables (WalkSpeeds, RunSpeeds...) are not listed by dir() on the
  class default object, so they are read by name.
- Camera rigs keep their settings in a tree of camera node objects; the walk
  follows object references that live inside the rig's own package.
- Anim graph nodes live in the editor graph; each graph node's anim node struct
  holds the settings the running graph uses.
"""
import json
import os

import unreal

OUT = os.path.join(unreal.Paths.project_saved_dir(), 'gasp_dump')
os.makedirs(OUT, exist_ok=True)

BLUEPRINT_VARIABLES = [
    'WalkSpeeds', 'RunSpeeds', 'SprintSpeeds', 'CrouchSpeeds', 'WalkSpeeds_Demo', 'RunSpeeds_Demo',
    'SprintSpeeds_Demo', 'StrafeSpeedMapCurve', 'Gait', 'WantsToStrafe', 'Speeds',
]


def plain(value, depth, seen, package):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (unreal.Name, unreal.Text, unreal.EnumBase)):
        return str(value)
    if isinstance(value, (list, tuple, unreal.Array)):
        return [plain(item, depth + 1, seen, package) for item in list(value)[:64]]
    if isinstance(value, (dict, unreal.Map)):
        return {str(key): plain(item, depth + 1, seen, package) for key, item in list(value.items())[:64]}
    if isinstance(value, unreal.Object):
        path = value.get_path_name()
        if depth < 8 and package and path.startswith(package) and path not in seen:
            seen.add(path)
            return {'class': value.get_class().get_name(), 'path': path, 'properties': props(value, depth + 1, seen, package)}
        return path
    if isinstance(value, unreal.StructBase):
        return props(value, depth + 1, seen, package) if depth < 8 else str(value)
    return str(value)


def props(target, depth=0, seen=None, package=None):
    seen = seen if seen is not None else set()
    found = {}
    for name in dir(target):
        if name.startswith('_'):
            continue
        try:
            value = target.get_editor_property(name)
        except Exception:
            continue
        found[name] = plain(value, depth, seen, package)
    return found


def write(group, payload):
    with open(os.path.join(OUT, f'{group}.json'), 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, indent=2, default=str)
    unreal.log(f'gasp_dump_deep: wrote {group}')


def blueprint_variables(path):
    asset = unreal.load_asset(path)
    default = unreal.get_default_object(asset.generated_class())
    found = {}
    for name in BLUEPRINT_VARIABLES:
        try:
            found[name] = plain(default.get_editor_property(name), 0, set(), None)
        except Exception as error:
            found[name] = f'unreadable: {error}'
    return found


def camera_rigs():
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    rigs = {}
    for data in registry.get_assets_by_path('/Game/Blueprints/Cameras', recursive=True):
        path = str(data.package_name)
        asset = unreal.load_asset(path)
        if asset is None:
            continue
        rigs[path] = {'class': asset.get_class().get_name(), 'properties': props(asset, 0, {asset.get_path_name()}, path)}
    return rigs


def anim_graph_nodes(path):
    asset = unreal.load_asset(path)
    nodes = {}
    for graph_name in ('AnimGraph',):
        try:
            graph = unreal.BlueprintEditorLibrary.find_graph(asset, graph_name)
        except Exception as error:
            nodes[graph_name] = f'unreadable: {error}'
            continue
        if graph is None:
            nodes[graph_name] = 'not found'
            continue
        try:
            graph_nodes = graph.get_editor_property('nodes')
        except Exception as error:
            nodes[graph_name] = f'nodes unreadable: {error}'
            continue
        for node in graph_nodes:
            entry = {'class': node.get_class().get_name()}
            try:
                entry['node'] = plain(node.get_editor_property('node'), 0, set(), None)
            except Exception as error:
                entry['node'] = f'unreadable: {error}'
            nodes[node.get_name()] = entry
    return nodes


def curve_keys(path):
    asset = unreal.load_asset(path)
    try:
        return [{'time': key.time, 'value': key.value} for key in unreal.CurveFloat.get_keys(asset)]
    except Exception:
        pass
    try:
        return [{'time': t / 10.0, 'value': asset.get_float_value(t / 10.0)} for t in range(0, 1801, 50)]
    except Exception as error:
        return f'unreadable: {error}'


write('character_variables', blueprint_variables('/Game/Blueprints/SandboxCharacter_CMC'))
write('camera_rigs', camera_rigs())
write('abp_cmc_nodes', anim_graph_nodes('/Game/Blueprints/SandboxCharacter_CMC_ABP'))
write('strafe_speed_map', curve_keys('/Game/Blueprints/Data/Curve_StrafeSpeedMap'))
unreal.log('gasp_dump_deep: done')
