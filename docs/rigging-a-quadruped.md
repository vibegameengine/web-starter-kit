# Rigging a quadruped, and getting its feet on the ground

Written after the hound. It cost far longer than it should have, and nearly
every hour of that went to one mistake repeated in six disguises: **measuring a
label instead of the thing.** Each number was correct. Each was about something
else. A rendered frame or a runtime reading settled it in seconds every single
time.

This is not a tutorial on Blender. It is the list of traps this project walked
into, so the next quadruped costs an afternoon.

## The rig gives you a contact point. Use it.

The single most useful thing about the hound's rig is not in any tool: **in the
rest pose, every `leg*_toe` tail sits at exactly z = 0.** The rigger put the
claws on the floor. That is a datum — a definition of "planted" that comes from
the asset and not from whatever pose you happen to be auditing.

Find that datum before anything else. Without it every threshold you write is
a guess, and the guesses have a way of being derived from the very pose you are
trying to check.

Two thresholds in this work were self-referential and could not fail:

- `PLANT = 0.051` — taken from the standing pose the probe was auditing. A
  broken stance certifies itself.
- `floor = out.lowest.min` — the floor defined as the minimum of the probe's own
  samples. A dog hovering a metre up scores exactly like one standing.

Both read as careful engineering. Neither could ever have returned a failure.

## The contact point is a BONE, not a fraction

`useFootPlant` originally placed the ANKLE, offset above the floor by
`ankleHeightFraction` — a fraction of the leg's length. That works on a biped:
an ankle is a roughly fixed distance above the sole.

A quadruped stands on its **toes**, and its ankle — the hock — rides far up the
leg. A fraction cannot stand in for that, and one fraction certainly cannot serve
four toes of different lengths and directions. Measured: a single
`contactHeightFraction` grounded the hind pair 0.037 m apart and tipped the whole
animal nose-up.

**Add leaf bones at the claws.** `legFL_tip` and friends, parented to the toe,
sitting exactly on the tail. Then the contact point is a thing with a world
position and the arithmetic disappears. This project already did the same for the
imp's `mixamorig:HeadTop_End`; it is the standard move for "glTF does not record
a leaf bone's length".

```python
tip = rig.data.edit_bones.new(leg + '_tip')
tip.head = toe.tail.copy()
tip.tail = toe.tail + (toe.tail - toe.head).normalized() * 0.02
tip.parent = toe
```

## Grounding a take with IK: end the chain AT the contact

The obvious approach — IK on the shin, aimed at where the ankle should be — does
not converge. Lowering the ankle rotates the knee, the foot and toe hang off the
shin, so the claw **swings as well as drops, sometimes upward.** Iterating made
it worse, not better: four passes ran 0.069, 0.119, 0.075, 0.135 m of error.

Put the IK on the TOE with `use_tail = True` and a chain long enough to reach the
hip, and target the claw directly:

```python
ik = rig.pose.bones[leg + '_toe'].constraints.new('IK')
ik.target = empty            # keyframed at the desired CONTACT position
ik.chain_count = 4           # toe, foot, lower, upper
ik.use_tail = True
```

One pass, exact. Keep the authored X/Y of the contact and change only Z, or the
stride gets retimed as a side effect.

For a stride, hold the bottom of the arc flat rather than letting it kiss the
floor for one frame — a paw that touches once per cycle still reads as floating.
And cap the swing: the capture threw the paws to 26% of the body's own height,
which is prancing, not running.

## The same feedback problem exists at RUNTIME

The runtime planter has the identical shape and needed the identical fix. It
steers the ankle but is asked for a claw height. One shot moved the forepaws the
wrong way — 0.047 m above the floor to 0.109 m.

Three **damped** passes, re-reading the claw each time:

```ts
for (let pass = 0; pass < 3; pass += 1) {
  // read hip, knee, ankle, contact
  const error = groundY - contactAt.y
  target.y = ankleAt.y + error * weight * 0.7
  // solve, aim thigh, aim shin
}
```

Damping under 1 is what makes them settle instead of trading overshoots.

## A planter that only LIFTS is half a planter

The standard rule is "only ever raise a foot that went under; pulling feet down
turns a run into a wade." True, and it left the hound hanging forever, because
its forepaws did not sink — they **hung**, 0.11 to 0.16 m up.

Pull down as well, but only within a range, and size that range against two
measurements that must not overlap:

- the hang it has to catch;
- the height a paw reaches at full stride, which it must not touch.

**Fade the pull to zero at the limit.** A hard cutoff makes the correction switch
full-on and full-off as a paw crosses the boundary — twice a step — and the gait
visibly tears. This was reported by the owner as "the animation is torn" and it
was not the animation.

A hard cutoff has a second failure that is worse: it makes the bad state
**absorbing**. A foot already past the limit is skipped, so it is never corrected,
so it stays past the limit. The planter switches itself off exactly when it is
needed.

## Traps in the export pipeline

**An action without a channel for a bone does not reset that bone.** It leaves
whatever the last action to play put there — and the glTF exporter bakes exactly
that. A hand-authored idle keying nothing below the chest measured 0.0005 m at
the claws, then 0.072 m after `run` and `bite` had been stepped through. Key every
bone explicitly so a take carries its whole pose.

**`rotation_mode` belongs to the pose bone, not the action.** Authoring one take
in euler while the others are baked quaternion leaves those baked actions driving
a channel the bone no longer reads. The exporter warns, once per bone per action;
ninety-six warnings are not noise.

**The exporter bakes every bone into every action.** So "the bite take moves the
jaw" is not evidence the bite played — the run take carries jaw curves too. Cut
takes down to the bones you want with a layer mask at runtime, and never use a
baked channel as proof of intent.

**`dropConstantChannels` deletes flat translation curves.** Correct in general —
a flat curve overrides the rest transform and this pipeline scales node
translations and animation outputs in separate passes. But it means a body offset
keyed on the root exists in Blender and **vanishes in the asset**. That is the
worst kind of fix: it measures right in the tool and is gone on screen. Put
corrections in bone rotations, or in the rest pose, never in a constant root
translation.

**`?meshopt` quantizes animation curves, not just geometry.** Takes left Blender
with all four claws within half a millimetre of the floor and arrived in the
browser scattered across 0.000 to 0.064 m. Do not remove the compression to make
this go away — absorbing exactly this is what a runtime planter is for.

**`nla.bake` leaves a LINEAR key on every frame.** A 21-frame cycle retimed to a
slower ground speed shows its corners. Set bezier with auto-clamped handles and
resample denser before exporting.

## Probes: the rules that were learned the hard way

- **Per leg. Never `min()` across four.** Folding four legs into one number
  answers "does ANY paw reach the ground". This animal's hind pair reached while
  the front pair never did; the fold reported 0.709 "planted" and hid the entire
  defect.
- **The floor comes from the scene or the engine.** Not from the samples, not
  from a comment, not from a screenshot.
- **A probe must be able to fail.** `found[n]?.getWorldPosition(v)` leaves the
  vector at zero, so a missing bone reads exactly like a frozen one. Throw the
  bone's name.
- **The registry must be keyed and cleaned.** One global slot names whichever
  body drew last; a map that never deletes fills with detached roots that report
  zero bones, which reads as "this creature has no skeleton" rather than "this
  creature is gone".
- **A bone is not a joint is not the skin.** `leg*_foot` is the ankle, `leg*_toe`
  is the joint inside the paw, the claw is below both, and a `Box3` over the
  whole animal is held down by the belly and the tail. Measuring the ankle and
  calling it clearance produced "the dog floats 18 cm" — a correct number about
  the wrong thing.
- **Name the subject.** In a wave, pick the body by its spawn key and throw if it
  is not there. Taking whoever rendered last is how a probe ends up describing an
  imp.
- **Watch the take AND the motion together.** A take name is not proof (it named
  three identical clips once), and motion is not proof of which take (baked
  channels). Read both, on the same body, in the same frames.

## Check the arena, not only the lab

An option added for the hound took the whole arena down: `{ ...DEFAULTS,
...options }` does not fall back for a key passed as `undefined`, it overwrites
the default with it. Every creature that did not set the new option threw on the
first frame. Every check had been run in the dog's own lab, where the only
creature is the one that does set it.

**The arm of the test that catches a regression is the one with the OTHER
subjects in it.**

## See also

- [`rigging-a-weapon-arm.md`](./rigging-a-weapon-arm.md) — the cultist's gun arm,
  and why "no fingers on the gun, nothing to cut" was wrong.
- `src/features/mob/components/useFootPlant.ts` — the runtime planter.
- `src/shared/lib/animation/legStepping.ts` — planting feet in world space and
  re-stepping in diagonal pairs, for movement in directions no take was captured
  for.
