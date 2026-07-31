---
name: session-threat-world-authoring
description: Place a session-threat enemy AI into a level — dens, entry points and their walk-in paths, patrol routes, cover, and the arena size the top-down camera demands. Use when authoring, porting or reviewing a map that must host escalating enemy pressure: "add enemies to this location", "why do no reinforcements arrive", "enemies get stuck / never spawn / all pile up", "make this level work with the AI", or when moving the AI from its lab into a real world. Applies to level designers, system designers and programmers.
---

# Authoring a world for session-threat enemy AI

A session-threat AI reads a level as **data**, not as geometry: it needs to know
where pressure comes from, how it physically walks in, where the quiet places
are, and how much room the camera leaves off screen. Get that data wrong and the
system does not crash — **it goes silent**. That is the whole difficulty: a
mis-authored world looks exactly like a working one until you notice nothing
ever arrives.

## The one rule that decides everything: the arena must be bigger than the view

Reinforcements may only enter from a point the player cannot already see. So if
the playable area is not meaningfully larger than the ground rectangle the camera
shows, **every** entry point is permanently on screen, every spawn is refused,
and the session pins at its stage with a population target it can never fill.

Nothing reports this. Measure it before placing anything else:

```text
arena half-extent  >  camera ground half-extent + spawn margin
```

The same trap appears in a debug view. A plan/tactical camera that frames the
whole level makes the world unspawnable *while that camera is selected*. Feed
the simulation the **gameplay** camera's rectangle, computed from the player, and
never the live debug camera — a DEV view must not change what the game does.

## What a level has to provide

| Element | What it is for | Gets it wrong by |
| --- | --- | --- |
| **Bounds** | The playable rectangle; movement is clamped to it | Being no bigger than the camera |
| **Cover** | Blocks line of sight and movement; makes flanks and quiet routes exist | Being absent — with no cover, perception is a plain radius and every approach reads the same |
| **Dens** | Noise made near one counts for more; the source of pressure | Radius left at zero, so "loud near the den" never happens |
| **Entry points** | Where reinforcements come from | Standing inside cover, or outside the bounds |
| **Entry paths** | The authored walk from an entry point into play | Missing entirely, or crossing a wall |
| **Patrol routes** | What the population does before it knows about the player | Corners inside cover; a closing leg that crosses a wall |
| **Extraction** | Where pressure converges late in a session | Sitting next to a den or an entry point |

## Placement rules that actually matter

1. **Every entry point owns a path.** A point without one is skipped in silence.
   The path is the route bodies *walk*, so it must clear cover with the widest
   archetype's radius, not a point radius.
2. **Entry paths end inside play, not on the border.** Ending at the edge leaves
   arrivals loitering on the boundary instead of joining the fight.
3. **Spread entry directions around the space.** Points clustered on one side
   produce a level where pressure only ever comes from one screen edge — the
   top-down failure that ring/flank behaviour exists to avoid. Aim for entries
   spanning at least half the compass around the play space.
4. **Keep entries off the player's start.** An entry within the spawn rule's
   minimum player distance is dead for the opening of every session.
5. **Patrols are LOOPS.** The closing leg from the last corner back to the first
   is walked too, and is the one most often left crossing a wall.
6. **Legs must be longer than the corner-reached radius.** A shorter leg is
   skipped, and the route silently loses a corner.
7. **At least one patrol should pass within a den radius**, or nothing in the
   opening population can react to noise made at the loudest place on the map.
8. **Author every element by hand.** Positions, routes and radii are design
   decisions — scattering them from a generator produces a space with no
   readable routes, and the AI's flanking has nothing to flank around.

## Make the contract machine-checked, not written down

Prose rules are re-broken by the next person. Ship a **validator** over the level
data that returns structured issues — a stable code, a severity, and the id of
the element at fault — and run it in three places:

- as a unit test over each authored level, so a broken route fails the build;
- live in the authoring/debug overlay, so the problem is visible while placing;
- over any level ported in from elsewhere, before trusting it.

Split severities honestly: **error** means the system silently will not work
(unreachable entry, path through a wall, arena smaller than the view); **warning**
means it works but the design is probably not what was intended (one-sided entry
directions, a patrol that never nears a den). Only errors should block.

Derive the validator's thresholds **from the runtime constants themselves** —
import the spawn rule's minimum distance rather than retyping a number. A
validator with its own private copy of a threshold drifts away from the code it
is supposed to guard.

## Verify the placement, do not assume it

Static checks prove the data is well formed; they do not prove the space plays.
In a headed run, confirm each of these and keep the frame:

- a body actually walks in from each entry point and reaches the play space;
- patrols hold their loops without grinding against cover;
- pressure arrives from more than one screen direction as the session escalates;
- nothing appears inside the visible rectangle at any escalation stage;
- the readouts you rely on (threat, stage, population, entry availability) are on
  screen in the same frame as the behaviour they explain.

A validator that passes and a scene that looks right are two different claims.
Make both.

## Failure signatures worth recognising

| Symptom | Almost always |
| --- | --- |
| No reinforcements, ever, at any stage | Arena not larger than the view, or every entry inside cover / pathless |
| Reinforcements only from one direction | Entry points clustered; the nearest-usable choice has nothing else to pick |
| A body vibrating against a wall | A route or entry-path leg crossing cover |
| Enemies "teleporting" into the fight | Arrivals integrated with elapsed time they never spent walking — a simulation bug, but it *reads* as a placement bug |
| Everyone converging on one spot | Formation rules applied only to confirmed combat, not to the investigate phase |
