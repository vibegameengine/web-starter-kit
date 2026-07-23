# Game Design Filled Examples

These examples are intentionally project-independent. They demonstrate
deliverable depth without encoding the facts, vocabulary or constraints of any
particular game.

## Example 1 — Mechanic Card: Directional Barrier

**Intent**

Create a defensive prediction decision: commit orientation before impact, trade
coverage for mobility, and earn a short counterattack window on a correct read.

**Agent and target**

- Player invokes the barrier.
- Incoming attacks are evaluated against its active arc and supported damage
  categories.

**Input**

- Press and hold to preview direction.
- Release to commit.
- Input must be remappable; an optional toggle replaces holding.

**Preconditions and cost**

- Requires the character to be actionable.
- Consumes a defensive resource at commit.
- Turning is restricted during active frames.

**Phases**

1. Direction preview.
2. Commit and short anticipation.
3. Active block window.
4. Recovery.
5. Resource regeneration.

**State transition**

`actionable → preparing → guarding → recovering → actionable`

**Outputs**

- Valid frontal hit is mitigated and produces block feedback.
- Invalid angle or unsupported category resolves normally.
- A precisely timed valid block grants a bounded counterattack opportunity.

**Counterplay and failure**

- Flanking, delayed attacks and resource pressure challenge the barrier.
- Failure feedback distinguishes wrong angle, early/late timing, insufficient
  resource and unblockable category.

**Tunables**

- Arc, preparation, active/recovery duration, cost, mitigation and precision
  window.

**Telemetry**

- Preview start, commit angle, incoming attack angle/category, resolution,
  timing error, resource state and follow-up action.

**Acceptance**

- New testers can explain one valid and one invalid use after encountering each.
- Correct use changes follow-up behavior rather than merely reducing damage.
- Critical threat cues remain readable behind the barrier effect.

## Example 2 — Encounter Card: Protected Artillery

**Thesis**

Choose between breaking a support relationship and navigating ranged spatial
pressure; then exploit the opening created by dismantling the structure.

**Learned verbs tested**

- Reposition.
- Break line of sight.
- Interrupt.
- Prioritize a target.
- Spend a limited mobility tool.

**Composition**

- One artillery role authors alternating unsafe lanes.
- One support role protects it through an interruptible relationship.
- Low-priority pressure prevents indefinite stationary damage.

**Sequence**

1. Reveal the support relationship and initial safe route.
2. Present one readable artillery pattern.
3. Give a response window to route, interrupt or pressure the support.
4. Add bounded low-priority pressure after the relationship is understood.
5. Removing support visibly changes the artillery state.
6. End danger before presenting rewards or menus.

**Spatial contract**

- At least two viable routes exist before escalation.
- Cover explains line-of-sight behavior.
- Reinforcements have visible origins and a finite budget.
- No route is invalidated by an attack whose commitment was hidden.

**Solo/co-op**

- Solo has complete answers.
- Co-op may split protection and pressure tasks, but no role/class is required.
- Contribution feedback identifies interruption, protection removal and rescue.

**Failure modes**

- Players cannot perceive why artillery durability changes.
- Killing support is always or never correct.
- Effects overlap until no route can be read.
- Reinforcement duration feels endless.

**Test**

- Record first target, route, interruption, failure attribution and time until
  players exploit the changed state.
- Compare solo and relevant party sizes.
- Ask for explanation after behavior, not before.

## Example 3 — Transformative Reward: Returning Projectile

**Baseline**

A manually aimed projectile travels outward, hits once and expires.

**Transformation**

After a qualifying action, the player may manually recall the projectile. It
travels back along a readable path and may produce a second, weaker interaction.

**New decisions**

- Aim the outgoing path to create a useful return path.
- Decide whether recall value outweighs continued primary actions.
- Reposition to alter return geometry.
- Accept risk while setting a two-pass line.

**Trade-offs**

- Recall input consumes attention and may interrupt another plan.
- Second-pass output is conditional, not guaranteed.
- Open spaces and stationary targets reduce its comparative value.

**Degeneracy risks**

- Automatic recall removes the new decision.
- Homing converts manual geometry into guaranteed output.
- Second pass is strong enough that every other reward becomes dominated.

**Test**

- Compare aim, position, recall timing and target choice before/after selection.
- The reward passes as transformative only if observed behavior changes; a
  damage increase by itself is insufficient.

## Example 4 — Resource-Economy Review

**System**

A combat resource is generated by accurate basic actions, stored to a cap and
spent on high-impact actions. At the cap, further generation is lost.

**Flow model**

- Source: qualifying basic-action results.
- Pool: bounded resource meter.
- Drains: high-impact actions.
- Gate: only valid results generate full value.
- State connection: temporary status changes generation or cost.

**Desired dynamic**

Players alternate building and spending while choosing whether to hold for a
future threat.

**Failure dynamics**

- Starvation: players cannot access defining actions.
- Capping: optimal play ignores generated value.
- Hoarding: uncertainty makes spending feel unsafe.
- Positive feedback: successful players gain disproportionate future output.
- Degenerate conversion: one spender dominates every state.

**Evidence plan**

- Track opportunities, generation, time capped/starved, spend context and
  outcome.
- Segment by mastery, content state and loadout.
- Pair traces with observation and player explanation.

**Decision discipline**

Do not change global generation from an aggregate mean. First determine whether
the failure comes from rules, content pacing, comprehension, target
availability or one dominant spender.

## Example 5 — Onboarding Lesson: Interrupt

**Prior knowledge**

Player can move, aim and use the interrupting action.

**Expose**

An enemy begins a long, distinctive channel with a low failure cost.

**Name**

At the moment of need, a concise prompt identifies the action and the channel;
it does not explain unrelated status rules.

**Safe practice**

The first channel has no competing critical threat and repeats after a short
recovery if missed.

**Confirm**

Successful interruption produces distinct enemy recovery and immediate
feedback. Early, late and immune attempts have different explanations.

**Test**

A later encounter reuses the same cue without the prompt and adds one existing
movement demand.

**Combine**

Only after successful unprompted use does content combine interruption with
target priority or team coordination.

**Accessibility**

- Cue is visual and audible.
- Input is remappable.
- Timing assist states exactly what it changes.
- Prompt may be replayed without restarting the session.

**Acceptance**

- Testers recognize the channel and attempt a valid response without prompting.
- Failure explanations match instrumented timing/category data.

## Example 6 — Balance Experiment

**Observed problem**

One mobility option is selected frequently and associated with better survival,
but aggregate data does not show whether it is overpowered, easier to learn or
chosen by stronger players.

**Balance definition**

Each mobility option should provide a contextual advantage and preserve a
legible cost; none should dominate across most threats and mastery segments.

**Hypotheses**

1. The option has excessive active safety.
2. Its feedback makes correct use easier to learn.
3. Content disproportionately rewards its movement shape.
4. Selection bias explains the aggregate result.

**Protected invariants**

- Input identity.
- Core movement shape.
- Universal response to critical threats.

**Evidence**

- Segment selection and outcomes by mastery, threat, content and loadout.
- Observe timing, intended use and follow-up.
- Run controlled variants only after identifying the likely causal variable.

**Smallest candidate test**

If evidence isolates excessive recovery safety, change recovery only; do not
simultaneously alter distance, active frames and cost.

**Decision rule**

- Keep when advantage is contextual and mastery explains performance.
- Improve teaching when comprehension is causal.
- Change content when encounter distribution creates the dominance.
- Retune the isolated variable when controlled evidence supports a power issue.
