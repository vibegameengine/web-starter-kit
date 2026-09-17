# In detail: how the references implement what is being built now

Three mechanisms are going into `src/features/motion` right now — stance windows
measured from the clip, the world foot lock driven by those windows, and the
split of speed between cadence and stride length. This is how the references do
exactly those, down to the numbers, so the port is checked against them rather
than against memory. Companion to `motion-controller.md` (what we built) and
`motion-reference-map.md` (the map of all three sources).

## 1. Measuring a stance window — notapain `character_animator.gd:682`

The window is sampled off the clip, never authored:

1. `n = 64` samples across the clip length. The clip is played, then
   `_ap.seek(clen * k / n, true)` forces the pose to that exact time — the
   second argument applies the seek immediately, so the bone read below is the
   pose at that time and not one frame stale.
2. Per foot (`mixamorig_LeftFoot`, `mixamorig_RightFoot`) the bone's height in
   the skeleton's global pose goes into `ys`, along with `lo` and `hi` over the
   whole clip.
3. The contact threshold is relative to that foot's own range:
   `thr = lo + (hi - lo) * STANCE_FRAC` with `STANCE_FRAC = 0.30`. Nothing here
   knows the rig scale or the ground height — a foot is down when it is in the
   bottom 30% of its own travel.
4. The window is the longest contiguous run under that threshold, and the search
   runs `for k in n * 2`, indexing `ys[k % n]`. The doubling is the whole trick:
   a stance window normally wraps the end of the cycle — it starts at 0.72 and
   ends at 0.21 — and a single pass would report two short runs instead of one
   long one.
5. `best_len` is clamped to `n`, so a clip that never lifts a foot cannot claim
   more than a full cycle, and the result is normalized:
   `Vector2(start % n / n, (start + len) % n / n)`.

## 2. Reading the window at runtime — `character_animator.gd:440`, `:457`

- Phase comes from the playing locomotion node:
  `fposmod(play_position / length, 1)`, and **−1 when not grounded** — in the air
  there is no stance, so no lock at all.
- Which window is tested depends on the signed blend position `_loco_blend`
  (negative means travelling backwards):
  - `|pos| < 0.15` — standing: **both feet count as stance**, so a standing body
    is pinned on both feet and cannot drift;
  - `pos < 0` — the `RunBack` window;
  - `|pos| < 0.45` — the `Walk` window;
  - above that, the `Walk` window **lerped toward** the `Run` window by
    `(pos - 0.45) / 0.55`. The windows blend, not just the clips.
- `_in_window(t, w)` handles the wrap explicitly: `w.x <= w.y` is the plain
  interval `t >= w.x and t <= w.y`; otherwise the window crosses the cycle end
  and the test becomes `t >= w.x or t <= w.y`.

## 3. The foot lock — `foot_ik_prep.gd:186-203`

```
was = foot_planted[i]
foot_planted[i] = animator.is_foot_stance(i)
if foot_planted[i] and not was:              # rising edge
    _plant_xz[i] = Vector2(final_pos.x, final_pos.z)
gap      = |Vector2(foot_world.x - _plant_xz[i].x, foot_world.z - _plant_xz[i].y)|
target_w = (planted ? 1 : 0) * (1 - smoothstep(max_hold * 0.5, max_hold, gap))
_plant_w[i] = move_toward(_plant_w[i], target_w, plant_blend_rate * delta)
final_pos.x = lerp(final_pos.x, _plant_xz[i].x, _plant_w[i])
final_pos.z = lerp(final_pos.z, _plant_xz[i].y, _plant_w[i])
```

Five decisions to copy exactly:

1. **The lock point is taken on the rising edge, from the position already
   corrected this frame** — after terrain correction and stride warp, never from
   a stored earlier point. The comment in the file says why: a stale point makes
   the foot jump.
2. **Only XZ is locked.** The foot's Y stays whatever the clip and the terrain
   correction produced, so a pinned foot can still ride a slope.
3. **The hold fades with distance, not with time**: `smoothstep` between half of
   `max_hold = 0.9` and `max_hold`. The further the body has carried the foot off
   its lock point, the weaker the pin — the release slides back onto the
   animation instead of snapping.
4. **The weight is rate-limited** by `move_toward` at `plant_blend_rate = 9` per
   second, so even an instantaneous change of stance state cannot pop the foot.
5. **The lock is a blend, not a replacement** — `lerp` toward the lock point by
   the weight, which lets contact weight and stance state disagree without a
   discontinuity.

Supporting numbers from the same file: contact smoothing `contact_adapt = 16`/s,
terrain-correction smoothing `corr_adapt = 10`/s, pelvis smoothing
`hip_drop_adapt = 7`/s, ground ray `0.5` up and `0.8` down, plant margin `0.05`,
swing margin `0.22`, `max_step_drop = 0.55`, knee pole `0.8` in front of the knee.

## 4. Cadence versus stride — `character_animator.gd:144-150`, `foot_ik_prep.gd:177-184`

The authored speed to compare against is itself blended: `_walk_authored` below
`speed_norm = 0.45`, and above it
`lerp(_walk_authored, _run_authored, (speed_norm - 0.45) / 0.55)`.

Then, only while actually moving (`planar_speed > 0.3`):

```
ratio  = planar_speed / authored
rate   = clamp(sqrt(ratio), CADENCE_MIN = 0.85, CADENCE_MAX = 1.6)
stride = clamp(ratio / rate, STRIDE_MIN = 0.7, STRIDE_MAX = 1.9)
```

`rate` goes to the mixer's time scale; `stride` goes to the IK layer. The square
root is the point: a body moving twice as fast steps `sqrt(2)` more often and
`sqrt(2)` longer, which is what a person does. Sending the whole ratio to the
play rate — what this kit does today — gives a sped-up recording; sending it all
to the stride gives a long, floaty one.

The stride factor reaches the foot in the IK pass:

```
fwd       = -body.global_transform.basis.z
hip_world = skeleton.global_transform * skeleton.get_bone_global_pose(hips)
fore      = (final_pos - hip_world).dot(fwd)
final_pos += fwd * (fore * (stride - 1.0))
```

Only the fore-aft component relative to the pelvis is scaled: the lateral offset
is untouched, and a foot directly under the hip (`fore ≈ 0`) does not move at
all. Mid-stride is unchanged and only the extremes grow.

## 5. The same three in Unreal

- **Stride scale** — `AnimNode_StrideWarping.cpp:209`:
  `strideScale = locomotionSpeed / rootMotionSpeed`, then clamped and
  interpolated through `StrideScaleModifierState.ApplyTo`. Unreal does not split
  the ratio the way notapain does: cadence is set outside the node by
  `SetPlayrateToMatchSpeed` (`AnimDistanceMatchingLibrary.cpp:222`) and the warp
  takes what is left. Both arrive at the same place — part cadence, part stride.
- **Where the scaling happens** — `AnimNode_StrideWarping.cpp:233-247`: the thigh
  is projected onto the floor plane through the foot along gravity to give the
  plane origin, the foot is projected onto the plane whose normal is the stride
  direction to give the scale origin, and the foot's offset from that origin is
  scaled. On flat ground with an upright pelvis this is the same point notapain
  gets by taking the pelvis directly.
- **Foot locking** lives in `AnimNode_FootPlacement.cpp` and is a much larger
  machine: plant types decided per foot (`DeterminePlantType:601`,
  `WantsToPlant:706`), plant offset and planting plane interpolated separately
  (`UpdatePlantOffsetInterpolation:473`, `UpdatePlantingPlaneInterpolation:494`),
  a planted foot able to pivot about the ball rather than the ankle
  (`GetFootPivotAroundBallWS:738`), and the pelvis solved against the range each
  limb can still reach (`FindPelvisOffsetRangeForLimb:280`, `SolvePelvis:1911`).
  Of that file I have read the function map, not the bodies — the full read is
  with a dedicated reader. I am not describing an algorithm I have not read.

## 6. What the port must therefore change

| Number | Source | Where it belongs here |
| --- | --- | --- |
| stance threshold `lo + 0.30 × range` | `character_animator.gd:709` | clip measurement pass |
| 64 samples, doubled search for the wrap | `character_animator.gd:687-718` | clip measurement pass |
| both feet planted below `0.15` blend | `character_animator.gd:446` | runtime stance lookup |
| walk→run window lerp above `0.45` | `character_animator.gd:452` | runtime stance lookup |
| lock on the rising edge, XZ only | `foot_ik_prep.gd:192-194` | leg pass |
| hold fade `smoothstep(0.45, 0.9, gap)` | `foot_ik_prep.gd:197-199` | leg pass |
| lock weight rate `9`/s | `foot_ik_prep.gd:200` | leg pass |
| contact `16`/s, correction `10`/s, pelvis `7`/s | `foot_ik_prep.gd:26-28` | leg pass |
| `rate = clamp(sqrt(ratio), 0.85, 1.6)` | `character_animator.gd:147` | animator |
| `stride = clamp(ratio / rate, 0.7, 1.9)` | `character_animator.gd:148` | animator |
| knee pole `0.8` ahead of the knee | `foot_ik_prep.gd:22` | leg pass |
| knee hinge `−5°…155°`, swing tolerance `8°` | `joint_limits.gd:19-28` | new joint-limit pass |
