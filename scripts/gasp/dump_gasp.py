import json
import os

import unreal

OUT = os.path.join(unreal.Paths.project_saved_dir(), 'gasp_dump')
MAX_DEPTH = 5
MAX_ITEMS = 64

os.makedirs(OUT, exist_ok=True)


def plain(value, depth=0):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, unreal.Name):
        return str(value)
    if isinstance(value, unreal.Text):
        return str(value)
    if isinstance(value, unreal.EnumBase):
        return str(value)
    if isinstance(value, (list, tuple, unreal.Array)):
        return [plain(item, depth + 1) for item in list(value)[:MAX_ITEMS]]
    if isinstance(value, (dict, unreal.Map)):
        return {str(key): plain(item, depth + 1) for key, item in list(value.items())[:MAX_ITEMS]}
    if isinstance(value, unreal.Object):
        return value.get_path_name()
    if isinstance(value, unreal.StructBase):
        if depth >= MAX_DEPTH:
            return str(value)
        return properties_of(value, depth + 1)
    return str(value)


def properties_of(target, depth=0):
    found = {}
    for name in dir(target):
        if name.startswith('_'):
            continue
        try:
            value = target.get_editor_property(name)
        except Exception:
            continue
        found[name] = plain(value, depth)
    return found


def dump_object(target, depth=0):
    if target is None:
        return None
    return {'class': target.get_class().get_name(), 'path': target.get_path_name(), 'properties': properties_of(target, depth)}


def blueprint_components(blueprint):
    subsystem = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    components = {}
    for handle in subsystem.k2_gather_subobject_data_for_blueprint(blueprint):
        data = unreal.SubobjectDataBlueprintFunctionLibrary.get_data(handle)
        template = unreal.SubobjectDataBlueprintFunctionLibrary.get_object(data)
        if template is None:
            continue
        components[template.get_name()] = dump_object(template)
    return components


def blueprint(path):
    asset = unreal.load_asset(path)
    if asset is None:
        return {'error': f'not found: {path}'}
    generated = asset.generated_class()
    default = unreal.get_default_object(generated) if generated else None
    return {'components': blueprint_components(asset), 'defaults': dump_object(default)}


def curve(path):
    asset = unreal.load_asset(path)
    if asset is None:
        return {'error': f'not found: {path}'}
    result = {'class': asset.get_class().get_name()}
    for accessor in ('float_curve',):
        try:
            rich = asset.get_editor_property(accessor)
            result[accessor] = [{'time': key.time, 'value': key.value} for key in rich.get_copy_of_keys()]
        except Exception as error:
            result[accessor] = f'unreadable: {error}'
    try:
        result['sampled'] = [{'time': t / 10.0, 'value': asset.get_float_value(t / 10.0)} for t in range(-1800, 1801, 150)]
    except Exception as error:
        result['sampled'] = f'unreadable: {error}'
    return result


def assets_of_class(class_name, root='/Game'):
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    found = []
    for data in registry.get_assets_by_path(root, recursive=True):
        if str(data.asset_class_path.asset_name) == class_name:
            found.append(str(data.package_name))
    return sorted(found)


def generic(paths):
    dumped = {}
    for path in paths:
        asset = unreal.load_asset(path)
        dumped[path] = dump_object(asset) if asset else {'error': 'not found'}
    return dumped


def write(group, payload):
    with open(os.path.join(OUT, f'{group}.json'), 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, indent=2, default=str)
    unreal.log(f'gasp_dump: wrote {group}')


write('character_cmc', blueprint('/Game/Blueprints/SandboxCharacter_CMC'))
write('character_mover', blueprint('/Game/Blueprints/SandboxCharacter_Mover'))
write('curves', {path: curve(path) for path in [
    '/Game/Blueprints/Data/Curve_StrafeSpeedMap',
    '/Game/Blueprints/Data/Curve_RotationOffset_F',
    '/Game/Blueprints/Data/Curve_RotationOffset_B',
    '/Game/Blueprints/Data/Curve_RotationOffset_LL',
    '/Game/Blueprints/Data/Curve_RotationOffset_LR',
    '/Game/Blueprints/Data/Curve_RotationOffset_RL',
    '/Game/Blueprints/Data/Curve_RotationOffset_RR',
]})
write('cameras', generic(assets_of_class('CameraAsset') + assets_of_class('CameraRigAsset') + assets_of_class('CameraDirectorAsset')))
write('pose_search_schemas', generic(assets_of_class('PoseSearchSchema')))
write('pose_search_databases', generic(assets_of_class('PoseSearchDatabase')[:40]))
write('abp_cmc', blueprint('/Game/Blueprints/SandboxCharacter_CMC_ABP'))
write('game_mode', blueprint('/Game/Blueprints/GM_Sandbox'))
write('player_controller', blueprint('/Game/Blueprints/PC_Sandbox'))
write('asset_classes', {name: assets_of_class(name) for name in [
    'CameraAsset', 'CameraRigAsset', 'CameraDirectorAsset', 'PoseSearchSchema', 'PoseSearchDatabase', 'ChooserTable',
]})
unreal.log('gasp_dump: done')
