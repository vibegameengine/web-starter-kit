# Lessons from working on this codebase

Written by an agent, from mistakes it actually made here, each one with the
evidence that exposed it. Not general advice — every entry is a thing that went
wrong in this repository, and the rule that would have caught it.

Kept in `docs/` and not in `wip/`, because `wip/` is gitignored and a lesson
nobody can read tomorrow is not a lesson.

---

## 1. A check that cannot fail is not a check

The worst failure mode here, and it happened three times.

**The tautological proof.** After moving the muzzle flash inside the shotgun
prefab, the old position was compared against the new one to prove nothing had
shifted. The numbers matched exactly — `0.0000, 0.3198, -1.3769`, delta zero.
But the old expression was `pitched(S·[0, y, −z], p)` and the new one was
`Rx(p)·Ry(π)·S·[0, y, z]`, and `Ry(π)` maps `[0,y,z]` to `[0,y,−z]`. The two are
the *same expression written twice*. The delta is zero at any scale, for any
model, forever. It also went stale unnoticed: the quoted numbers were taken at
`SHOTGUN_VIEW_SCALE = 1.65` and the value moved to 1.9 and then 2.09 without
anyone re-running it — precisely because a check that cannot fail is never
suspected.

**The probe that could not fail.** A dropped-draw counter (`getError()` after
every draw) was cited as proof that a `gl.depthRange` change was sound.
`depthRange(0, 0.02)` is entirely valid GL and raises no error. The counter
proved the frame was complete; it could never have said anything about the
depth trick.

**The regression harness written to pass.** A "no regression" probe asserted
exactly the four values that had been preserved and omitted the one that moved
(a shared weapon hold). It also never reached the scene at all — `canvas.__r3f`
is undefined in this build — and returned a PASS shape regardless.

**The rule.** Before running a check, say out loud what a FAILING result would
look like. If you cannot describe one, you have not built a check. Then confirm
it: plant the fault and watch the check go red. `./node_modules/.bin/tsc` was
trusted only after a deliberate type error made it exit 2.

## 2. An instrument that measures itself

A turn-smoothness probe drove the view at a constant rate from its own
`requestAnimationFrame` callback and read the camera's angle from a *different*
rAF callback. Its headline number tracked machine load monotonically — 87 fps →
0.29, 64 fps → 0.50, 57 fps → 0.65 — and its median was exactly `1.6` in every
run, which was exactly the rate the probe itself injected. It was measuring the
phase race between two callbacks, not the camera.

**The rule.** If the number moves when nothing about the subject moved, it is
measuring the harness. Sample inside the same callback that writes the value, and
prefer *error against a known input* over *spread of a derived quantity*: error is
frame-rate invariant, a coefficient of variation is not.

## 3. Do not reconstruct a value the system already has

Interpolating the camera between fixed ticks needs `alpha` — how far into the
current tick this frame falls. It was reconstructed as `frameDelta / stepSeconds`.
A frame is *longer* than a step whenever the display is slower than the
simulation: at 125 Hz against 120 fps that is `8.33 / 8 = 1.042`, clamped to 1 on
**every frame**. The interpolation was dead and was reported as working.

The correct value — the clock's leftover accumulator, in `[0, step)` by
construction — was already computed in `FixedTick.tsx` and thrown away, and
`renderInterpolation.ts` already exported a tested `interpolationAlpha()` that
nothing called.

**The rule.** When a quantity is being derived, first grep for it. Something
upstream usually already knows it exactly, and a derivation is a second source of
truth that will drift.

## 4. Verify against something you did not write

The sculpted shotgun was checked with a bench readout that measured a model the
bench itself had just posed using the calibration constants — it could only ever
print back what it was fed. Meanwhile
`grep -rn 'shutgun/image' src scripts wip` returned **zero hits**: the reference
renders the artist supplied, the only artefact on disk that says what the gun is
supposed to look like, were never used. Once they were, the silhouette scored
IoU 0.947 with a threshold declared before the run and controls proving the metric
discriminates (full square 0.447, mirrored 0.506).

**The rule.** Rank your anchors. A file authored before you started and outside
your control beats your own instrument every time. The placeholder you are
replacing is not an anchor: "better than the placeholder" is satisfied by
anything.

## 5. Find things by identity, not by difference

Locating the muzzle marker by diffing two frames returned 30 000 changed pixels
centred on the control panel (its text had reflowed), then 726 scattered along
every edge of the gun (anti-aliasing between two page loads). Giving the marker a
colour that exists nowhere else and searching for *that* returned 194 pixels in a
19×20 box, with a control frame proving zero false positives.

**The rule.** A difference includes everything that changed, including your own
UI and the renderer's noise. When you can make the thing you are looking for
unique, do that instead.

## 6. Effects belong to the thing they come out of

The muzzle flash lived beside the weapon in the mount's frame, so every change to
how the gun was held needed a matching correction to keep the flame on the barrel.
That grew, one bug at a time, into a per-weapon offset table, a per-weapon size
table, a pitch rotation, a yaw rotation and a scale ratio — five pieces of code
whose only job was to re-derive a relationship that should never have been broken.
Mounting the flash on a named socket *inside* the prefab deleted all five.

**The rule.** If moving A forces you to update B, B belongs inside A.

## 7. A shared knob is not a per-thing knob

Tuning the first-person hold for the shotgun silently moved the rocket launcher
and the railgun, because all three read one `WEAPON_HOLD`. The code looked
entirely reasonable either way; it was caught by pixel-diffing both weapons
against a pre-change worktree (26.7 % / 21.4 % of pixels differing, filled
silhouettes — not edges).

**The rule.** Before tuning a value, list everything that reads it. And when a
change is claimed not to affect X, that claim needs its own evidence — arithmetic
about what you *intended* is not evidence about what you *did*.

## 8. Zero is not off

`LabStage` mounted its sun at whatever intensity a lab asked for, including zero.
A light with no intensity still **casts**: it costs a full shadow pass, and it
makes the scene hold two shadow-casting suns whenever the subject brings its own.
The cached shadow rig refuses to cache a scene with more than one, so the arena
had been running the uncached fallback path — `[shadows] fallback (more than one
shadow-casting light) — 0 static casters baked` — with nobody aware of it.

That message only named its reason after the rig was taught to report it; before
that it printed a bare `fallback`, and three completely different causes with
three different fixes were indistinguishable.

**The rule.** Skip the thing, do not dim it. And when code degrades to a slower
path, make it say *why* — a scene can sit in the slow path for weeks otherwise.

## 9. A still frame has no time in it

The complaint was "turning feels harsh, like the framerate is dropping, though
it's 120". Every candidate cause was temporal. The habitual loop here — launch a
headed browser, sleep 13 seconds, screenshot, look — is structurally incapable of
answering that, and one of its frames led to an enemy's glow being mistaken for
the muzzle flash.

**The rule.** Match the instrument to the defect's dimension. For smoothness:
sample a time series, or hand a build to the human. For a position: make the
subject hold still — a `?socket=1` query and a static bench beat bursting nine
screenshots at a 60 ms flash in a yard full of moving lights.

## 10. Report the number the user thinks in

Look sensitivity sat at `0.0022` radians per mouse count for the whole session
without anyone reacting to it. Expressed the way players actually talk about it,
that is **9 cm per 360° at 800 DPI**, against the 20–50 cm band people really use
— two to five times too fast. Alongside a horizontal FOV of 66° where shooters
ship 90–106°, that was the actual cause of "harsh", and no amount of fixing the
timing would have touched it.

**The rule.** Convert internal constants into the unit the complaint is phrased
in before concluding the constants are fine.

## 11. Instruments that will be re-run belong in `scripts/`

`.gitignore:19` is `/wip/`. Roughly 500 lines of probes were written into it
against ~300 lines of product, none of which anyone else can run and none of
which survives the branch — while `scripts/arena-probe.mjs`, tracked and already
driving the same DEV seams, went unused. That repo's own file says it: *a
conformance claim nobody else can re-run is not a claim.*

**The rule.** `wip/` is for a frame you look at once and discard. Anything with a
pass/fail criterion goes in `scripts/`, in the same change.

## 12. Build the dial before the sixth screenshot

Six rounds of live art direction — bigger, lower, lower again, nose up, right and
up — each cost a browser launch and ~14 seconds of hardcoded sleep while the
person with the opinion sat waiting. Fifteen lines exposing the values on
`window.__arenaWeaponDebug` would have let him turn them himself.

**The rule.** More than two rounds of "adjust and screenshot" on the same value
means stop and expose the value. The human is a better instrument than any of
these probes, and they are usually idle.

## 13. The tree is shared

Another agent committed to this working tree mid-task and swept in-flight files
into its own commit; a failing test and six type errors belonged to its edits, not
to this work. Time was spent proving that.

**The rule.** Before claiming a failure is yours or is not, check
`git status --porcelain` on the file and its neighbours, and re-read the failure
rather than quoting one you saw earlier — an in-flight file changes underneath
you between runs.

## 14. Do not start a second dev server

One was started on another port to build a pre-change baseline. The user noticed
and was rightly annoyed. It was also unnecessary three times over: the previous
component was still in the tree, `git stash` would have served, and the baseline
wanted was a number rather than a picture.

**The rule.** Reuse the running server. When a baseline is needed, ask in order:
is the old code still in the tree? Will `git stash` do? Is the baseline a number
rather than an image? Only then consider a second process.

## 15. Say plainly when a claim of yours was wrong

Several claims in this session were stated with confidence and were false: that
the interpolation worked, that the launcher and railgun had not moved, that
throttle and caching were independent knobs. Each was corrected only because
something external — a critic, a pixel diff, the user — pushed back.

**The rule.** When a claim turns out to be wrong, correct it in one plain
sentence, name the evidence, and say what it changes. An action justified by a
false statement gets undone, not defended: the shadow-throttle change was
reverted for exactly that reason, and the file is byte-identical to `HEAD` again.

## 16. Fix the pipeline, not the copy of it you happened to open

The shotgun's muzzle socket kept vanishing between the file on disk and the
model in the game. The build script was found to call `flatten()`, which
collapses a node hierarchy, and `prune()`, which deletes nodes with no mesh and
no children — which is exactly what a socket is. That was fixed, and the socket
was still gone.

The same two calls lived in `vite/glbAssetOptimizerPlugin.ts`, which reprocesses
every `.glb` at import time. `flatten()` spares animated nodes, so `barrels`
survived and the static empty `muzzle` did not — a failure shaped precisely to
look like "the export is broken".

Counting afterwards, the same sequence had been written independently in **four**
places, and `scripts/build-mob-model.mjs` already carried a *workaround* for it:
an empty node registered as a skin joint purely so `prune()` would count it as
referenced. The root cause was known in this repository before any of this
started.

**The rule.** When a transform eats something, grep for the transform, not for
the file you were editing. Then put it behind one exported function so the next
pipeline cannot get it wrong independently. Cost of keeping the nodes, measured
across every model here: 572 bytes, 0.079%, on the worst one.

## 17. Bake it into the asset, not into the code that reads the asset

The gun arrived facing the wrong way, at the wrong scale, with its origin inside
the grip's swing. That was "fixed" with a yaw, a scale and an offset held as
constants and applied every frame — plus a hand-typed muzzle position beside
them. Three files had to agree, none could notice a re-export, and when the
barrels were later animated the constant could not express a moving point at all.

The user had asked for the model to be fixed in Blender in the first message. It
was misread as a request about the DEV bench, and everything above is what that
misreading cost.

**The rule.** A correction applied at runtime is the asset's problem being paid
for once per consumer, forever. If the fix belongs in the file, put it in the
file — then delete the constants rather than tuning them.

## 18. Prove the gate fires before trusting it — and check what it points at

Five faults were planted into the shotgun's asset gate — a renamed socket, a
socket moved to the origin, parts stripped of geometry, a clip emptied of
channels, a clip that also moves the body — and each produced its own named
failure. That is the right exercise: a check that has never gone red is a check
nobody has tested.

It is also not sufficient. Planting faults proves a branch *fires*; it does not
prove the branch is *pointed at the right thing*. The same gate read its
comparison anchor from a path that may not exist on a fresh clone, and no planted
fault could have revealed that, because every plant assumed the anchor was there.

**The rule.** Mutation-test the branches, then separately ask what the check
COMPARES AGAINST and whether that thing is present, external, and unmodifiable by
you. Make a missing anchor a loud red, never a crash and never a quiet pass.

## 19. Measure the thing, not a picture of the thing

Locating a part on screen by diffing two frames returned 30 253 changed pixels
centred on the control panel, then 726 scattered along the model's edges. The
object knew where it was the whole time: one `getObjectByName` and a world matrix
answer it exactly, in millimetres, in both the bench and the running game.

The same applies to the question that actually mattered — *does the action move
while the gun stays still?* Barrels 52 mm against body 0 mm is an answer. Two
screenshots of a gun are not.

**The rule.** For anything with a position, ask the scene graph. Keep pixels for
questions that are genuinely about pixels — colour, shading, whether a thing
reads — and even then, find it by an identity you control rather than by
difference.

## 20. Work in a shared tree is not saved until it is committed

Another agent committed to this repository four times in twelve minutes while
roughly five hundred changed lines, a rebuilt runtime asset and a new source
export sat unversioned. Nothing about them was unfinished: the gates passed, the
typecheck was clean, the tests were green.

**The rule.** In a tree someone else is writing to, the window between "it works"
and "it is committed" is the risk. Stage explicit paths, never `-A`, and do it as
soon as a coherent piece stands up — not at the end of the session.

## 21. A check that names its own weakness in a comment is still weak

The shotgun's asset gate compared triangle counts and then, knowing a count is
invariant under any partition, added a bound on how far forward each part
reached. Its own comment said so: *"A random half of the faces would pass it. So
the parts also have to be separated ALONG the barrel."*

That bound does not test what the comment claims. A reviewer built a mutant that
moved twelve hundred triangles out of the MIDDLE of the receiver into the
barrels — a gun that would visibly shred on every shot — and neither extreme
moved, so the gate printed the identical separation and passed.

Writing down the weakness felt like handling it. It handled nothing.

What actually catches it: the parts' island counts against the source's, their
vertex totals, and how far the two parts' extents OVERLAP along the gun. The
mutant now trips five conditions at once — overlap 100% against 2.6%, islands
1856 against 1484, vertices 30.8% adrift, triangles 33.6% adrift, and the
barrels no longer in front of the body.

**The rule.** When you catch yourself writing "so we also check X", stop and ask
whether X can fail for the reason you just named. Then build the mutant and run
it. A comment is not a control.

## 22. Beware the assertion that cannot be false

The runtime gate reported "arena body travel 0.0 mm" beside "barrels 48.9 mm" as
if two measurements agreed. It read `node.position` — the part's LOCAL transform.
No animation channel targets the body, so its local position is a constant and
that number could not have been anything but zero, however violently the whole
prop wobbled.

It got there honestly: the previous version measured in world space, which left
the camera's recoil rotation in and produced 7.3 mm of artefact against an 8 mm
threshold. Moving to the local frame removed the artefact by moving to a frame
where the question cannot be asked.

**The rule.** After changing what a measurement is relative to, re-derive what a
FAILING value would look like in the new frame. If there isn't one, the fix
deleted the test rather than the noise. The real guarantee here was structural
and elsewhere: the asset gate asserts no animation channel targets `body`.

## 23. Deleting a correction moves the burden, it does not remove it

The gun's yaw, scale and origin were baked into the asset and the constants that
used to apply them were deleted. That was right. But the checks that replaced
them tested topology, sockets and animation — and not scale. A re-export at ten
times the size would have passed every clause: the split still follows the
barrel, the islands still partition, the clip still moves the barrels, and the
game gets a cannon.

**The rule.** When code stops correcting for something, something has to start
checking it. List what the deleted code was protecting against before deleting
it, and give each item a home.

## 24. One definition, or it will be wrong in the copies

The `flatten`/`prune` fix was applied, then applied again, then found to be
needed in three more places, and the "shared" function it was extracted into was
imported by two call sites while four others kept a hand-copied literal. Six
copies of three lines; the bug had already been got wrong in four of them, and
one file carried a documented WORKAROUND for it.

A `.ts` module cannot be imported by the project's `.mjs` build scripts. A `.mjs`
module with a `.d.mts` beside it can be imported by both. That detail is why the
first extraction did not take.

**The rule.** "Extracted into a shared function" is a claim about call sites, not
about a file existing. Grep the call sites and count them.

## 25. In first person, motion along the view axis is not motion

Four muzzle-blast layers were built to travel at four different speeds and it
read no better than the stationary blob it replaced. They all travelled along the
bore, and the bore points away from the eye — so every one of them arrived as a
size change. Measured: the on-screen centroid moved 2 px over the whole life of
the effect while its area grew 6.2x.

Nothing about the code was wrong. The axis was.

**The rule.** Before animating anything a camera will watch, ask which axis that
camera can resolve. Depth is not one of them. For a first-person view model the
resolvable axes are across the view and off to the side; travel toward or away
from the eye has to be sold by something else entirely, or not attempted.

## 26. A metric with a big term that is not the thing measures the term

`blastBrightness` existed to catch a muzzle flash that got brighter after the
shot. It summed the drawn area of each layer — and added `light * 0.02`, which
looked like a rounding detail and was 46% of the total at t=0, decaying faster
than any layer. The old, known-bad growth curve was pasted back in and the whole
suite stayed green while every layer underneath crescendoed by 12.8%.

The same metric weighted a ten-sprite layer the same as a one-sprite layer,
because the sprite counts lived in the renderer where the metric could not see
them, while the metric's own docstring said it weighted the layers "correctly".

**The rule.** A metric may contain only the quantity it claims to measure, in the
units it is drawn in. Every extra term is a place the signal can hide, and the
terms that hide it best are the ones that look too small to matter. Then prove it
by feeding it the defect it was built for and watching it go red.

## 27. Do not conclude a layer is broken because you cannot see it — tint it

Three arena captures in a row were read as "the smoke layer is not drawing at
all". A magenta tint pushed through the DEV dial showed six puffs, correctly
positioned, correctly sized, correctly faded. They were spread across a wide ring
at a third opacity, and a warm grey over a light floor at that density is an 8%
change — invisible in a screenshot and entirely present in the frame buffer.

Half an hour went into hunting a draw bug that did not exist.

**The rule.** "It is not rendering" and "it is rendering and cannot be seen" look
identical and have opposite fixes. One tint, or one dump of the live material and
transform, separates them in a minute. Do that before opening the renderer.

## 28. Give the measurement a noise floor, not just an off switch

The on/off control for the smoke reported 44% of the frame changed. The arena
keeps running while the blast is frozen, so what it had measured was monsters
walking between the two captures. Differencing two IDENTICAL captures gives the
floor the signal has to clear — after which the honest numbers appeared: 6.94% at
90 ms against a 0% floor, 0.26% at 220 ms.

The harness this replaced had the same disease and shipped a conclusion from it:
it kept the lower 55% of the frame to "exclude the HUD", and the HUD is in the
lower 55% of the frame.

**The rule.** A control that switches your effect off only proves the metric is
not hallucinating. It says nothing about what else was moving. In a live scene,
measure the noise floor as well, and print both.

## 29. A floor with no ceiling passes the defect it was written for

"Ejecta travel ≥ 0.25 m" scored 0.62 m — the effect flying clean out of frame —
as a 2.5x pass. The successor made the same shape of mistake one level down:
"ring radius comfortably larger than blob width" was satisfied at 3.5:1, where
the cloud comes apart into confetti, having been written to prevent 1:1, where it
saturates into a lamp.

**The rule.** Most visual quantities are good inside a band and wrong on both
sides of it. Write the ceiling at the same moment as the floor, and put the
defect each edge prevents in the sentence next to it.

## 30. Four defects, four reviews, and all four were "done" in my own report

One session, four independent reviews, four real defects:

- a gate that did not parse and exited 1 on every tree — while its exit code was
  being cited as proof that deleting the effect broke it;
- a completely stationary lamp passing the floor added specifically to require
  motion;
- a tautology used to justify deleting the only criterion the work was failing
  ("the metric falls when I improve the property" — it measured growth AFTER a
  point, so moving that point forward necessarily left less growth to measure);
- a citation attributed to a source whose archived text contains none of its
  words, defended twice, once as "corroborated elsewhere" with no elsewhere
  named and once as "unverifiable" when the Wayback copy was one lookup away.

Every one of those was listed as COMPLETE in my own report at the time. Not
hedged, not flagged as shaky — done. And the reason is not carelessness, it is
structural: each was checked by the same reasoning that produced it, so the check
inherited the error. The gate that could not parse was "verified" by running it
and reading the exit code I expected. The lamp was caught by a test I wrote from
my own model of what a lamp looks like.

**The rule.** Self-verification finds mistakes; it does not find assumptions. If a
claim rests on something you also built — a gate, a metric, a citation you chose
— then checking it yourself tests the implementation and skips the premise. Hand
those to someone who does not share the premise, and hand them the CLAIM rather
than the code, because the code will lead them down the path you already walked.

And when four reviews in a row each find something: the correct update is not
"the reviews are thorough", it is "my reports are not evidence".
