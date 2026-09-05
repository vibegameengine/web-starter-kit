---
name: gauntlet-loop
description: Run work through a gauntlet of adversarial agents until it survives — fan out harsh critics on separate lenses plus one with no lens, dispatch builders on disjoint file sets, and iterate against a fixed target until the critics go quiet. Use when the user asks to fan out sub-agents, wants a harsh critic checking the result, says the output "does not look like" a reference or concept image, asks to loop until it is right, or wants a blockout-then-assets pass.
version: 3.0.0
---

# Gauntlet loop

Run the work through a gauntlet: build it, then set adversaries on it, fix what
survives scrutiny, and go again until the critics go quiet.

It exists because the naive loop — look at your own output, tweak, look again —
converges on something that satisfies you and nobody else. One agent judging its
own work is really just checking that the code did what was typed. A gauntlet
replaces that with people who are paid to disagree.

Written for driving a rendered scene toward a reference image, which is where it
was proven, but the shape holds for anything with a fixed target and a critic who
can look at the result: a UI against a design, a document against a spec, an API
against its contract. The *judgement* transfers as written. Some of the
*mechanics* do not — measuring pixels, and splitting work across builders who
each own files — and those are dealt with under **When the target is not a
picture** and **When there is only one file**. Everywhere else, where the text
says "render" or "frame", read "the thing you are making".

Three things ship beside this document, and they exist because the process did
not work without them:

- **[`example/`](example/)** — one complete run, end to end. The bar written
  before starting, the reference, the blockout, three passes, the five critic
  prompts as sent, two rounds of real critic output, both consolidated defect
  lists, both rejection logs. Every instruction here that sounds abstract has a
  concrete instance there. **Read it once before running this.**
- **[`harness/`](harness/)** — five commands that turn a rendered thing into
  numbers. Without them "demand numbers" is an instruction nobody can obey.
- **[`templates/`](templates/)** — the critic and builder briefs as blanks.
  Authoring five critic briefs and two ownership lists per builder is the bulk of
  the real labour.

(They live beside this file in `github.com/vibegameengine/gauntlet-loop`.)

## Rule zero: the work stays inspectable

The user can, at any moment and without asking, open the current build and drive
it themselves. The dev server stays up, the build stays runnable, and no change
leaves the tree in a state that cannot be opened. If a refactor must break the
app, it breaks for one agent inside one file set, never for the URL the user has
bookmarked.

This is not politeness. A fan-out is opaque by construction: several file sets
change at once, for minutes at a time, and a prose update lets the user only
agree or disagree with *your* account of it. Something they can open and poke at
lets them stop you early — which is the entire value of running the loop in the
open.

## The three rules that make it work

**1. The reference is the artefact the user gave you. It is never your own output.**
Say the path out loud in every prompt: *the reference is `path/to/concept.png`*.
The moment a scene you built starts being called "the reference", the loop has
lost its anchor and every later comparison is self-congratulation. Name your own
scene "the recreation" or "the attempt". If the user gave you a sentence rather
than an artefact, see **When the target is a description**; do not start
building and let the result become the definition of what was asked.

**2. Blockout before assets.** Rebuild the reference's composition first as
flat-coloured boxes at true size and position, with the camera locked to the
reference's framing. Composition arguments are settled there, cheaply. No model,
texture or light rescues a layout that is wrong — and a beautiful asset in the
wrong place reads as *worse* than a box in the right place, because it invites
you to stop looking. ([`example/attempt/blockout.html`](example/attempt/blockout.html)
is nine grey rectangles, and it caught a coordinate-origin error that every
measurement taken afterwards would have carried.)

**3. Verify every asset ALONE before it enters the scene.** One asset, several
angles, a close-up, a checker map on its UVs, and a wireframe. A row of nine
props at gameplay distance hides exactly the defects that matter: smeared UVs, a
wrong pivot, a silhouette that collapsed under decimation. Build the harness
once; it pays for itself the first time it catches a broken atlas.

## The loop

```
manager: render current state  →  fan out CRITICS (read-only, parallel)
                                        ↓
                              consolidate into one defect list
                                        ↓
              fan out BUILDERS (disjoint file ownership, parallel)
                                        ↓
                          re-render  →  repeat until critics go quiet
```

### Critics

Blank brief: [`templates/critic-lensed.md`](templates/critic-lensed.md),
[`templates/critic-unlensed.md`](templates/critic-unlensed.md). Five filled-in
ones, and the critiques they produced:
[`example/prompts/`](example/prompts/) and
[`example/critique/round-1.md`](example/critique/round-1.md).

- **Parallel, read-only, one lens each.** Composition & layout · materials &
  texture · lighting & colour · props, scale & silhouette. Each is told
  explicitly *not* to comment on the other lenses; overlap produces four vague
  reviews instead of four sharp ones.
- **Always run one UNLENSED critic alongside them.** Lenses have a blind spot
  exactly where they meet: four reviewers produced forty defects between them and
  every one of them missed that the road was the wrong *shape*, because each
  assumed the overall form belonged to somebody else's lens. Brief this one as
  the opposite of a lens — squint at both images, name the three biggest shapes
  in each, say what the reference is *doing to the viewer* that we are not — and
  tell it explicitly that things falling between the categories are its job.
- **Give each critic the reference path and every render path**, and require it
  to open them. A critic that reasons from your summary reviews your summary.
- **Demand numbers.** "Too dark" is unusable. "Our midtones are rgb(93,97,78),
  the reference is rgb(136,95,77), set the hemisphere sky colour to X" is a
  patch. Ask for: the file, the symbol, and the value to write.
- **Instruct them to be harsh and to skip praise** except one closing sentence.
  Ask for a ranked list, worst first, capped (about 10) so they prioritise.
- Critics may render extra views themselves — give them the screenshot commands.

**You cannot demand numbers without shipping a way to get them.** This is the
single most common way the loop fails on its first outing: five critics are
dispatched with a brief they have no means of satisfying, and five of them come
back with adjectives. Before the first fan-out, put a measuring command in every
critic's prompt, verbatim, along with the render command. In pixels that is
[`harness/`](harness/) — colour at a point, the bounding box of a feature and its
delta from the reference, runs of flat colour along a scanline, and one overall
difference number. In other domains it is a validator, a coverage report, a
benchmark; see **When the target is not a picture**. Whatever it is, the critic
must state the command it ran, so a builder can rerun it and see the same number.

**The single most valuable thing a critic can do is find the cause, not the
symptom.** In the worked example, "the button looks a bit high" became "exactly
42 px high, and the cause is the four-line wrap, not the padding" — and that
mattered, because the obvious fix would have been wrong: padding alone lands the
button 27 px short of where it belongs. That is what a measurement buys. It is
not bureaucracy, it is the difference between fixing it and moving it.

### Consolidation

The manager writes one defect list per round and dispatches **that**, not the raw
critiques. Format:
[`templates/consolidated-defects.md`](templates/consolidated-defects.md); real
ones at the foot of both files in [`example/critique/`](example/critique/).

One table. One row per change: `# | which critic | file/symbol | change | value`.
Every row must name a symbol and a value — a row you cannot express that way is
a critic's finding that never became a patch, and it goes back to the critic
rather than forward to a builder.

**Order it cause before consequence.** The change that moves other measurements
goes first, so nobody measures against a value that is about to move. In practice
that is form, then position, then type, then surface, then detail. Two critics
naming the same symbol collapse into one row citing both. Two critics naming the
same *symptom* through different symbols stay as separate rows only if the fixes
compose — if they do not, one of them is wrong about the cause, and that is the
next paragraph.

**When two critics prescribe different values for the same symbol, do not
average them and do not take the harsher one.** Decide which critic owns the
*cause*, write that one's value, and record the other in the rejection log with
the reason. If neither owns the cause, the unlensed critic breaks the tie — a
contradiction between two lenses is by definition sitting on the seam between
them, which is the unlensed critic's whole remit. In the worked example the
typography critic measured a cap-height ratio and prescribed 26px for both the
heading and the price; the unlensed critic pointed out that equal sizes preserve
the wrong reading order, because in the reference the eye lands on the price
first. The list says 25 and 27. Both critics were measuring correctly; only one
of them was measuring the thing that mattered.

Two more sections belong in the file and nowhere else: **rejections** (what the
last round's builders overruled, and what this round reverses) and **closed**
(defects whose cause has been identified as unfixable — see **Stopping**). Give
every critic the closed list, or they will file them again forever.

### Builders

Blank brief: [`templates/builder.md`](templates/builder.md); a filled-in one:
[`example/prompts/builder.md`](example/prompts/builder.md).

- **Disjoint file ownership is the whole ballgame.** Give every builder an
  explicit *you own exactly these files* list AND an explicit *these files are
  being edited by another agent right now, do not open them* list. Two agents in
  one file loses work silently.
- When a fix genuinely belongs in something another agent owns, the builder does
  not edit it and does not skip the fix: it produces **a self-contained patch you
  apply yourself**. In code that is usually a new file exporting one function. It
  can equally be a diff, or — if the artefact is not code — the exact replacement
  text with enough surrounding context to locate it.
- **Every builder verifies visually before reporting.** Give it the exact
  screenshot commands and require it to open the PNGs. Require the typecheck and
  the test suite. Tell it which pre-existing errors to ignore, by message, or it
  will "helpfully" fix another agent's half-finished work.
- **Let builders overrule the critic.** Numbers from measurement are still
  guesses about intent; require the builder to report what it rejected and why.
  This is a required section of the report, not an optional one — a builder that
  reports no rejections has usually not checked. It is also how the loop catches
  its own overcorrections: in the worked example, round 2 *reversed* a round-1
  change rather than stacking a second fix on top of it, because the rejection
  log made it visible that round 1 had fixed a real symptom using the wrong
  variable.

### When there is only one file

Disjoint file ownership is how you get parallelism *safely*; it is not the point
of the exercise. Critics parallelise regardless — they are read-only, and five of
them on one file is the normal case. Builders cannot. So for a single-file
artefact, or any artefact too small to partition:

Run the critics in parallel as always. Consolidate as always. Then **apply the
list yourself, serially, in the consolidated order**, and write the rejection log
by hand as you go. Re-render, and go again. You lose nothing that mattered: the
value was never in having several builders, it was in having several critics and
one ordered list. The worked example is exactly this shape, and it moved the mean
pixel error from 17.09 to 9.98 in two rounds without a single parallel builder.

If the edit is genuinely too large for one pass, **split by round, not by
agent**: land the form fixes, re-render, re-critique, then land the rest. Never
put two builders in one file to save minutes — the ordering guarantee you give up
is worth more than the minutes, and you will not be able to tell afterwards which
change caused which measurement to move.

### Manager (you)

- Do the cheap, unambiguous, single-file fixes yourself while agents run.
- Never dispatch a second agent onto a file you have already given away.
- Relay each critic's findings to the user as they land, and separate *already
  fixed while it was thinking* from *still outstanding* — critics review a
  snapshot and go stale.

## Stopping

Define the bar before starting, in terms the loop can actually evaluate: the
reference path plus a measurable budget (frame cost, asset bytes, target device),
plus the frame every verification will be rendered in. Write it to a file before
the first build — [`example/BAR.md`](example/BAR.md) — because a bar you can
revise silently at round three is not a bar. "Until it looks AAA" never
terminates. If the user's stated bar is unreachable — matching a 200 GB native
title in a browser — say so in two sentences, then propose the reachable version
rather than starting an infinite loop.

**Cap the rounds in the bar, before you start.** "Until the critics go quiet" is
the stop *condition*; the cap is the stop *guarantee*, and you need both, because
critics asked to be harsh will always find a tenth thing. Three rounds is usually
right: in the worked example the first round moved the error by 4.4, the second
by 2.8, and the residual after that was dominated by something no round could
fix. When you hit the cap with defects outstanding, stop and hand the user the
list — that is a result, and it is a better one than a fourth round chosen by an
agent that cannot stop.

**A defect whose cause is unfixable gets closed, in writing, once.** A licensed
typeface you do not have, a proprietary asset, a physical limit of the target
device. Measure the residual, write it into the bar as an accepted deviation, and
tell every subsequent critic that it is closed. Without this the loop cannot
terminate: a naive critic re-files it every round, forever, and each round it is
still true. Closing it is not giving up — it is the difference between "we did
not match the typeface" and "we matched the ink metrics to within 4 px and the
remainder is the typeface, measured, accepted".

## When the target is not a picture

The judgement in this document is about comparison against something fixed, and
that is domain-neutral. Two mechanics are not.

**Measurement.** "Demand numbers" does not mean pixels; it means a quantity a
builder can reproduce. Substitute in kind: a count with a denominator ("12 of the
17 required fields are documented"), a diff, a latency, a byte size, a coverage
percentage, a schema validator's exit code, the number of spec clauses with no
corresponding test. The requirement that survives translation is not the unit —
it is that **the critic states the command it ran**, so the builder can run it
and see the same number, and so the next round can tell whether it moved.

**Partition.** Lenses are still the right shape and they are still the leverage.
For a document against a spec: coverage of the spec · correctness of each claim ·
structure and navigability · the reader who has never seen this before · plus the
unlensed one. For an API against its contract: surface conformance · error and
edge-case behaviour · naming and consistency · performance and limits · plus the
unlensed one. What does not survive is builder partition when there is one file;
see above.

## When the target is a description

Rule 1 requires a reference the user gave you and forbids you generating it. If
what the user gave you is a sentence, there is a step before round 1, and it is
not building.

**Turn the sentence into an artefact you both agree is the target, and get it
confirmed before anything is built.** There are two honest ways. Find a real
external exemplar — a competitor's page, a published spec, an existing API's
documentation, a photograph — and have the user confirm that this is what they
mean. Or write the bar as a list of checkable assertions, in the user's terms,
and have them sign it; the assertion list then *is* the reference, and critics
are briefed against it exactly as they would be against an image.

Either way the target exists outside your output and is fixed before round 1.
What you must never do is build something, look at it, and let it quietly become
the definition of what was asked — that is the failure rule 1 exists to prevent,
arriving by a different door. If the user will not or cannot confirm, pick one,
say which you picked, and state your assumptions where they can see them. A
target you named and they ignored is still a target. A target you inferred and
never mentioned is a trap you set for yourself.

## Pitfalls

<!-- APPEND whenever the loop surfaces a new one. Each entry: the symptom as
     seen, then the cause, then the rule. General ones go in the first list;
     ones that depend on the domain go in the second, with enough symptom that a
     reader in another domain can recognise the shape. -->

### General — these apply to any run

- **An agent iterating on its own work never gets past "looks good".** Cause:
  building and judging collapsed into one continuous act, so the judging is
  really just checking the build did what was typed. Rule: require the critique
  to be a SEPARATE act with its own output — screenshot, then write down the
  three worst things and what is amateur about each, before touching code. One
  agent asked to do this on a UI caught itself shipping the exact pattern its
  brief forbade, twice running, and said so in writing.
- **Judged on the wrong frame.** Cause: reviewing wide desktop captures for a
  product that ships portrait on a phone. Symptom: a look tuned so the sky ramp
  finishes below the top of the actual viewport, or roadside detail that
  collapses into a 40-pixel scribble. Rule: every verification screenshot is
  taken in the SHIPPING aspect and size, and sub-agents are told so explicitly.
  Put it in a file the tooling reads rather than in a flag people forget.
- **Everyone reviews the dressing; nobody reviews the FORM.** Cause: a lensed
  fan-out partitions the picture, and the shape of the primary subject — the
  road, the building, the body — belongs to no partition. Symptom: dozens of
  accepted small fixes and a result that still does not look like the reference.
  Rule: the unlensed critic above, plus a manager habit of asking "what did all
  four agree not to look at?"
- **Two critics are both right and they contradict each other.** Cause: each
  measured correctly inside its own lens, and the lenses disagree about which
  measurement matters. Symptom: two rows in the defect list prescribing different
  values for one symbol, on the first round. Rule: whoever owns the *cause* wins;
  if that is unclear, the unlensed critic breaks the tie, because a contradiction
  between two lenses sits on the seam between them by construction.
- **The same defect is filed every round and it is true every time.** Cause: its
  cause is something you cannot change — a licensed font, a proprietary asset, a
  device limit — and nobody wrote that down. Symptom: the loop will not
  terminate and each round's list looks like the last one's. Rule: close it in
  writing with the residual measured, put it in the bar as an accepted deviation,
  and hand the closed list to every subsequent critic.
- **A round applies the whole defect list and the result gets worse.** Cause: a
  fix that addressed a real symptom through the wrong variable, which then blocks
  the real fix. Symptom: the overall difference number moves the wrong way while
  every individual row was applied correctly. Rule: keep one overall number per
  round, and when it rises, reverse rather than stack. This is why builders are
  required to report what they rejected — without that log, nobody can see which
  change to undo.
- **A refactor leaves the app unopenable for ten minutes.** Cause: an agent
  restructuring something the entry point depends on. Rule: breaking changes stay
  inside one agent's file set; the bookmarked URL never goes dark.
- **The user cannot tell what the fan-out is doing.** Cause: several agents
  changing several file sets for minutes at a time, reported only as prose.
  Symptom: the user's only available response is to agree or disagree with your
  account of it. Rule: rule zero. Keep the thing openable, and say in every
  report what changed about what they can open, so the next thing they do is look
  rather than ask. A longer chat message is not a substitute for something they
  can poke at.
- **Nobody dogfoods the thing they are building.** Cause: the reviewer looks at
  the artefact but never USES it. Rule: where the artefact can carry the work,
  make it the medium — an agent redesigning a reading surface publishes its own
  critiques THROUGH that surface, and finds out what using it is actually like.
- **A hero shot passes; the product does not.** Cause: reviewing one camera
  position, one screen size, one code path. Symptom: the art direction visibly
  falls apart on part of the loop — a fixed sun means most of a closed circuit is
  driven away from the light, and the mid-ground quality drops wherever nobody
  looked. Rule: sample the whole traversal, four to six points, and require them
  all to look like one thing.
- **A sub-agent dies mid-edit on a transport or auth error.** Cause: infra, not
  the work. Rule: do not assume the tree is broken and do not re-run blindly —
  typecheck, test, and RENDER first. Substantial work usually landed; in one case
  both dead agents had already committed their main change and only a follow-up
  tweak was lost.
- **Every lens is a picture lens, so nobody ever uses the thing.** Cause: the
  reference is an image, so the loop silently becomes "match the image" and the
  critic roster fills up with composition, colour, materials and silhouette.
  Symptom: three rounds of pixel measurements, and the user opens it and cannot
  get back to the previous screen. Rule: if the artefact is interactive, one
  critic's lens is THE PRODUCT — reachability, persistence, dead ends, what a
  first-time user cannot find — and it is briefed to drive it, not to look at it.
- **Every number on the screen is right and none of it is real.** Cause: the
  reference is a picture OF A STATE, so the state gets typed in to match it —
  24 of 36 stars, three cups at 100% — and nothing ever writes to it. It passes
  every visual critic by construction, because it was authored to look like the
  screenshot they are comparing against. Rule: when the artefact displays
  progress, inventory, scores or status, one agent must try to CHANGE that state
  through the product and reload; a value that cannot be moved is a mock.
- **The stopping bar was never written down, so "done" became "the critics ran
  out of pixel complaints".** Cause: skipping the one paragraph the skill asks
  for before starting. Rule: write the bar as a list you could hand to a
  stranger, including the non-visual conditions, before the first fan-out.
- **A critic prescribes two numbers that cannot both be true.** Cause: measured
  targets and a derived quantity quoted side by side as if independent. Symptom:
  the builder applies both and the surface lands nowhere near the sheet. Rule:
  prescriptions carry the MEASUREMENT and the intent; the builder derives the
  constant and reports what it came out as. A critic hands over a target, not an
  implementation.
- **The manager's own calibration is wrong and every brief inherits it.** Cause:
  a scale quoted from memory ("1 m is ~7.3 px") instead of computed from the
  camera; six agents then reasoned about prop sizes with it. Rule: derive shared
  constants once, from the code, and say in the brief how they were derived so a
  sub-agent can check rather than trust. One did, and its correction changed
  every judgement in its own review.
- **A compensation term quietly becomes the picture.** Cause: a constant added
  to work around an engine fact (here: three.js divides diffuse by pi, so a
  self-lit floor of 0.45x albedo was added to reach the reference's brightness)
  and then never re-derived once the rest was tuned. Symptom: the shadow half of
  every object sits at 0.72x the lit value and the whole image flattens — 8 L of
  range across a rock face where the reference has 69. Rule: any constant whose
  comment says "to compensate for" gets re-measured at the end of the round that
  introduced it.
- **The screenshots are of somebody else's app.** Cause: a second dev server
  grabbed the same port, so the harness URL served an unrelated page. Symptom:
  agents reviewing a blank stand-in and reporting nothing wrong. Rule: every
  screenshot step asserts the page identity first, and the check goes in the
  brief, not in the manager's head.

### From the runs this came from — three.js / WebGL scene work

Kept because they are evidence of what the loop actually catches, and because
several have a general shape under the specifics. Skip the list if you are not
doing 3D; nothing above depends on it.

- **Every element is present and correct, and the picture is still empty.**
  Cause: nothing is ever nearer than the subject, so nothing is cropped by a
  frame edge. Reference art almost always has foreground repoussoir doing two
  jobs — darkening the corners and establishing "nearest" so everything else
  reads as far. Rule: check what the frame edges cut through before adding any
  more mid-ground detail.
- **An invented landmark hijacks the frame.** Cause: filling a compositional role
  the reference gives to something distant with something huge and near. Symptom:
  the loudest, most saturated object on screen is one nobody asked for, and it
  beats the player's own vehicle for attention. Rule: rank objects by how much
  attention they take, and compare that ranking with the reference's.
- **Textures smear after a decimation pass.** Cause: welding vertices by
  POSITION to push mesh simplification past its floor — the simplifier treats a
  UV seam as a locked border, and merging across it makes both sides share one
  UV. Rule: keep attribute-exact welding, accept the floor, and buy the triangle
  budget back with fewer, better-placed props and chunked instancing.
- **The whole render is far too dark once custom post-processing is added.**
  Cause: three.js applies neither tone mapping nor the sRGB transfer when
  rendering into a render target — the scene target holds raw linear HDR. Rule:
  the composite pass must do exposure, tone map and sRGB encode itself.
- **A water surface, decal or inlay is invisible.** Cause: it was placed *below*
  a large ground plane that has no hole cut in it. Rule: check the ground plane's
  y before assuming the geometry failed to build.
- **A prop's legs land in the middle of the road.** Cause: assuming the prop's
  long axis is its span axis. Rule: identify the span axis from the asset's own
  bounding box AND a rendered front/side pair before choosing a yaw.
- **A prop stands vertically after being swapped in.** Cause: spawn code that
  rotated a pre-rotated *mesh* about Z now rotates a *group* that is already
  flat. Rule: when changing what a factory returns, re-read every caller's
  transform.
- **The same tile looks fine on one surface and smeared on the next.** Cause:
  UVs mapped 0..1 across bands of very different widths. Rule: make ground UVs
  metric — one repeat per N metres in BOTH directions — not normalised.
- **An instanced batch is never culled.** Cause: one InstancedMesh for the whole
  level; it is culled as a single object. Rule: split into spatial chunks.
- **A top-down overview renders as a blank haze.** Cause: exponential fog tuned
  for a ground-level camera. Rule: overview modes disable fog.
- **A canvas texture shows only a sliver of itself.** Cause: the mesh's v range
  derived from world height over a texture scale, sampling a fraction of the
  image. Rule: give panel-like surfaces an explicit 0..1 v.
- **Box-geometry panels show a crushed copy of the texture on their thin edges.**
  Cause: default box UVs put a full 0..1 copy on all six faces. Rule: metric UVs
  or a separate material for edge faces.
- **The camera frames the map into a viewport that is mostly covered.** Cause:
  the 3D view is fitted to the canvas while DOM chrome sits on top of it; on a
  phone the dock owned 45% of the frame and the framing did not know. Symptom:
  one of twelve map nodes on screen. Rule: the rig takes insets from the real
  furniture rects and frames into what is LEFT.
