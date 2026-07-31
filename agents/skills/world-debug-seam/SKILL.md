---
name: world-debug-seam
description: >-
  Verify a game mechanic by driving it through a DEV debug seam, never by playing
  the world by hand. MANDATORY before checking any mechanic that lives somewhere
  in a world — loot that spawns at a site, a pickup, an interaction, damage,
  death, an escalation stage, a weather or time-of-day state, an objective that
  ticks. Enforces: build the tool first (teleport, set state, force the event,
  strip the layer that is in the way), then look at frames from those positions.
  Trigger on- "check that it works in the game", "walk to X and see", "can the
  player pick it up", "it only happens after N minutes", "reach the far site",
  "the enemies kill me before I get there", "scripted walkthrough", "e2e run",
  "drive the app with Playwright", "verify the loop end to end".
---

# Debug the world with tools, not with your feet

Verifying a mechanic is not an end-to-end test. An e2e test asks "can a user get
from the front door to the receipt". A mechanic check asks "**does this thing
exist, is it reachable, does it do what it claims**" — and every metre walked to
reach it is time spent proving something nobody asked about.

The moment a check needs the world to be in a particular state, the answer is a
TOOL, not a longer script.

## The rule

**Never verify a mechanic by simulating a player.** No scripted WASD routes, no
timed legs, no "hold forward for 7 seconds and hope". Build a DEV-only seam that
puts the world into the state under test, then look at what the frame shows.

Symptoms that you are on the wrong path — every one of these is a signal to stop
scripting and write a tool instead:

- the check walks a long distance to reach the thing under test;
- the route needs retries, "nudges", or per-run timing tuning;
- hostiles/hazards/timers kill the run before the thing under test happens;
- the check waits for a state the world produces rarely, or on its own schedule;
- the run must be repeated because the page reloaded, the frame rate changed, or
  a colleague's edit landed mid-run;
- you are reading the same failure ("never got there") more than twice.

A route that fails is not evidence about the mechanic. It is evidence about the
route — and nobody is reviewing the route.

## What a debug seam looks like

One DEV-only object, installed while the scene that owns the state is mounted,
removed with it, and stripped from production with the rest of the DEV branches.
It exposes verbs a check actually wants to say:

```ts
type WorldDebugApi = {
  /** Put the body at a place. Position only — everything else stays as it is. */
  teleport: (x: number, z: number) => void
  /** Apply the discrete effect a real source would apply. */
  damage: (amount: number) => void
  /** The verb a check means, rather than "a number that happens to be lethal". */
  kill: () => void
  /** Set a stage/level that is irreversible in play, so its far end is reachable. */
  escalation: (value: number) => void
  /** The last published snapshot of the runtime, for asserting instead of guessing. */
  snapshot: () => RuntimeSnapshot | null
}
```

Three properties make it trustworthy, and all three are non-negotiable:

1. **It only feeds queues the runtime already consumes on its own tick.** Nothing
   writes simulation state from outside. A world driven from the console must
   advance exactly as a played one does, or the check proves nothing about play.
2. **It is DEV-only and unreferenced in production paths** — behind the build's
   DEV branch, installed by the scene, torn down on unmount.
3. **It names verbs, not internals.** `kill()` and `teleport(x, z)` survive a
   refactor; poking a health field or a transform does not.

## Strip the layer that is in the way

The second half of the seam is a set of DEV flags that REMOVE what stands
between you and the mechanic. Each one drops a layer; each is a query flag or a
key, DEV-gated, and named for what it turns off:

- hostiles/pressure off — so loot, routes and interactions can be inspected
  without a fight the check never asked about;
- hazards/weather/time forced to a chosen state;
- ground/terrain flattened, fog or post disabled — when they hide the thing;
- an inspection camera free of the gameplay rig, so a site can be orbited.

If a check keeps dying, drowning, or timing out on its way to the subject, the
missing piece is a flag, not more patience.

## The order of work

1. **Name the mechanic and its observable claim.** "The ordered item spawns at
   the site, is visible, can be taken, and lands in the pack." Not "the loop
   works".
2. **List the states you must reach** to see that claim: at the site, item
   spawned, item in the pack, item carried out.
3. **Check the seam covers them.** Missing verb or flag → write it FIRST. This is
   part of the task, not a detour.
4. **Drive the world into each state** through the seam.
5. **Capture and LOOK at a frame in each state.** The claim is about what the
   world shows; the seam only gets you there.
6. **Assert the runtime snapshot** alongside the frame, so the check says both
   "it looks right" and "the state says so".

## Judging a site, not just a flag

When the subject is placed in a world (loot, an interaction point, a spawn), the
frames must answer placement questions, and a single screenshot from one angle
answers none of them:

- is it **occluded** — inside geometry, behind a wall, under a roof, in a slot
  the camera cannot see into?
- does it **read** at gameplay distance and gameplay camera, not only in a
  close-up?
- can the player **stand where the interaction needs them to stand**?
- is it reachable from every side, or only from one lucky approach?

Teleport to each side of it and shoot all of them. Occlusion is invisible from
the angle the author happened to pick.

## Anti-patterns

- Scripting a walk because the seam is missing. Write the verb; it is minutes.
- Clicking the render surface to "focus" it before sending keys — in aim-relative
  controls this silently redefines what the movement keys mean, and every route
  after it is unreproducible.
- Treating a dead run as a finding about the mechanic.
- Verifying a mechanic in unit tests only and calling the mechanic proven — a
  pure-domain test cannot see occlusion, a missing model, or an unreachable spot.
- Building the seam and then still walking, because the script already existed.
- Leaving the seam undocumented: an undiscoverable tool gets rewritten as another
  scripted walk by the next person.

## Checklist

- [ ] The claim under test is written as an observable sentence.
- [ ] Every state it needs is reachable through a DEV verb or flag.
- [ ] The seam only feeds the runtime's own tick, and is DEV-only.
- [ ] Layers that block the subject can be switched off.
- [ ] A frame was captured AND looked at in each state, from more than one side.
- [ ] The runtime snapshot backs what the frames show.
- [ ] No step of the check depends on walking, timing, or luck.
