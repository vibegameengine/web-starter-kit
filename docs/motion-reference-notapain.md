# Карта анимации / рига / движения — Godot-проект `notapain` (+ сравнение с three.js)

Прочитано полностью: 10 файлов `entities/character/`, 5 файлов `features/movement/` + `states/*`, `climbing/*`, `input/*`, 2 лаборатории, 3 тула + `run_tests.py`, 5 документов. Ничего не менялось, игра не запускалась.

---

## 1. `entities/character/character_animator.gd` (795 стр., `class_name SpiderAnimator`)

Философия в шапке файла (стр. 3–15): «МОЗГ — чистый юнит-тестируемый `AnimStateMachine`; ЭТОТ файл — тупой РЕНДЕРЕР… Никакого Godot AnimationTree state machine (он оказался непрозрачным и неборимым: переходы блокировались, кадры проглатывались)».

| file:line | подпись | что делает | числа/константы |
|---|---|---|---|
| :92 | `_ready() -> void` | находит AnimationPlayer (явно или обходом), сливает клипы, ИЗМЕРЯЕТ скорость Walk/Run и stance-окна Walk/Run/RunBack, строит дерево | печатает измерения; список `["Walk","Run","RunBack"]` |
| :109 | `_process(delta) -> void` | двигает кроссфейд в том же проходе, что и дерево; при мантле копит root motion | — |
| :121 | `_tick_blend(delta) -> void` | `_blend.tick` → пушит `ACTION_XFADE`, `BASE_MIX` в дерево | — |
| :132 | `update(planar_speed, speed_norm, backward, grounded, vertical_velocity)` | локомоция: blend_position, дробление отношения скорости на КАДЕНС (playrate) и ДЛИНУ ШАГА; детект land/walk_off/apex | `speed_norm>0.45`, `(sn-0.45)/0.55`, `planar_speed>0.3`, `authored>0.1`, `rate=clamp(sqrt(ratio),0.85,1.6)`, `stride=clamp(ratio/rate,0.7,1.9)`, `APEX_VY=-2.5` |
| :164 | `jump(running, _launch_v)` | взлёт; `running` выбирает RunJump vs JumpUp | — |
| :174 | `mantle()` | старт подъёма: `pull_up()` если виси́м, иначе `mantle_ground()` | — |
| :184 | `end_mantle()` | мантл закончен → локомоция | — |
| :193 | `grab_ledge(wall_below)` | захват карниза из ЛЮБОГО air-подсостояния | — |
| :202 | `release_hang()` | отпустить → FALL | — |
| :215 | `_enter(from, to)` | настраивает кроссфейд: GROUND → гасит action-слой; иначе клип в свободный слот + `seek_request=0` на ВХОДЯЩИЙ слот (перезапуск one-shot) | — |
| :234 | `_set_slot(node, clip)` | ставит `.animation` на УЗЕЛ (не параметр дерева) + правит `loop_mode` | `LOOPED` словарь |
| :241 | `_clip_for(s)` | state → имя клипа | — |
| :251 | `_blend_time(from,to)` | время кроссфейда по типу перехода | `FALL_XFADE .3`, `CATCH_XFADE .25`, `SETTLE_XFADE .3`, mantle `0.2`, `XFADE .12` |
| :264 | `get_clip_length(clip) -> float` | длина слитого клипа (MantleState тактирует по ней) | 0.0 если нет |
| :270 | `model_scale() -> float` | scale.y скелета | — |
| :279 | `begin_root_motion()` | `root_motion_track = HIP_TRACK`, сброс банка | `"Skeleton3D:mixamorig_Hips"` |
| :286 | `end_root_motion()` | снимает root-motion-трек | — |
| :295 | `consume_root_motion_world() -> Vector3` | отдаёт накопленный root motion в МИРОВЫХ координатах через базис скелета (несёт масштаб и 180° флип) | модель `-1.75` по X/Z (комментарий) |
| :309 | `climb_hip_samples(n) -> PackedVector3Array` | сэмплирует путь бедра клипа ClimbUp напрямую (`position_track_interpolate`) для профиля MotionWarp | `n<2` → пусто; `push_error` если нет трека |
| :331 | `foot_offset_above_model() -> float` | насколько НИЖНЯЯ стопа сейчас выше origin модели («float» клипа ~1 м) | — |
| :345 | `hands_offset_above_model() -> float` | насколько ВЫСШАЯ кисть выше origin модели | — |
| :356 | `pelvis_world() -> Vector3` | мировая позиция Hips | — |
| :366 | `pelvis_offset_from_model() -> Vector3` | таз относительно origin модели (для стабилизации таза) | — |
| :373 | `get_playrate() -> float` | текущий `TS/scale` | — |
| :378 | `debug_weights() -> String` | одна строка: state + все эффективные веса + живые параметры дерева + клипы в слотах | — |
| :388 | `debug_second_weight() -> float` | ВТОРОЙ по величине вес — >0 значит два клипа смешаны («драка состояний») | — |
| :396 | `get_stride_factor() -> float` | коэффициент растяжки шага для FootIKPrep | — |
| :403 | `debug_set_manual()` | снимает дерево с автопроцесса → `ANIMATION_CALLBACK_MODE_PROCESS_MANUAL` | — |
| :411 | `debug_step(dt)` | один ДЕТЕРМИНИРОВАННЫЙ кадр: tick + push + `_tree.advance(dt)` | — |
| :423 | `debug_slot_times() -> Array` | `current_position` каждого слота (ловит «заморозку» one-shot) | `-1.0` если не отдаёт |
| :432 | `get_loco_phase() -> float` | нормированная фаза цикла 0..1 из playback 1-состояточной Loco-SM; `-1` если не на земле | `fposmod(pos/len,1)` |
| :440 | `is_foot_stance(i) -> bool` | в stance-окне ли стопа i сейчас; окна ЛЕРПятся Walk→Run по скорости | `pos<0.15` → всегда stance (idle), `pos<0.45` → Walk, иначе lerp с `(pos-0.45)/0.55` |
| :457 | `_in_window(t,w) -> bool` | попадание в окно с учётом ЗАВЁРТКИ через шов лупа | — |
| :464 | `set_upper_action(clip, weight)` | оверлей верха тела (маска на спине) | `clamp 0..1` |
| :474 | `_build_tree()` | строит BlendTree: Loco(SM→BlendSpace1D)→TS, SlotA/B→SeekA/B→ActionXfade, Base(Blend2), Mask(Blend2+filter); ставит дерево в **IDLE** callback | причина IDLE в комментарии стр. 513–518: «в PHYSICS-режиме foot IK сэмплировал позу середины апдейта и разъезжал ноги — сломанный idle» |
| :529 | `_blendspace()` | BlendSpace1D с `sync=true` | точки: RunBack `-1`, Idle `0`, Walk `0.45`, Run `1.0`; `min/max_space ±1` |
| :541 | `_anim_node(clip)` | AnimationNodeAnimation + принудительный LOOP_LINEAR для лупов | — |
| :552 | `_apply_upper_mask(mask)` | включает filter для каждой кости от `mixamorig_Spine` и выше (обход к родителю) | `UPPER_ROOT="mixamorig_Spine"` |
| :572 | `_merge_clips()` | сливает Idle из `mixamo_com` + 9 внешних FBX/GLB в библиотеку, ставит loop_mode, срезает root (кроме ClimbUp), верифицирует биндинг | `STRIP_VERTICAL=["JumpUp","RunJump"]`; ClimbUp НЕ срезается вообще |
| :601 | `_verify_clip_binding(state, clip)` | ГРОМКО проверяет, что костные треки резолвятся на рантайм-скелет ТАК ЖЕ, как AnimationMixer (узел до `:` + кость после) | лимит вывода 5 путей; «find_bone alone is a false positive» |
| :633 | `_strip_root(clip, strip_vertical)` | заменяет X/Z (и Y при флаге) всех ключей hip-трека на значения ключа 0 | — |
| :645 | `_measure_authored(clip) -> float` | АВТОРСКАЯ скорость клипа = медиана Z-скорости стопы в её stance-фазе × масштаб | `n=64` сэмплов, порог `lo+(hi-lo)*0.35`, медиана, fallback `1.5` |
| :682 | `_measure_stance_window(clip) -> Array` | самое длинное непрерывное окно «стопа внизу» с учётом заворота через шов | `n=64`, `STANCE_FRAC=0.30`, скан `n*2`, `mini(best_len,n)` |
| :721 | `_load_clip(path)` | инстанцирует PackedScene, тащит один клип, ретаргетит треки, освобождает инстанс | — |
| :740 | `_retarget_clip_tracks_to_runtime_skeleton(clip)` | нормализует путь каждого скелетного трека к живому узлу Skeleton3D (`Node/Skeleton3D:Bone` vs `Skeleton3D:Bone`) | — |
| :763 | `_source_anim_name(ap)` | берёт `mixamo_com` или ЕДИНСТВЕННЫЙ клип; при нескольких — `push_error`, отказ угадывать | — |
| :774 | `_find_ap(n)` / :786 `_find_skeleton(n)` | рекурсивный поиск по дереву | — |

## 2. `entities/character/character_rig.gd` (194, `SpiderRig`)

| file:line | подпись | что | числа |
|---|---|---|---|
| :49 | `_ready()` | `_setup.call_deferred()` — на `_ready` дети модели ещё не готовы | — |
| :55 | `_setup()` | строит цепочки в ПОРЯДКЕ: foot → hand → look-at → joint limits («LAST → clamps whatever the clips + IK produced») | — |
| :71 | `_build_foot_chain()` | FootIKPrep (первый, читает чистую позу микшера) → TwoBoneIK3D (2 ноги, цели/полюсы от prep) → FootRotate → RigDebugDraw | `LEGS` 2 записи |
| :106 | `_build_hand_chain()` | ClimbIKPrep + ArmTwoBoneIK, `influence = 0` в покое | influence `0.0` |
| :126 | `_build_joint_limits()` | добавляет JointLimits последним | — |
| :132 | `_build_look_at()` | Marker3D (top_level) + LookAtModifier3D на голову | `forward_axis=4`, primary `70°`, secondary `60°`, `influence 0.5` |
| :149 | `_process(_delta)` | ставит look-таргет впереди тела | `-basis.z*4.0 + up*1.5` |
| :157 | `set_debug_draw(on)` | переключает визуализацию | — |
| :164 | `set_foot_ik(on)` | A/B: prep.enabled + twobone.active + rot.enabled | — |
| :174 | `set_joint_limits(on)` | A/B лимитов | — |
| :180 | `set_hand_ik(on)` | A/B рук | — |
| :185 | `_find_skeleton(n)` | рекурсивный поиск | — |

## 3. `entities/character/foot_ik_prep.gd` (288, `FootIKPrep`)

Шапка (стр. 6–14): «IK УЛУЧШАЕТ анимацию, а не заменяет её. На ровном полу это NO-OP — каждая коррекция измеряется ОТНОСИТЕЛЬНО земли, на которой стоит тело, поэтому дельты нулевые».

| file:line | подпись | что | числа |
|---|---|---|---|
| :72 | `_ready()` | ищет кости, считает высоту голеностопа из REST-позы (ankle = restY(foot)−restY(toe)) × scale_y, создаёт по 2 Marker3D (цель + полюс) на ногу | — |
| :101 | `_process_modification()` | главный проход: при мантле → `_mantle_feet` и выход; иначе на каждую стопу: анимированная мировая поза → луч вниз → «stance должен стоять на земле» (при недостижимости `_pull_to_ground`) → contact-вес → сглаживание ТОЛЬКО вертикальной коррекции → stride warp → фазовый замок XZ → цель; в конце опускание таза на самую глубокую стопу | `delta` clamp `0..0.1`; contact для stance `1-smoothstep(0.55, 0.85, gap-ankle)`; для swing `1-smoothstep(ankle+0.05, ankle+0.22, gap)`; `corr_adapt 10`, `contact_adapt 16`, `hip_drop_adapt 7`; `|sf-1|>0.01`; `target_w = planted * (1-smoothstep(0.45, 0.9, gap))`, `plant_blend_rate 9`; полюс `knee - basis.z*0.8`; таз `clamp(-deepest, 0, 0.55)`, порог `0.001` |
| :226 | `_mantle_feet(sk)` | «Euphoria-lite»: стопа НИЖЕ губы — выставляется на плоскость стены на фикс. зазор; ВЫШЕ губы — падает лучом на верх; лерп по `mantle_leg_weight` | `lip_y-0.05`, `WALL_FOOT_CLEAR 0.1`, `ray_up 0.5 / ray_down 0.8`; foot_weights=0 (FootRotate выключен на подъёме) |
| :263 | `_ground_ray(space, foot_world, up)` | луч вниз из стопы, исключая тело | `+up*0.5 … -up*0.8` |
| :272 | `_pull_to_ground(...)` | 6 шагов внутрь к телу, ищет землю в пределах `max_step_drop` — чтобы stance-стопа встала на КРАЙ, а не висела над обрывом | `range(1,7)`, `s/6.0`, `<=0.55` |
| :282 | `_find_body(n)` | вверх по дереву до CharacterBody3D | — |

## 4. `entities/character/foot_rotate.gd` (51, `FootRotate`)

| file:line | подпись | что | числа |
|---|---|---|---|
| :16 | `_ready()` | ищет тело | — |
| :20 | `_process_modification()` | после решателя доворачивает стопу на нормаль поверхности тем же дельта-поворотом, каким земля отклоняется от up (axis-agnostic, не знает локальных осей Mixamo); слерп по contact-весу | `w<0.01` → скип, `normal·up>0.999` → скип |
| :45 | `_find_body(n)` | — | — |

## 5. `entities/character/climb_ik_prep.gd` (79, `ClimbIKPrep`)

| file:line | подпись | что | числа |
|---|---|---|---|
| :29 | `_ready()` | корни рук + 4 Marker3D (2 кисти, 2 полюса), `top_level`, интерполяция физики OFF | — |
| :50 | `_process_modification()` | если не мантлим — `arm_ik.influence = 0` (ЖЁСТКИЙ no-op, клип не тронут); иначе кисти в мировые `mantle_grip`, полюсы ниже и наружу от плеча, influence = `mantle_hand_weight` | `pole_drop 0.45`, `pole_out 0.2` (i==0 → `-pole_out`), порог `weight<=0.001` |
| :73 | `_find_body(n)` | — | — |

## 6. `entities/character/joint_limits.gd` (93, `JointLimits`)

| file:line | подпись | что | числа |
|---|---|---|---|
| :33 | `_ready()` | собирает по каждому шарниру: индекс, нормированная ось, min/max в радианах, REST-кватернион | `push_warning` если кости нет |
| :53 | `_process_modification()` | для каждого шарнира: дельта от REST → короткий путь (`w<0` → инверсия) → swing-twist clamp → назад | `SWING_TOL 8°` |
| :70 | `_clamp_hinge(delta, axis, lo, hi, swing_tol)` | разложение на twist (вокруг оси, = сгибание) и swing (остаток); twist в `[min,max]`, swing сжимается в узкий конус | `HINGES`: колени `axis(-1,0,0)`, локти `(0,0,±1)`, все `min -5°, max 155°`; эпсилоны `1e-8`, `1e-5` |

## 7. `entities/character/anim_state_machine.gd` (76, `AnimStateMachine`) — ЧИСТЫЙ мозг

Классы состояний: Ground / Air{JUMP,FALL} / Climb{HANG_WALL,HANG_FREE,MANTLE}. Переходы охраняются КЛАССОМ источника — «catch валиден из класса Air, т.е. из JUMP *или* FALL».

| file:line | подпись | что | числа |
|---|---|---|---|
| :21 / :24 / :27 | `is_air()` / `is_climb()` / `is_hang()` | классовые предикаты | — |
| :34 | `jump() -> bool` | GROUND → JUMP | — |
| :38 | `walk_off() -> bool` | GROUND → FALL (без взлёта) | — |
| :42 | `apex() -> bool` | JUMP → FALL | — |
| :46 | `land() -> bool` | любое Air → GROUND | — |
| :50 | `grab(wall_below) -> bool` | Air → HANG_WALL / HANG_FREE | — |
| :56 | `mantle_ground() -> bool` | GROUND → MANTLE | — |
| :60 | `pull_up() -> bool` | hang → MANTLE | — |
| :64 | `release() -> bool` | hang → FALL | — |
| :68 | `mantle_done() -> bool` | MANTLE → GROUND | — |
| :72 | `_go(s) -> bool` | true только если состояние РЕАЛЬНО изменилось | — |

## 8. `entities/character/anim_blend.gd` (67, `AnimBlend`) — ЧИСТАЯ математика кроссфейда

| file:line | подпись | что | числа |
|---|---|---|---|
| :24 | `to_locomotion(blend)` | цель base=0, скорость `1/max(blend,0.001)` | — |
| :31 | `to_clip(clip, blend)` | кладёт клип в СВОБОДНЫЙ слот, ПЕРЕНАЦЕЛИВАЕТ немедленно (прерывает любой блендинг); если action был скрыт — СНАП xfade (нет протухшего слот-в-слот кроссфейда) | `base < 0.05` → snap; дефолтные `_xr/_br = 8.0` |
| :48 | `tick(dt)` | два `move_toward` — детерминированно | — |
| :54 | `weight(clip) -> float` | эффективный вклад клипа; локомоция = `""` → `1-base` | — |
| :66 | `settled() -> bool` | `is_equal_approx` по обоим | — |

## 9. `entities/character/rig_debug_draw.gd` (100, `RigDebugDraw`)

| file:line | подпись | что | числа |
|---|---|---|---|
| :27 | `_ready()` | по 4 шара на стопу (target/anim/hit/pole) + ImmediateMesh для линий, `no_depth_test` | `SPHERE_R 0.045`; цвета: зелёный `(0.2,1,0.3)`, магента `(1,0.2,1)`, красный, синий |
| :46 | `_process(_delta)` | обновляет позиции; **цель ЗЕЛЁНАЯ когда PLANTED, оранжевая когда свободна**; циановая нормаль, оранжевая линия anim→target = «насколько IK сдвинул стопу с анимации» | нормаль `*0.5`; оранжевый `(1,0.6,0.1)` |
| :76 / :83 / :99 | `_line` / `_ball` / `_tint` | примитивы | — |

## 10. `entities/character/spider_character.gd` (235, `SpiderCharacter`)

| file:line | подпись | что | числа |
|---|---|---|---|
| :62 | `_ready()` | группа "player", камера, MovementContext (body/animator/rig/LedgeSensor/tuning), MovementController.setup, отложенный `_fit_capsule_setup` | — |
| :76 | `_fit_capsule_setup()` | ищет скелет, кости Head/Hips/2×Foot, запоминает исходную высоту капсулы | `_stand_height` из .tscn (1.7) |
| :89 | `_find_skeleton(n)` | — | — |
| :102 | `_fit_capsule_to_mesh()` | АДАПТИВНАЯ капсула по живой позе: при hang/mantle низ капсулы пришпилен к ТАЗУ, иначе к origin (полу), высота = стопы→голова | `clamp(hi-lo, radius*2, _stand_height)`; условие `state == &"hang" or &"mantle"` (не по `mantle_active`, т.к. он же поднят на воздушном reach) |
| :132 | `request_jump()` | внешний one-shot прыжок (демо/AI) | — |
| :137 | `set_input_source(source)` | подмена источника ввода (AI/replay/тесты) | `push_warning` на null |
| :145 | `movement_state() -> StringName` | текущий id состояния | — |
| :149 | `_physics_process(delta)` | `view_offset=0` → ввод → `controller.step` → подгонка капсулы → применение `view_offset` к Model | — |
| :161 | `_resolve_input()` | сэмпл ввода → camera-relative; `climb_up = jump_pressed` (СВЕЖЕЕ нажатие, а не удерживаемое направление) | — |
| :177 | `loco_blend(speed) -> float` | реальные м/с → позиция бленда, чтобы точки совпали с клипами | `walk_speed → 0.45`, `run_speed → 1.0`; `0.45 + (s-w)/max(r-w,0.01)*0.55` |
| :188 | `try_step_up(motion) -> bool` | свип капсулы ВВЕРХ → ВПЕРЁД → ВНИЗ; коммитит только на ходибельную землю в пределах досягаемости | `step_height 0.4`, порог `up_travel<=0.001`, `fwd_travel < motion*0.5` → отказ, `step_margin 0.02`, `floor_max_angle` |
| :216 | `read_input() -> Vector2` | — | — |
| :222 | `camera_relative(input) -> Vector3` | WASD на планарный базис камеры | `limit_length(1.0)` |

Поля-контракт для IK-слоёв (читаются через `_body.get(...)`): `mantle_active`, `mantle_grip[2]`, `mantle_hand_weight`, `mantle_wall_point/normal`, `mantle_lip_y`, `mantle_leg_weight`, `predict_*`, `view_offset`.

## 11. `features/movement/movement_controller.gd` (40)

| :13 | `setup(ctx)` | регистрирует Ground/Air/Mantle/Hang, стартует с ground | | 
|---|---|---|---|
| :24 | `state_id()` | — | — |
| :28 | `step(delta)` | шаг состояния; если вернуло другой id — `exit` старого, `enter` нового | — |
| :39 | `_register(s)` | словарь по `s.id()` | — |

## 12. `features/movement/movement_context.gd` (23) — только поля

`body, animator, rig, sensor, tuning` + per-frame `move, sprint, jump_pressed, climb_up, release` + handoff `pending_ledge, grab_cooldown, reach_carry`.

## 13. `features/movement/movement_tuning.gd` (78) — Resource, все числа (см. §«Все константы»)

## 14. `features/movement/states/*`

| file:line | подпись | что | числа |
|---|---|---|---|
| movement_state:12/16/20/25 | `id / enter / exit / physics_step` | интерфейс; `physics_step` возвращает id следующего или `&""` | — |
| ground_state:8 | `id() -> &"ground"` | — | — |
| ground_state:12 | `physics_step(ctx, delta)` | гравитация (на полу зажата), прыжок = ТАКЖЕ кнопка карниза (probe → mantle если `found and top_clear`), целевая скорость, доворот к направлению, step-up с восстановлением импульса, кормит аниматор | `floor_snap_length 0.4`, `floor_max_angle 50°`, `velocity.y = max(vy,-0.1)`, порог ввода `0.05`, `backward` при `move·(-basis.z) < -0.3`, `anim_grounded` при `vy<=0.1` |
| air_state:11/15/20 | `id / enter / exit` | сбрасывает reach на входе и выходе | `_reach=0` |
| air_state:24 | `physics_step` | АНТИЦИПАТОРНЫЙ REACH: широкая полоса высот для поиска карниза, руки тянутся заранее, COMMIT через `LedgeGrabDecision`; передаёт `reach_carry` в Hang; иначе блендит reach обратно | `grab_cooldown` тик, `predict_anchor = lip - fwd*0.35 - up*hang_drop`, `air_control`, порог `0.05`, `_reach>0.01` |
| air_state:95 | `_set_reach(b, target, delta, t)` | easing веса reach → частичный хват руками (ноги не на стене) | `delta / reach_blend (0.12)` |
| air_state:102 | `_clear_reach(b)` | всё в 0 | — |
| hang_state:19/23 | `id / enter` | якорь виса (кисти на губе, тело `hang_drop` ниже, в 0.35 от лица, доворот к стене), грип стартует с `reach_carry` — «чтобы хват не просел на ловле» | `lip - fwd*0.35 - up*1.8` |
| hang_state:54 | `physics_step` | АБСОРБЦИЯ ловли: `smoothstep(0, catch_time, t)` лерп от точки удара к якорю (не телепорт); грип едет к 1; pull-up только если `top_clear`; release = отпихнуться + кулдаун | `GRAB_BLEND 0.18`, `catch_time 0.4`, push-off `-fwd*1.5`, `grab_cooldown 0.5` |
| mantle_state:22/26 | `id / enter` | `_dur` = длина клипа ClimbUp (`push_error` при 0, БЕЗ тихого fallback), фиксирует таз СТАРОГО клипа, снап поворота к стене, отдаёт грип/плоскость в IK, `begin_root_motion()` | `_dur = 0.001` только после ошибки |
| mantle_state:60 | `exit(ctx)` | `end_root_motion()` | — |
| mantle_state:64 | `physics_step` | тело по L-ПУТИ по фазе `p = t/_dur`: сначала ВВЕРХ вдоль стены, потом ВПЕРЁД через губу; стабилизация таза только на переходе, затухает; хват держится пока ПЛЕЧИ не перевалили губу | `rise = smoothstep(0,0.7,p)`, `over = smoothstep(0.7,1,p)`, `stab = 1-smoothstep(0,0.25,t)`, `grip_in = 1 или smoothstep(0,0.1,p)`, hand_w `1-smoothstep(-0.1, 0.35, above)`, leg_w `smoothstep(0.05,0.2,p)*(1-smoothstep(0.8,0.95,p))` |

**Найденное противоречие (важно):** `MantleState` (стр. 3–7 и 69–75) заявляет «CLIP'S OWN root motion moves the body… we add NO procedural translation», и вызывает `begin_root_motion()`, а `SpiderAnimator._process` копит `_rm_accum`, — но `consume_root_motion_world()` **не вызывается нигде** (grep по всему проекту). Фактически тело ведёт именно процедурный L-путь `smoothstep`. `MotionWarp`, `climb_hip_samples()`, `foot_offset_above_model()`, `hands_offset_above_model()`, `get_playrate()` — мёртвый код в рантайме (MotionWarp жив только в `tools/test_motion_warp.gd`). То есть план из `mantle-aaa-research.md` (§«What this means for us») в коде НЕ реализован.

## 15. `features/movement/climbing/ledge_sensor.gd` (204, `LedgeSensor`)

| file:line | подпись | что | числа |
|---|---|---|---|
| :35 | `probe(space, origin, up, dir, t, exclude, min_h, max_h, floor_max_angle, reach=-1)` | 1) веер лучей от груди → ближайшая почти-вертикальная стена; 2) луч сверху за губу → верх должен быть ходибельным и в полосе высот; 3) `has_standing_room` (НЕ гейтит `found`); строит грипы с обёрткой углов и мин. разносом, `wall_below`, `grip_clear` | `wall_probe_h 0.45`, `top_from = y+max_h+0.1`, `top_to = -(max_h+0.2)`, `ledge_inset 0.32` |
| :106 | `_probe_wall(...)` | ближайшее попадание по вееру, отбрасывая почти-горизонтальные нормали | `FAN_DEG [0,-15,15,-30,30]`, отсев `|normal·up| > 0.4` |
| :129 | `has_standing_room(space, top, up, t, exclude)` | ОДИН shape-test капсулы над точкой приземления (там, где один вертикальный луч пропускал боковые случаи) | `radius = body_radius + stand_margin`, `height = max(stand_clearance, r*2)`, подъём `+0.03` |
| :146 | `_grip_point(space, lip, right, fwd, up, sign, t, exclude)` | грип вдоль кромки; если верх кончается раньше полного вылета (УГОЛ) — остаток загибается на перпендикулярную кромку | `hand_spread 0.22`, шаг `0.04` |
| :167 | `_edge_at(space, p, up, lip_y, exclude)` | есть ли верх на высоте губы в точке p | `+up*0.15 … -up*0.2`, допуск `0.1` |
| :179 | `has_grip_room(space, lip, fwd, up, t, exclude)` | shape-test тонкого бокса ВЫШЕ и СПЕРЕДИ губы (не «верхом на губе» — это ошибочно отсекало выступы со стеной сзади) | `depth 0.25`, `size = (2*0.22+0.3, grip_clearance 0.35, 0.25)`, центр `lip - fwd*(0.125+0.02) + up*(0.175+0.03)` |
| :199 | `_has_wall_below(space, lip, fwd, up, exclude)` | продолжается ли лицо стены под губой (HangWall vs HangFree) | `lip - up*0.4 - fwd*0.25`, луч `fwd*0.6` |

## 16. `features/movement/climbing/ledge_grab_decision.gd` (47) — ЧИСТОЕ решение

| :21 | `action(found, vert_gap, to_lip, t) -> int` | IGNORE / REACH / COMMIT | enum |
|---|---|---|---|
| :31 | `can_commit(vert_gap, to_lip, t)` | губа ЯВНО выше стоп и в пределах вытянутой руки от плеч (3D) — без требования «падать» | `grab_h_min 1.3`, `arm_reach 1.0` |
| :38 | `shoulder_distance(vert_gap, to_lip, t)` | 3D-расстояние от линии плеч до губы | `shoulder_h 1.4` |
| :45 | `reach_weight(to_lip, t)` | вес антиципации: 0 далеко → `reach_max` в зоне хвата | `span = max(anticipate_reach - grab_dist, 0.01)`, `×reach_max 1.0` |

## 17. `features/movement/climbing/motion_warp.gd` (84, `MotionWarp`) — чистый, протестированный, НЕ подключён

| :26 | `setup(controls, profile)` | полилиния мировых контрольных точек + кумулятивные хорды | `assert size>=2` |
|---|---|---|---|
| :39 | `sample(p) -> Vector3` | мировая позиция капсулы на фазе p; ЭНДПОИНТЫ ТОЧНЫЕ на любой высоте карниза | `_total<=0.0001` → конец |
| :53 | `_eval_profile(p)` | фаза → сглаженная доля по профилю клипа (линейно, если профиля нет) | — |
| :67 | `profile_from_polyline(samples)` static | монотонный 0..1 профиль = нормированная КУМУЛЯТИВНАЯ длина дуги пути бедра клипа (наследует разгон/рывок/оседание) | `n<2` → пусто, `total<=0.0001` → линейный |

## 18. `features/movement/input/*`

| movement_input_source:17 | `sample(input_override, sprint_override, force_jump)` | собирает `MovementInputState` | — |
|---|---|---|---|
| :28 | `read_move(input_override)` | `Input.get_vector` по 4 экшенам или override | `limit_length(1.0)` |
| :38 | `is_sprint_pressed(...)` | — | — |
| :42 | `consume_jump_pressed(force_jump)` | РЕБРО нажатия (сам хранит `_jump_was_pressed`) | — |
| :49 | `is_release_pressed()` | — | — |
| movement_input_state:12 | `_init(move, sprint, jump_pressed, release)` | device-agnostic интент | `limit_length(1.0)` |

## 19. `screens/foot_phase_lab/foot_phase_lab.gd` (176) — как лаба МЕРЯЕТ

| :28 | `_ready()` | парсит `--clip=`, сливает 3 клипа, СЧИТАЕТ окна для всех и печатает их, играет выбранный | — |
|---|---|---|---|
| :52 | `_process(_delta)` | шар на стопе: ЗЕЛЁНЫЙ в stance-окне, КРАСНЫЙ в swing — окна можно «глазами проверить прежде чем они поедут в реальный foot IK» | — |
| :67 | `_analyze(clip, foot_idx) -> Vector2` | тот же алгоритм, что `_measure_stance_window`: 64 сэмпла высоты, порог `lo+(hi-lo)*0.30`, самый длинный ран с завёрткой | `n=64`, `STANCE_FRAC 0.30` |
| :104/:110 | `_in_window` / `_fmt` | попадание / печать `[a..b] (N% of cycle)` | — |
| :114 | `_capture_series()` | 4 скриншота через `0.18 с`, печатает `CAPTURE_DONE`, выходит | — |
| :128/:140/:155/:159/:169 | `_merge` / `_make_sphere` / `_tint` / `_find_ap` / `_find_skel` | инфраструктура; шар `r=0.06`, unshaded, `no_depth_test` | — |

## 20. `screens/character_lab/character_debug_overlay.gd` (144)

| :21 | `_ready()` | призрак + визуализация капсулы + панель | — |
|---|---|---|---|
| :27 | `_process` | призрак виден только при `predict_active`; центр капсулы `predict_anchor + UP*0.85` | — |
| :37 | `_input(event)` | `~` (KEY_QUOTELEFT) переключает панель | — |
| :44 | `_build_ghost()` | капсула `r0.35 h1.7` + 2 шара грипов `r0.07` | цвета `(0.2,0.8,1,0.28)`, `(1,0.45,0.1,0.9)` |
| :66 | `_build_body_viz()` | зелёная прозрачная копия РЕАЛЬНОЙ капсулы | `(0.2,1,0.35,0.22)` |
| :82 | `_update_body_viz()` | КАЖДЫЙ кадр копирует размер+позу живого CollisionShape3D | — |
| :95 | `_ghost_mat(col)` | unshaded + alpha + `no_depth_test` | — |
| :106 | `_build_panel()` | Tab-панель: Foot IK / Hand IK / Joint Limits / Rig Debug Draw / Prediction Ghost / Body Capsule | `min 240×180`, TOP_RIGHT, отступ 16 |
| :132/:139 | `_tab` / `_check` | — | — |

## 21. `screens/character_lab/character_lab.gd` (955) — как лаба ДРАЙВИТ и ИЗМЕРЯЕТ

| file:line | подпись / режим | что | пороги |
|---|---|---|---|
| :8 | `_ready()` | диспетчер режимов по `OS.get_cmdline_user_args()`; при `--capture` ставит `Engine.max_fps = physics_ticks_per_second` (детерминизм: дерево анимации крутится в `_process`) | — |
| :31 `--idletest` | ГЕЙТ | стоит idle 3 с, затем 60 кадров усреднения РЕАЛЬНЫХ костей, берёт ХУДШИЙ fore-aft разъезд | `feet_split<0.30`, `lf/rf_fore<0.30`, `foot_y<0.30`, `LH/RH_below>0.02`, `hip_above_feet ∈ (0.55, 1.05)`, `head_above_hip>0.20`; позиция `(0,0.2,12)` |
| :115 `--walktest` | ГЕЙТ | то же в движении, ловит «на корточках»: МИНИМУМ высоты таза за 60 кадров | `min_hip_above>0.55`, `min_head_above>0.20`, разгон 2 с |
| :153 `--idle` | диагностика | печатает костные Y, разъезд, `prep.foot_weights/foot_planted`, `debug_weights()` | 2.5 с оседание, 5 кадров |
| :194 `--slide` | диагностика | скольжение стопы: мировая горизонтальная скорость стопы, помечена LOCK/swing по `is_foot_stance` | 2.5 с, старт после `t>1.0`, `bspd>0.1` |
| :229 `--walkside` | скриншоты | боковой вид с debug: зелёная IK-цель должна лежать НА магентовой анимационной стопе | кадры на `1.0/1.2/1.4 с` |
| :247 `--stairs` | A/B | ноги на РАЗНЫХ ступенях (разворот −90°), debug on / IK off / IK on | `1.6/0.4/0.6 с` |
| :270 `--climb` | диагностика | лог Y и планарной скорости на лестнице (провал скорости = «хоп» на каждом подступенке) | 3 с |
| :292 `--ledge` | фильмстрип | мантл по фазе, не по часам | пороги `0, 0.33, 0.66, 1.0`, `dur 1.13` |
| :335 `--parapet` | ГЕЙТ | overhang: должен ЗАХВАТИТЬ, но НЕ подтянуться | exit 0 iff `grabbed and not pulled_up`; окно 7 с |
| :365 `--stacked` | ГЕЙТ | куб прямо на губе → не должен захватить вообще | exit 0 iff НЕ grabbed; окно 5 с |
| :389 `--footplant` | ГЕЙТ | строит ступеньку в рантайме, персонаж верхом на кромке; лучом проверяет, что ОБЕ цели стоп заземлены | `box 4×0.35×4` @ `(2,0.175,20)`, луч `+0.05 … -0.3`, 1.5 с |
| :432 `--hang` | диагностика | бег+прыжок в стену 2.2 м, авто-хват на дуге, лог z/y/vy/state/predict/hand | прыжок при `z<4.2`, 4 скриншота через 0.2 с |
| :462 `--pullup` | ГЕЙТ | hang → pull-up; судит ОКНО ОСЕДАНИЯ (последняя секунда из 4) | `on_top: y >= 2.2-0.3`; `single: debug_second_weight() <= 0.05`; `alive: frozen < frames/2 и hand_span > 0.001`, «заморозка» = `dist < 0.00005` |
| :542/:553 `--climbhigh/--climblow` | ГЕЙТЫ | детерминированный ВСЕКОСТНЫЙ тест подъёма | top_y `2.2` / `1.0` |
| :564/:572 `--chainhigh/--chainlow` | ГЕЙТЫ | ТАЙМЛАЙН состояний строго `ground→air→hang→mantle→ground` / `ground→mantle→ground` | — |
| :578 `--ik` | A/B | на наклонном пандусе IK off/on | `1.3/0.3/0.6 с` |
| :596 `--mask` | доказательство маски | ноги спринтуют, верх подменяется `JumpUp` весом 1 | — |
| :619 | `_run_jump_series(ch)` | фильмстрип прыжка | `0.07/0.30/0.55 с` |
| :634 | `_place_in_front(ch, node_name, lip_local, dist)` | ставит персонажа перед конструкцией по её ЖИВОМУ трансформу (переживает перемещение/поворот в сцене) | `y=0.2` |
| :651 | `_state_chain_high(ch)` | записывает КАЖДЫЙ переход с временем; pull-up через СВЕЖЕЕ нажатие после 0.3 с виса | окно 8 с, стоп через 1 с после второго ground |
| :696 | `_state_chain_low(ch)` | то же для ground-mantle | окно 6 с, 20 кадров оседания |
| :730 | `_print_timeline(tag, visited, times)` | печать таймлайна | — |
| :738 | `_assert_chain(suite, visited, expected)` | цепочка РОВНО как ожидается (длина + порядок) | — |
| :751/:778 | `_drive_to_mantle_high/low(ch)` | драйверы до входа в мантл | 5 с / 3 с, 20 кадров оседания |
| :802 | `_capture_climb(ch, skel, suite, top_y)` | общий верификатор: КАЖДАЯ кость каждый физ-кадр в мантле; шаг капсулы, шаг кости, руки на губе, «взлёт» меша, поп view-анкера, оседание | `max_body_step<0.12`, `mesh_float_max<0.70` («старый баг поднимал меш на ~1.5 м; допускаем естественные ~0.5 м клипа»), `max_view_pop<0.30`, `hands_lip_max<0.60` (только при `hand_weight>0.5`), `feet_top_err<0.30`, `settle_frames>30`, `settle_multi<1`, `settle_frozen<frames*0.5`, `feet_split<0.30`, `hip_above_feet>0.55`, `head_above_hip>0.20`; окно оседания начинается через `0.4 с` (штатный кроссфейд не считается «дракой») |
| :934/:944 | `_find_skel` / `_save(path)` | — | — |

## 22. `tools/*`

| :23 | `test_harness.gd:_init(suite_name)` | общий харнесс | — |
|---|---|---|---|
| :28 | `ok(cond, msg)` | ядро; всё идёт через него | — |
| :37/:41/:45/:49/:53/:57 | `eq / eqf / ge / le / lt / gt` | ассерты с печатью значений | `eqf eps 1e-3` |
| :62 | `done() -> int` | сводка + число провалов как exit-код | — |
| test_anim_blend:12 | `_init()` | 8 тестов кроссфейда | `DT = 1/60` |
| :26/:34 | `_test_jump_settles_to_jump / _test_jump_to_fall` | вес 1/0 | `0.12`, `0.8` |
| :42 | `_test_catch_has_no_fall_bleed` | ЛОВЛЯ посреди 0.8 с кроссфейда → вис ЧИСТЫЙ | прогон `0.3 с`, `0.25` |
| :55 | `_test_catch_fall_weight_monotonic_to_zero` | вес Fall только УБЫВАЕТ | 60 кадров, `1e-5` |
| :72/:82/:92/:100 | `mantle_from_ground_no_bleed / release_back_to_fall / land_to_locomotion / live_sequence_ground_fall_jump_catch` | без протечек по всем переходам | `0.3/0.2/0.8/0.12` |
| :114/:120 | `_run(b, secs)` / `_settle(b)` | прогон / до устойчивости | лимит 600 кадров |
| test_anim_state_machine:12 | `_init()` | 8 тестов; ключевой `_test_catch_from_jump` — «тот, который «никогда не случался» — из ВОСХОДЯЩЕГО прыжка» | — |
| run_tests.py:58 | `main() -> int` | 18 сьютов, каждый — свой процесс Godot, гейт по EXIT-КОДУ; фильтры по имени, `-v` | — |

## 23. Документы (кратко, что в них зафиксировано)

- `character-controller/design.md` — procedural-first: «Клипы — это «база позы»; финальную позу доводит процедурный риг». Порядок слоёв Input → Movement(+Surface) → AnimationBase → ProceduralRig. Таблица тюнинга (WALK/RUN 1.6/6.0, TURN_RATE 12, foot_ik 1.0, hand_ik 0.0, look_at 0.5, STEP_MAX 0.6). Обоснование Godot 4.6: «`SkeletonModifier3D` гарантированно отрабатывает ПОСЛЕ AnimationMixer, раз в кадр, модификаторы чейнятся». Явная замена ALS-варпинга: «вместо stride/orientation warping по 100 клипам — процедурный доворот таза + foot IK + темп клипа».
- `character-controller/animation-variety.md` — ПРЕДЛОЖЕНИЕ (не реализовано, кроме п.0 `sync=true`): джиттер playrate шумом ±5–8%, зеркальные idle-стойки + фиджеты 30–60 с, старт ходьбы «с правильной ноги» через сидирование фазы, зеркальные ноги прыжка, утилита зеркалирования клипа.
- `movement-controller/architecture-research.md` — TL;DR: «input → movement STATE MACHINE → drives an AVATAR (skeleton + layered animation + IK on top), fed by a LEDGE/REACH SENSOR, tuned by DATA». Таблица отображения индустриальных паттернов на наш код.
- `movement-controller/mantle-aaa-research.md` — «Мантл = root-motion клип + motion warping + IK, капсула несётся root motion'ом». Прямо говорит, что наш `Braced Hang To Crouch` поднимает бёдра только ~0.5 м и кончается стопами ~0.3 м НИЖЕ губы — «это pull-chest-to-lip, а не полный мантл». План из 5 шагов — в коде не доведён (см. §14).
- `movement-controller/testing-and-debugging.md` — три слоя тестов (A чистая логика / B рендерер с `debug_*` / C кадровый стенд), 6 «войн историй». Ключевые уроки: Bug 2 «выбросить Godot SM» — «единственное самое важное архитектурное решение в контроллере»; Bug 3 «неизвестный `set()`-путь падает МОЛЧА»; Bug 5 «`AnimationNodeAnimation` в BlendTree НИКОГДА не сбрасывается… `slotT` показал: прыжок 2 стартует с 0.85, доходит до 0.90 и ПРИШПИЛЕН там 24+ кадра при плоском `handY`» → фикс `AnimationNodeTimeSeek`; «**не поставляй рассуждение, поставляй измерение**».

---

# Порядок исполнения за кадр

**A. Физический кадр (`_physics_process`, 60 Гц)**

1. `SpiderCharacter._physics_process` (spider_character.gd:149) — **пишет** `view_offset = 0` («default: view sits exactly on the body; a state may offset it»).
2. `_resolve_input()` (:161) — **читает** `MovementInputSource` (ребро нажатия прыжка держится ВНУТРИ источника), **пишет** `_ctx.move` (camera-relative), `sprint`, `jump_pressed`, `climb_up = jump_pressed`, `release`.
3. `MovementController.step(delta)` (movement_controller.gd:28) → ровно ОДНО состояние:
   - **Ground** (ground_state.gd:12): читает `is_on_floor`, tuning; при прыжке сначала `LedgeSensor.probe` (физические лучи/shape-тесты) → либо `&"mantle"`, либо `velocity.y = jump_velocity` + `animator.jump(...)`; затем целевая скорость, доворот, `move_and_slide()`, `try_step_up` с восстановлением импульса, и в КОНЦЕ `animator.update(...)`.
   - **Air** (air_state.gd:24): сначала СЕНСОР+РЕШЕНИЕ (reach/commit), потом гравитация, `move_and_slide()`, `animator.update(...)`. Пишет `mantle_grip/wall_*/lip_y/hand_weight`, `predict_*`.
   - **Hang** (hang_state.gd:54): напрямую пишет `global_position` (lerp к якорю), `mantle_hand_weight`, `mantle_leg_weight`.
   - **Mantle** (mantle_state.gd:64): пишет `global_position` (L-путь), `view_offset` (стабилизация таза), `mantle_hand_weight`, `mantle_leg_weight`.
   - Переход: `exit(старого)` → `enter(нового)` — в `enter` MantleState берёт `animator.pelvis_world()` СТАРОГО клипа и пинит к нему таз нового: «чтобы бёдра не подпрыгнули на переходе».
4. `_fit_capsule_to_mesh()` (:102) — **читает** живые кости (Head/Hips/Feet) и `movement_state()`, **пишет** размер и позицию `CapsuleShape3D`. Порядок важен: капсула подгоняется ПОСЛЕ движения, по позе, которую дал предыдущий кадр анимации.
5. `_model.position = view_offset` (:156) — визуал отвязан от капсулы.

**B. Idle/рендер-кадр (`_process`)**

6. `SpiderAnimator._process` (character_animator.gd:109) → `_tick_blend` → `_blend.tick(delta)` → `set(ACTION_XFADE)`, `set(BASE_MIX)`. Комментарий стр. 110–115: «Advance the (unit-tested) crossfade in the SAME pass the tree advances. The tree is ALWAYS in IDLE callback mode… so the whole chain (tree → skeleton → IK SkeletonModifiers) runs in one settled pass, exactly as for the hang (which is why the hand IK actually pins the grip)».
7. `AnimationTree` (IDLE) считает позу: `Loco(BlendSpace1D sync=true) → TS(scale) → Base ← ActionXfade(SlotA/B через SeekA/B) → Mask(+Action оверлей) → out`.
   Причина режима IDLE (стр. 513–518): «In PHYSICS callback mode the foot IK (also a physics-step modifier) sampled a mid-update bone pose as the "animated foot" and splayed the legs — the broken idle. This NEVER changes at runtime: even the mantle keeps IDLE».
8. Цепочка `SkeletonModifier3D` в порядке дерева, вся ПОСЛЕ AnimationMixer (character_rig.gd:3–14):
   - **FootIKPrep** (:101) — «FIRST modifier in the chain, so `_process_modification()` sees the pure AnimationMixer pose (no IK feedback)». Читает позу микшера + `animator.is_foot_stance()/get_stride_factor()` + физическое пространство; пишет `foot_targets`, `pole_targets`, `foot_normals`, `foot_weights`, `foot_planted`, `foot_anim` и СДВИГАЕТ Hips (опускание таза).
   - **TwoBoneIK3D (Foot)** — решает обе ноги на цели, колени к полюсам.
   - **FootRotate** (:20) — «runs AFTER TwoBoneIK3D has solved the leg, so it reads the solved foot pose»; доворачивает ТОЛЬКО опорную стопу («swing feet keep the animation»).
   - **ClimbIKPrep** (:50) — «Runs BEFORE the arm TwoBoneIK so the targets it sets are current for the solve this frame»; при не-мантле жёсткий no-op `influence = 0`.
   - **ArmTwoBoneIK** — решает руки.
   - **LookAtModifier3D** — голова.
   - **JointLimits** (:53) — «LAST modifier in the chain, so it clamps whatever the clips and the IK solvers produced into biologically valid ranges»; «On a valid pose this is a near NO-OP».
9. `RigDebugDraw._process` (:46) — читает готовые поля prep, рисует.

**Почему порядок именно такой (цитаты кода):** prep обязан быть первым, иначе он получит позу с обратной связью IK; FootRotate обязан быть после решателя, иначе тилт затрётся; ClimbIKPrep обязан быть до решателя рук, иначе цель на кадр отстанет; JointLimits обязан быть последним, иначе IK сможет вывернуть сустав после клампа; дерево обязано быть в IDLE, иначе foot IK читает позу середины физ-апдейта; кроссфейд обязан тикать в ТОМ ЖЕ проходе, что дерево, иначе «слот-веса разъезжаются (A-pose leak)».

---

# Все числовые константы

**`character_animator.gd`**: `SOURCE="mixamo_com"` :20 · `XFADE 0.12` :23 (дефолт/взлёт) · `SETTLE_XFADE 0.3` :24 (оседание в idle) · `CATCH_XFADE 0.25` :25 (воздух→вис) · `FALL_XFADE 0.3` :26 («короче, чем длина one-shot прыжка ~0.9 с при срабатывании fall на ~0.56 с») · `APEX_VY -2.5` :29 (держать позу лип-прыжка, пока не явное падение) · `HIP_TRACK "Skeleton3D:mixamorig_Hips"` :52 · `UPPER_ROOT "mixamorig_Spine"` :53 · `CADENCE_MIN 0.85 / MAX 1.6` :64–65 · `STRIDE_MIN 0.7 / MAX 1.9` :66–67 · `STANCE_FRAC 0.30` :68 · `_walk_authored 1.5 / _run_authored 4.0` :83–84 (дефолты до измерения) · порог бега `0.45` и делитель `0.55` :140–141, :452–453 · `planar_speed>0.3`, `authored>0.1` :144 · mantle blend `0.2` :259 · idle-stance шорткат `pos<0.15` :444 · точки бленда `-1 / 0 / 0.45 / 1.0` :534–537 · `n=64`, порог stance-скорости `0.35` :650, :666 · `n=64` для окон :688 · fallback `1.5` :648, :677.

**`anim_blend.gd`**: дефолтные скорости `_xr = _br = 8.0` :19–20 · снап при `base < 0.05` :41 · `1/max(blend, 0.001)` :26, :32.

**`foot_ik_prep.gd`**: `WALL_FOOT_CLEAR 0.1` :21 · `ray_up 0.5` :23 · `ray_down 0.8` :24 · `corr_adapt 10.0` :25 (сглаживание ТОЛЬКО террейн-коррекции) · `contact_adapt 16.0` :26 · `hip_drop_adapt 7.0` :27 · `pole_dist 0.8` :28 · `plant_margin 0.05` :29 · `swing_margin 0.22` :30 · `max_step_drop 0.55` :31 (за ним «это обрыв, тянуть внутрь») · `max_hold 0.9` :44 · `plant_blend_rate 9.0` :45 · clamp delta `0.1` :116 · `+0.3` расширение фейда stance-контакта :160 · `|sf-1|>0.01` :180 · fade замка `smoothstep(max_hold*0.5, max_hold, gap)` :199 · порог таза `0.001` :217 · `lip_y-0.05` :237 · 6 шагов `_pull_to_ground` :274–275.

**`foot_rotate.gd`**: `weight 1.0` :10 · порог `w<0.01`, `normal·up>0.999` :31.
**`climb_ik_prep.gd`**: `pole_drop 0.45` :18 · `pole_out 0.2` :19 · `weight<=0.001` :53.
**`joint_limits.gd`**: колени `mixamorig_Left/RightLeg` ось `(-1,0,0)`, локти `(0,0,1)/(0,0,-1)`; все `min -5°`, `max 155°` :20–23 · `SWING_TOL 8°` :25.
**`character_rig.gd`**: `primary_limit_angle 70°` :142 · `secondary 60°` :143 · `look influence 0.5` :146 · `forward_axis 4` :140 · look-таргет `-basis.z*4.0 + up*1.5` :152 · `arm_ik.influence 0.0` :117.
**`rig_debug_draw.gd`**: `SPHERE_R 0.045` :13 · нормаль `*0.5` :70.
**`spider_character.gd`**: `_stand_height 1.7` :56 (из .tscn) · clamp высоты `radius*2` :119, :127.
**`movement_tuning.gd`** (Resource, всё экспортируется): `walk_speed 2.0` :8 · `run_speed 6.0` :9 · `accel 16.0` :10 · `decel 20.0` :11 · `turn_rate 12.0` :12 · `step_height 0.4` :13 · `step_margin 0.02` :14 · `jump_velocity 7.5` :17 («выше → больше времени в воздухе, чтобы лип-прыжок прочитался до падения») · `gravity 18.0` :18 · `air_control 0.2` :19 · `run_jump_speed 1.2` :20 · `mantle_min_h 0.55` :24 · `mantle_max_h 1.8` :25 · `mantle_reach 0.8` :26 · `wall_probe_h 0.45` :27 · `ledge_inset 0.32` :28 · `hand_spread 0.22` :29 · `body_radius 0.35` :30 (ОБЯЗАН совпадать с .tscn) · `stand_margin 0.12` :33 · `stand_clearance 1.6` :35 · `hang_min_h 1.8` :41 · `hang_max_h 2.6` :42 · `hang_drop 1.8` :43 · `anticipate_reach 2.6` :50 · `grab_dist 1.5` :51 · `reach_max 1.0` :53 · `reach_blend 0.12` :54 · `reach_band_min 0.2` :58 · `reach_band_max 3.2` :59 · `catch_time 0.4` :60 · `shoulder_h 1.4` :68 · `arm_reach 1.0` :69 · `grab_h_min 1.3` :70 · `min_grip_sep 0.18` :72 · `grip_clearance 0.35` :75.
**`ground_state.gd`**: `floor_snap_length 0.4` :18 · `floor_max_angle 50°` :19 · `max(vy,-0.1)` :23 · порог ввода `0.05` :32,:45,:54,:68 · backward `< -0.3` :68 · `anim_grounded: vy<=0.1` :67.
**`air_state.gd`**: анкер `-fwd*0.35` :45 · `_reach>0.01` :97.
**`hang_state.gd`**: `GRAB_BLEND 0.18` :8 · `-fwd*0.35` :34 · отпихивание `1.5` :75 · `grab_cooldown 0.5` :76.
**`mantle_state.gd`**: `RELEASE_SPAN 0.35` :9 · `STAB_TIME 0.25` :10 · `smoothstep(0,0.7)` / `(0.7,1.0)` :72–73 · `grip_in smoothstep(0,0.1)` :87 · hand_w `smoothstep(-0.1, 0.35)` :89 · leg_w `smoothstep(0.05,0.2)*(1-smoothstep(0.8,0.95))` :90.
**`ledge_sensor.gd`**: `FAN_DEG [0,-15,15,-30,30]` :12 · `+0.1 / +0.2` запас верхнего луча :58–59 · отсев стены `|n·up|>0.4` :117 · подъём капсулы `+0.03` :138 · шаг обхода угла `0.04` :155 · `+0.15/-0.2`, допуск `0.1` :169,:172 · глубина грип-бокса `0.25`, ширина `2*hand_spread+0.3` :181,:184 · смещение `0.02 / 0.03` :192 · `-up*0.4 - fwd*0.25`, луч `fwd*0.6` :201–202.
**`motion_warp.gd`**: эпсилоны `0.0001` :42,:47,:78.
**`foot_phase_lab.gd`**: `STANCE_FRAC 0.30` :16 · `n=64` :69 · шар `r 0.06` :143 · кадр каждые `0.18 с` :119.
**Пороги лаб-гейтов** (character_lab.gd): см. таблицу §21 — `0.30 / 0.55 / 1.05 / 0.20 / 0.02` (idle), `0.12 / 0.70 / 0.30 / 0.60 / 0.30` (climb), `0.05` (второй вес), `0.00005` (заморозка), `>30` кадров оседания.

---

# Как измеряются клипы (вместо ручного авторинга)

Всё делается в `_ready()` аниматора на ЖИВОМ скелете, до построения дерева.

**1. Авторская скорость клипа — `_measure_authored` (:645).** Ни `walk_speed`, ни «1.5 м/с» не вбиваются: скорость считается как СКОРОСТЬ СТОПЫ НАЗАД В ОПОРНОЙ ФАЗЕ.
1. `clen = длина клипа`; `n = 64`; кости `mixamorig_Left/RightFoot`; `scale = |skeleton.basis.scale.z|`.
2. `_ap.play(clip)`; для каждой из 2 стоп: 65 раз `seek(clen*k/n, true)` → собрать `zs[k]`, `ys[k]` из `get_bone_global_pose(b).origin`.
3. Порог опоры: `thr = min(ys) + (max(ys)-min(ys)) * 0.35`.
4. Для кадров с `ys[k] <= thr` собрать `|zs[k+1]-zs[k]| / dt`, где `dt = clen/n`.
5. Взять МЕДИАНУ (не среднее — устойчива к выбросам на отрыве/постановке), усреднить по двум стопам, умножить на масштаб скелета.
6. Нет скелета/клипа/данных → `1.5` (единственный fallback).
Результат печатается: `authored speed walk=… run=…`. Используется в `update()` для расчёта отношения `planar_speed / authored`.

**2. Stance-окна — `_measure_stance_window` (:682), для Walk, Run, RunBack.**
1. `n = 64` сэмплов высоты стопы (`seek` + `get_bone_global_pose().origin.y`), запоминая `lo`, `hi`.
2. Порог `thr = lo + (hi-lo) * STANCE_FRAC (0.30)`.
3. Найти САМЫЙ ДЛИННЫЙ непрерывный ран `ys <= thr`, сканируя `k in n*2` по модулю `n` — это даёт ЗАВЁРТКУ через шов лупа (опорная фаза может пересекать 0).
4. `best_len = min(best_len, n)`; результат — `Vector2(start/n, (start+len)/n)` в нормированной фазе.
5. В рантайме `is_foot_stance(i)` (:440) выбирает окно по скорости: `|blend| < 0.15` → всегда stance (идл: обе стопы на земле); `< 0.45` → Walk; иначе `Walk.lerp(Run, (pos-0.45)/0.55)`; отрицательный бленд → RunBack. Попадание через `_in_window` с учётом заворота.
Тот же алгоритм отдельно живёт в `foot_phase_lab.gd:_analyze` — там он ВИЗУАЛИЗИРУЕТСЯ (зелёный/красный шар), «чтобы окна можно было проверить глазами и доверять им, прежде чем они поедут в реальный foot IK».

**3. Высота голеностопа — `foot_ik_prep.gd:_ready` (:85).** Не число, а замер REST-позы: `ankle = |restY(Foot) - restY(ToeBase)| * scale_y`. Отсюда все пороги контакта строятся как `ankle + margin`.

**4. Длина клипа — `get_clip_length("ClimbUp")` (:264).** `MantleState` тактирует ВСЮ анимацию подъёма длиной клипа; `_dur <= 0` — это `push_error`, а не тихий дефолт.

**5. Срезание root motion — `_strip_root` (:633).** Для каждого клипа, кроме `ClimbUp`: все ключи hip-position заменяются на `(base.x, base.y или v.y, base.z)`, т.е. XZ всегда фиксируется на значении нулевого ключа, а Y — только для `STRIP_VERTICAL = ["JumpUp","RunJump"]` («физика/процедурка владеют подъёмом»). `ClimbUp` не срезается ВООБЩЕ — «его ПОЛНОЕ движение бедра (вверх И через) есть root motion подъёма».

**6. Профиль пейсинга клипа — `climb_hip_samples(n)` (:309) + `MotionWarp.profile_from_polyline` (:67).** Путь бедра читается НАПРЯМУЮ из данных клипа (`position_track_interpolate`, без возмущения плеера/дерева — безопасно вызывать в рантайме) и превращается в монотонный 0..1 профиль нормированной кумулятивной длины дуги, чтобы варп унаследовал «медленный замах, быстрый рывок, оседание». **В рантайме не подключено.**

**7. Верификация биндинга — `_verify_clip_binding` (:601).** Каждый скелетный трек резолвится ТОЧНО так, как это делает AnimationMixer: узел до `":"` от корня плеера, затем кость после `":"` на этом Skeleton3D. Комментарий: «find_bone alone is a false positive — the node prefix must resolve too, or the track silently animates nothing (rest / A-pose)». При непривязанных треках — `print` + `push_warning` с примером пути.
**8. Ретаргет путей — `_retarget_clip_tracks_to_runtime_skeleton` (:740).** GLB и FBX-«анимации-только» оборачивают тот же скелет разными путями (`Node/Skeleton3D:Bone` vs `Skeleton3D:Bone`) → каждый трек переписывается на путь живого скелета.
**9. Выбор клипа из файла — `_source_anim_name` (:763).** `mixamo_com`, иначе ЕДИНСТВЕННЫЙ; при нескольких — `push_error` и отказ: «Refuse to guess when a file has several — that would silently grab the wrong clip».

---

# Чем именно достигается качество (по вкладу)

1. **Мозг вынут из движка в чистую тестируемую математику** — `anim_state_machine.gd` (весь файл) + `anim_blend.gd` (весь файл), рендерер `character_animator.gd:215 _enter` + `:121 _tick_blend`. Кроссфейд ВСЕГДА перенацеливается немедленно (`anim_blend.gd:31`) → ловля/приземление прерывают любой блендинг мгновенно, «не заблокированы незавершённым переходом». Это то, что делает переходы читаемыми, а не «проглоченными»; в доке названо «единственным самым важным архитектурным решением».
2. **Опорная фаза измерена по клипу и владеет замком стопы** — `character_animator.gd:682 / :440` → `foot_ik_prep.gd:189–202`. Мировые XZ пришпиливаются на РЕБРЕ входа в stance (никогда не переиспользуется устаревшая точка) и отпускаются МЯГКО по мере уноса (`smoothstep(0.45, 0.9, gap)`), «easing обратно на анимацию вместо снапа далеко→близко». Убирает конькобежный скейтинг, не превращая походку в робота.
3. **Дерево в IDLE + кроссфейд в том же проходе** — `character_animator.gd:513–519` и `:109–118`. Именно это даёт foot IK «осевшую» рендер-позу вместо позы середины физ-апдейта (иначе — «сломанный idle с разъехавшимися ногами») и заставляет hand IK реально пришпиливать хват.
4. **Скорость разложена на КАДЕНС и ДЛИНУ ШАГА, обе от ИЗМЕРЕННОЙ авторской скорости** — `character_animator.gd:144–149` (`rate = clamp(sqrt(ratio))`, `stride = clamp(ratio/rate)`) → применение `foot_ik_prep.gd:178–184` (масштабируется только fore-aft компонента от таза, боковая не трогается, середина шага не меняется). Это ALS-подобный stride warping без ста клипов.
5. **IK как УЛУЧШЕНИЕ, а не замена: no-op на плоском** — `foot_ik_prep.gd:6–10`, `:146–173`. Сглаживается ТОЛЬКО вертикальная коррекция; база стопы следует анимации ТОЧНО («no XZ/base lag → the clip keeps its timing and weight»). На плоском коррекция = 0 → клип играет неизменным.
6. **Разделение stance/swing в контактном весе** — `foot_ik_prep.gd:155–163`. Опорная стопа встаёт на свою землю даже через большой перепад (лестница) и ТЯНЕТ ТАЗ ВНИЗ (`:214–220`); маховая стопа затухает по зазору и сохраняет анимационное движение. Без этого либо плавающие стопы на ступенях, либо «робот».
7. **Абсорбция ловли + антиципаторный reach** — `air_state.gd:29–66` + `hang_state.gd:54–66`. Руки летят к губе ЗАРАНЕЕ (широкая полоса высот; узкая только гейтит коммит), накопленный вес передаётся через `reach_carry` (`air_state.gd:55` → `hang_state.gd:33`), тело ЕДЕТ в якорь за `catch_time` — «Spider-Man wall-catch absorb, not an instant teleport».
8. **Анатомические лимиты в конце цепочки** — `joint_limits.gd:53–93`, swing-twist clamp относительно REST. «На валидной позе почти no-op», но не даёт IK вывернуть колено/локоть — то, что мгновенно читается как «кукла».
9. **Стабилизация таза на стыке клипов** — `mantle_state.gd:37–39`, `:78–82` + `character_animator.gd:366`. Таз нового клипа пинится туда, где был таз старого, и пин ЗАТУХАЕТ за `STAB_TIME 0.25` — «а не держится всю анимацию».
10. **Поворот стопы по нормали только у опорной стопы** — `foot_rotate.gd:20–42` (axis-agnostic: поворот на ту же дельту, на которую земля отклоняется от up, «works on any bone-axis convention without knowing the Mixamo foot's local axes»).
11. **Адаптивная капсула по живой позе** — `spider_character.gd:102–128`: низ у origin на локомоции (контакт с полом не двигается → нет приседа), низ у ТАЗА на висе/подъёме.
12. **«Euphoria-lite» контакт ног со стеной на подъёме** — `foot_ik_prep.gd:226–259`: анимированная стопа ПРОЕЦИРУЕТСЯ на поверхность, которую пробила, по весу ноги от контроллера; «мы не авторим позиции стоп».
13. **Геометрия карниза как данные, а не как «угадай»** — `ledge_sensor.gd`: веер лучей, обход внешнего угла (`:146`), мин. разнос грипов (`:95`), shape-тест места для СТОЯНИЯ (`:129`) отдельно от места для КИСТЕЙ (`:179`). Правило: «grab where you can reach, climb only where there's room».
14. **Синхронизация фаз бленда** — `character_animator.gd:533` `bs.sync = true` (одна нормированная фаза на все точки бленда — иначе стопы «едут» при Walk↔Run).
15. **Маска верха тела на спине** — `character_animator.gd:552–567` (обход к родителю, фильтр от `mixamorig_Spine` и выше). Механизм есть и доказан в лабе (`--mask`), но в геймплее не задействован.
16. **Гейты, которые судят РЕАЛЬНЫЕ кости, а не веса** — `character_lab.gd:31` («Asserted on ACTUAL bones (not blend weights — that is exactly what let this slip through)») и `:802 _capture_climb`. Это не механизм качества позы, но именно он не даёт качеству утечь.

---

# Чего из этого нет в three.js (`C:/projects/web-starter-kit/src/features/motion`)

Прочитано: 21 система, 12 компонентов, 3 сущности, каталог, скрипты измерения. Архитектура другая: `motionController.ts` (Quake-подобный slide-move) + два взаимоисключающих аниматора — `useLocomotionAnimator` (distance-matched бленд-дерево на весах) и `useMotionMatchedAnimator` (motion matching по базе поз), оба + `useOrientationWarp` + `useStrideWarpedLegs`.

| Механизм (Godot) | Статус в three.js | Где / что именно |
|---|---|---|
| Чистый тестируемый **мозг состояний анимации** (`AnimStateMachine`) | **ОТСУТСТВУЕТ** | Состояний анимации нет вообще; у контроллера только `MotionMode = 'falling' \| 'walking'` (`systems/motionController.ts:10`). Нет JUMP/FALL/HANG/MANTLE, нет охраны переходов по классу. |
| **Двухслотовый ручной кроссфейд с немедленным перенацеливанием** | **ЧАСТИЧНО** | `components/usePoseCrossfade.ts` — ровно 2 клипа (`playing` + `fading.from`), `CROSSFADE_SECONDS = 0.18`, вес через `setEffectiveWeight` + `mixer.update(0)`. Но: используется ТОЛЬКО в motion-matching-пути; `useLocomotionAnimator.ts:132–143` ставит веса напрямую без всякого кроссфейда. Проблемы «протухшего one-shot» нет структурно (время задаётся явно `action.time = …`), поэтому эквивалента `TimeSeek` не нужно. |
| **Измеренная авторская скорость клипа** | **ЕСТЬ, и сильнее** | `scripts/measure-animations.mjs`: тот же алгоритм (медиана скорости стопы в контакте, `CONTACT_HEIGHT_FRACTION = 0.3`, 60 Гц, стопа в системе таза с вычетом yaw) → `clipMetrics.json` (`impliedSpeed`, `rootSpeed`, `strideLength`, `contactShare`). Плюс `measure-ground-speeds.mjs` + `blender-bake-root-motion.py`: Blender печатает `BAKE_REPORT` и сборка ПАДАЕТ, если остаточное скольжение опорной стопы `> 0.02 м/с`. `catalog/locomotionClips.ts:54–58` предпочитает запечённую скорость измеренной. В Godot измерение — в рантайме, здесь — build-time с гейтом. |
| **Измеренные stance-окна** | **ДАННЫЕ ЕСТЬ, В РАНТАЙМЕ НЕ ИСПОЛЬЗУЮТСЯ** | `measure-animations.mjs:110 stanceWindow` (идентичный алгоритм: порог 0.3 диапазона, самый длинный ран, скан `count*2` с завёрткой) пишет `stanceWindows` в `clipMetrics.json`. Но ни один рантайм-файл их не читает: `ClipMetric` (`systems/locomotionPose.ts:19`) содержит только `durationSeconds` и `strideLengthMeters`. Аналога `is_foot_stance()` нет. |
| **Замок стопы / анти-скейтинг** | **КОД ЕСТЬ, НЕ ПОДКЛЮЧЁН** | `systems/footPlanting.ts` (92 стр.): `contactWeight`, `approachWeight`, `updatePlant` (замок с пересбросом при `stretched`), `plantedTarget`, `pelvisDropFor`, `DEFAULT_PLANT_MARGIN 0.06`, `DEFAULT_SWING_MARGIN 0.22`. Grep по `src/`: **ноль импортов** — файл-сирота (он же untracked в git). Фактическое поведение: стопа НЕ фиксируется в мире. |
| **Foot IK по террейну** | **ЧАСТИЧНО** | `components/useStrideWarpedLegs.ts:98–135`: box-trace вниз (`GROUND_PROBE_RISE 1.2 / DROP 2.4`, полуразмеры `0.02`), `groundedFootTarget`, `solveTwoBoneIk`. НО: (а) `if (speed < 0.05) return` — на idle foot IK вообще не работает; (б) нет различения stance/swing и нет сглаженного контактного веса → не «no-op на плоском», стопа зажимается к земле всегда; (в) нет `_pull_to_ground` для кромок/обрывов; (г) нет полюсов колена от тела (bend-направление из `solveTwoBoneIk`). |
| **Опускание таза** | **ЧАСТИЧНО** | `systems/strideWarp.ts:31 pelvisDropFor` — по ПЕРЕРАСТЯЖЕНИЮ ноги (`distance - legLength`), а не по глубине террейна; применяется мгновенно (`useStrideWarpedLegs.ts:115–122`), без аналога `hip_drop_adapt 7.0`. |
| **Stride warp (длина шага)** | **ЕСТЬ, но без разложения на каденс+шаг** | `systems/strideWarp.ts:12 strideScaleFor` + `warpedFootTarget` (проекция на направление шага — та же идея, что в `foot_ik_prep.gd:178–184`), лимиты `{minimum: 0.5, maximum: 1.6}`. Но отношение скорости НЕ делится между playrate и шагом: `playbackRateForSpeed` (`locomotionBlend.ts:35`, clamp `[0.5, 1.8]`) и `strideScaleFor` получают ПОЛНОЕ отношение независимо — эквивалента `sqrt(ratio)` нет. |
| **Синхронизация фазы шага** | **ЕСТЬ, и сильнее** | Настоящий distance matching: `locomotionBlend.ts:44 stridePhase(travelledMeters / strideLength)` + `locomotionPose.ts:98 syncedPhase` по ВЗВЕШЕННОЙ длине шага бленда; `travelledMeters` копится в контроллере (`motionController.ts:132`). Это строже, чем `BlendSpace1D.sync = true`. |
| **Orientation warping (доворот таза/спины)** | **ЕСТЬ в three.js, ОТСУТСТВУЕТ в Godot** | `systems/orientationWarp.ts` (`DEFAULT_PELVIS_YAW_LIMIT = π/3`, спина контр-вращается) + `components/useOrientationWarp.ts` (`warpRate = 8`, спина делится на `Spine/Spine1/Spine2`). В Godot этого нет — в `design.md` он числится как «замена ALS-варпингу», но реализован только stride warp. |
| **Motion matching** | **ЕСТЬ в three.js, ОТСУТСТВУЕТ в Godot** | `systems/poseSearch.ts` (`poseCost` взвешенный L2, `DEFAULT_SWITCH_PENALTY 0.35`, `continuationIndex`, `rankedPoses`, `poseAfter`), `motionMatchQuery.ts`, `trajectoryPrediction.ts` (`DEFAULT_ACCELERATION_TIME 0.18`, `DEFAULT_TURN_TIME 0.22`), `poseDatabase.json`, `useRootHistory` (прошлое) + `useMotionMatchedAnimator` (`SEARCH_INTERVAL_SECONDS 0.1`, `STANDING_SPEED 0.06`, `REPHASE_SECONDS 0.25`). `design.md` Godot прямо пишет: «Вне скоупа пока: … motion matching (нативно нет в Godot)». |
| **Анатомические лимиты суставов** | **ОТСУТСТВУЕТ** | Нет аналога `joint_limits.gd`: `solveTwoBoneIk` + `aimBoneAlong` применяются без swing-twist клампа и без REST-референса. Выворот колена/локтя ничем не ограничен. |
| **Поворот стопы на нормаль (FootRotate)** | **ОТСУТСТВУЕТ** | Позиция стопы правится, ориентация — нет; нормаль контакта из `boxTrace` доступна, но не используется для стопы. |
| **Маска верха тела / послойный бленд по костям** | **ОТСУТСТВУЕТ** | Нет аналога `Blend2 + filter` от `Spine`. Единственное частичное — `stepUpperAim` (`turnDynamics.ts:68`, `upperAimLimitRadians π*0.42`, `upperAimTurnSpeed 4.5`), но это число в состоянии, а не бленд позы: `upperAimRadians` нигде не применяется к костям. |
| **Look-at головы** | **ОТСУТСТВУЕТ** | Нет. |
| **Hand IK / хват карниза** | **ОТСУТСТВУЕТ** | Нет ни `ClimbIKPrep`, ни рук-решателя, ни `mantle_grip`. |
| **Ledge sensor + решение о хвате** (веер, `top_clear`, `grip_clear`, обход угла, `min_grip_sep`) | **ОТСУТСТВУЕТ ПОЛНОСТЬЮ** | Есть только `boxTrace.ts` (свип AABB по Минковскому) и `slideMove.ts` со step-up (`canStepUp`, `liftedStartForStep`, `maxStepHeight 0.45`) — то есть автозалаз на ступень, но никакой детекции/разметки карнизов. |
| **Hang / Mantle / Air-состояния, абсорбция ловли, антиципаторный reach** | **ОТСУТСТВУЕТ** | Нет. Даже прыжок есть только как `jumpVelocity` в профиле (`motionProfile.ts:20/32`), без анимационного состояния. |
| **Адаптивная коллизия по живой позе** | **ОТСУТСТВУЕТ** | `halfExtents` фиксированы в `MotionSettings` (`motionController.ts:33`); `MotionBody.tsx` рисует фиксированный wireframe-бокс. |
| **Срезание root motion в коде** | **ДРУГОЙ ПОДХОД** | Аналога `_strip_root` нет. Вместо этого клипы «рутуются» в Blender (`walking-rooted.glb`, `blender-bake-root-motion.py`), а трек `Hips.position` СОХРАНЯЕТСЯ и используется для масштабирования клипа на риг: `systems/clipScale.ts` (`clipToRigScale` = restY(Hips)/clipHipsHeight, `scaleClipPositions`) — этого в Godot нет. |
| **Зеркалирование клипа** | **ЕСТЬ в three.js, ОТСУТСТВУЕТ в Godot** | `systems/mirrorClip.ts` (свап `Left`↔`Right`, инверсия `q.y/q.z` и `pos.x`) — ровно п.5 из `animation-variety.md`, который в Godot остался предложением. Используется для `walk-strafe-left`. |
| **Верификация привязки треков / отказ угадывать клип** | **ЧАСТИЧНО** | `useLocomotionClips.ts:19` кидает, если в GLB не ровно один клип (эквивалент `_source_anim_name`); `clipScale.ts:13/20/26` кидает при отсутствии Hips/трека. Аналога `_verify_clip_binding` (проверка, что КАЖДЫЙ костный трек резолвится) нет — в glTF имена совпадают по построению, но молчаливый A-pose ничем не ловится. |
| **Детерминированный фиксированный тик + интерполяция рендера** | **ЕСТЬ, и сильнее** | `useMotionController.ts:45 useFixedTick` + хранение `{current, previous}` + `useInterpolatedMotion` и `lerp(previous, current, bus.alpha())` в `useLocomotionAnimator.ts:120`. В Godot тело идёт по `_physics_process`, а дерево по `_process`, без интерполяции позиции тела (вместо этого `PHYSICS_INTERPOLATION_MODE_OFF` на всех маркерах IK). |
| **Стенд, судящий РЕАЛЬНЫЕ кости pass/fail** | **ЧАСТИЧНО** | Есть 11 vitest-сьютов на чистые системы (`*.test.ts`: slideMove, boxTrace, strideWarp, poseSearch, turnDynamics, orientationWarp, locomotionBlend/Direction/Pose, motionController, motionVelocity, mirrorClip) — это слой A. Есть DEV-хуки `window.__motionAnimator / __motionLegs / __motionMatching` и `ui/MotionLabScreen.tsx`. Но НЕТ аналога слоёв B/C: ни ручного шага микшера, ни гейта по мировым позициям костей (`--idletest`, `--walktest`, `--climbhigh`, `--pullup`), ни единой команды-раннера с exit-кодами по сьютам вроде `tools/run_tests.py`. |

**Итого по three.js:** сильнее Godot в трёх местах — build-time измерение клипов с гейтом на остаточное скольжение, настоящий distance matching по пройденному пути, motion matching + orientation warp + зеркалирование, и честный фиксированный тик с интерполяцией. Отсутствует всё, что в Godot-версии и делает «тело, а не проигрыватель клипов»: анимационный конечный автомат с охраняемыми переходами и мгновенно прерываемым кроссфейдом, stance-фазовый замок стопы (код лежит неподключённым), разделение stance/swing в контактном весе и «no-op на плоском», анатомические лимиты суставов, поворот стопы по нормали, look-at, маска верха тела, и целиком весь климбинг-стек (сенсор карниза, hand IK, hang/mantle, абсорбция ловли, антиципаторный reach, адаптивная капсула).

**Две находки-расхождения в Godot, которые стоит знать:** (1) `MantleState` документирует и инициирует root-motion-привод тела, но `consume_root_motion_world()` не вызывается нигде — тело реально ведёт процедурный L-путь `smoothstep`, а `MotionWarp`/`climb_hip_samples`/`foot_offset_above_model`/`hands_offset_above_model`/`get_playrate` — мёртвый код в рантайме (план из `mantle-aaa-research.md` не доведён); (2) `SpiderRig.markup: RigForgeDocument` пробрасывается в `FootIKPrep.markup`, но нигде не читается — авторская разметка контактов пока не подключена, источником остаётся эвристика аниматора.
