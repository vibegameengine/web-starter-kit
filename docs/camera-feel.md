# Making the camera turn feel good

A design note for the arena's first-person view. Written because "the camera
turns unpleasantly" is a real defect with real causes, and every one of them is
a timing problem rather than a taste problem.

The complaint that started it, verbatim: *forward movement feels very pleasant,
but the moment I start turning the camera it is some kind of nightmare — it feels
like the framerate is dropping, though it is 120.*

That sentence contains the diagnosis. Read on.

## 1. What "unpleasant turning" actually is

It is almost never latency. Players are surprisingly tolerant of a few
milliseconds of delay and surprisingly *intolerant* of uneven speed. A picture
that is uniformly 10 ms late looks fine; a picture that moves 8 px, 8 px, 16 px,
8 px looks broken — and it looks broken in a very specific way, namely **like the
framerate dropped**, because an occasional double-size step is exactly what a
dropped frame produces.

So the thing to optimise is not "how fast does input reach the screen" but **how
constant is the on-screen angular velocity for a constant mouse velocity**. That
is a measurable quantity, and it is the acceptance criterion for everything
below.

**Why turning and not walking.** Both are driven by the same simulation clock, so
both are quantised the same way. The difference is what the quantisation does to
the image:

- A translation error of a couple of millimetres moves the picture by a fraction
  of a pixel. It is also partly hidden by the head bob and the step smoothing,
  which are already moving the eye.
- A rotation error of a fraction of a degree moves **every pixel on the screen**,
  and it moves them all in the same direction, which is precisely the signal the
  visual system is best at detecting.

This is why "walking is fine, turning is a nightmare" is not a contradiction. It
is the expected shape of the bug.

## 2. The three causes, in the order they matter

### 2.1 The view angle must not be owned by the simulation

This is the big one, and it was the state of this codebase.

The arena simulates at a fixed 125 Hz (`ArenaCombatSimulation.tsx`,
`stepHz={125}`). The camera was built from `state.yaw` / `state.pitch`, which
only change inside a tick. At 120 fps a frame is 8.333 ms and a step is 8.000 ms,
so the accumulator gains a third of a millisecond per frame and **every ~24th
frame gets two steps instead of one**. Constant mouse movement therefore arrives
on screen as an angular velocity that doubles about five times a second.

Fiedler names this exact mechanism in *Fix Your Timestep!*:

> There is no nice multiple so the accumulator causes the simulation to alternate
> between mostly taking one and occasionally two physics steps per-frame when the
> remainders "accumulate" above dt.

The fix is not to change the tick rate. 125 Hz is a good rate and the solver
wants it. The fix is that **view angles are not simulation state**. They are
client state, updated the moment the mouse reports movement, and the simulation
*samples* them to build the aim it shoots along.

This is what shooters have always done. In Quake, `cl.viewangles` is updated in
the mouse handler and the `usercmd` merely carries the value the client already
holds; the renderer never waits for a server tick to know where you are looking.
The gamedev.net consensus for a fixed-timestep engine is the same shape: move the
rotation into the render loop so the orientation is 1:1 with the mouse, and keep
the *logical* orientation for gameplay.

It is worth being explicit that this costs **nothing** in correctness. Because
the yaw integration is `yaw -= delta` and not `yaw -= delta * dt`, total rotation
is conserved no matter when it is sampled. Turning is not a physical process
being integrated; it is a value the player sets.

**Status: implemented.** `systems/viewAngles.ts` owns the angle,
`useArenaInput.ts` moves it in the `mousemove` handler, `ArenaPlayerCamera.tsx`
reads it, and `advanceArenaCombat` receives it as an absolute angle.

### 2.2 The world must be interpolated between ticks

Fixing the angle fixes the angle. It does not fix the fact that the *world* is
still drawn from whichever tick happened to finish most recently.

Fiedler again, and this is the residual defect after 2.1:

> the majority of render frames will have some small remainder of frame time left
> in the accumulator that cannot be simulated because it is less than dt. This
> means we're displaying the state of the physics simulation at a time slightly
> different from the render time, causing a subtle but visually unpleasant
> stuttering.

His remedy is to keep the previous state as well as the current one and blend
them by `alpha = accumulator / dt`:

```
State state = currentState * alpha + previousState * (1 - alpha)
```

Two things make this matter more while turning than while walking, which is why
it shows up now: turning sweeps static geometry across the whole screen at high
angular speed, so a sub-tick error in the eye POSITION becomes a visible slide of
the entire scene; and once 2.1 has made the rotation perfectly smooth, the
position stutter is no longer masked by a rotation stutter of the same period.

**Status: not implemented.** `FixedTick.tsx` computes the leftover time and
throws it away — `advanceFixedStep` returns it and the component ignores it. The
camera reads `state.pmove.position` raw.

**Design.** Expose the accumulator's alpha on the tick bus, keep the previous
tick's eye position beside the current one, and have `ArenaPlayerCamera`
interpolate. Only the *camera* needs this to fix the complaint; entities can be
converted later, one at a time. Keep the interpolation on POSITION only — the
angle already comes from the client and interpolating it would reintroduce the
lag 2.1 removed.

The cost is one tick of positional latency (8 ms), which is invisible, against a
stutter that is not. This is the standard trade and every engine takes it.

### 2.3 Sample every mouse report, not one per frame

A 1000 Hz mouse produces about eight reports per 120 fps frame. The browser
merges them: `pointermove` is delivered once per frame with the intermediate
samples folded in. For turning that is usually fine, because `movementX` sums —
no motion is lost.

What *is* lost is when the motion happened, and that matters at the extremes. MDN
is direct about the trade:

> user agents coalesce multiple updates into a single event. This helps with
> performance as the user agent has less event handling to perform, but there is
> a reduction in the granularity and accuracy when tracking, especially with fast
> and large movements.

Two APIs recover it:

- **`getCoalescedEvents()`** — returns the un-coalesced samples merged into one
  event, so a fast flick can be reconstructed at full resolution.
- **`pointerrawupdate`** — delivered ahead of `pointermove`, "intended for
  applications that require high-precision input handling and cannot achieve
  smooth interaction using coalesced `pointermove` events alone."

Both carry a warning worth repeating, also from MDN: *because listening to
`pointerrawupdate` events can affect performance, you should add these listeners
only if your JavaScript needs high-frequency events and can handle them as
quickly as they are dispatched.* And both are marked **Limited availability** —
not Baseline — so neither may be depended on. Whatever we do here must degrade to
plain `mousemove` without a branch in the hot path.

**Status: not implemented.** Ranked third deliberately: it is a refinement worth
single-digit percent, where 2.1 was worth a factor.

## 3. What NOT to do

**Do not add mouse smoothing.** A low-pass filter over the input would make every
number in §4 look better while making the game feel worse, because it achieves
evenness by drawing an angle the player has not asked for yet. That is input
latency wearing a disguise. It is also the single most reliably hated option in
shooters — players hunt for the setting and turn it off, and where it cannot be
turned off they say so loudly. The goal is to remove quantisation, never to
filter over it.

**Do not add mouse acceleration** for the same reason: it breaks the constant
relationship between hand distance and view angle that aim is built on.

**Do not lower the tick rate to "match" the display.** It cannot be matched: the
display rate is the player's, it varies between machines and it varies within a
session. A simulation that chases it is a simulation with no fixed timestep, and
this project has a written rule about that for good reasons.

**Do not let effects leak into the view angle.** Head bob, damage shake and
recoil are supposed to move the eye, not aim it. A bug of exactly this kind was
found while writing this note: `ArenaPlayerCamera` added the horizontal bob and
shake to the camera's POSITION but built the `lookAt` target from the un-bobbed
position, which turned a 3.5 cm sideways offset into about two degrees of yaw
oscillating at 12.6 Hz for the length of a damage flash. The vertical channel was
correct, and the asymmetry is what gave it away. Fixed; the target is now offset
from the eye rather than from the body.

## 4. How this is judged

Not by a screenshot. **A still frame carries no temporal information**, and every
defect in this document is temporal. Judging smoothness from a PNG is not
possible, and any process that tries is theatre.

The measurement, in `wip/camera/turn-smoothness.mjs`: drive the view at a
constant angular rate **in time** so the input contributes no jitter of its own,
then sample the angle the camera was actually built from once per animation frame
and differentiate it.

| Metric | Meaning | Target |
|---|---|---|
| `angularVelocityCV` | spread of per-frame angular velocity / its mean | as near 0 as frame pacing allows |
| `stalledPercent` | frames where the view did not move at all while the mouse did | 0 |
| `worstOverMedian` | p99 frame speed ÷ median frame speed | ~1.0; this is the number a player reads as a dropped frame |

The probe reports two columns from the same frames and the same input — the
client angle the camera uses now, and the simulation angle it used before — so
the improvement is a comparison rather than a memory of how it used to feel.

The final word stays with the person playing. These numbers say the pipeline is
no longer adding unevenness; they do not say the sensitivity, the field of view
or the bob amplitude are right, and those are taste.

## 5. Order of work

1. ~~View angles owned by the client, sampled by the simulation.~~ Done.
2. ~~Stop the horizontal bob and shake from rotating the view.~~ Done.
3. Interpolate the camera's eye position between ticks by the accumulator alpha.
   This is the residual stutter and the next thing to do.
4. Consider `getCoalescedEvents()` / `pointerrawupdate`, behind a capability
   check, with plain `mousemove` as the floor.
5. Expose sensitivity as a live dial so the person with the opinion can turn it
   while playing instead of describing it.

## Sources

- [Fix Your Timestep! — Glenn Fiedler](https://gafferongames.com/post/fix_your_timestep/) — the accumulator, the one-or-two-steps-per-frame beat, and interpolation by the leftover alpha.
- [MDN — `PointerEvent.getCoalescedEvents()`](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents) — what coalescing costs in granularity and accuracy.
- [MDN — `pointerrawupdate` event](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointerrawupdate_event) — high-precision input delivery, and its performance and availability caveats.
- [GameDev.net — FPS style camera best practices](https://gamedev.net/forums/topic/706949-fps-style-camera-best-practices-advice/) — moving rotation into the render loop while the logical state stays on the fixed step.
- [Raw input explained for FPS games](https://mousedpianalyzer.com/post/raw-input-explained-fps-games/) — why raw, unsmoothed input is the default expectation in shooters.
