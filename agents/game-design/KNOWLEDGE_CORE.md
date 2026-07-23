# Game Design Knowledge Core

## 1. Operating Model

Game design is the intentional construction of rules that produce decisions,
behavior and experience:

`player promise → verbs/rules → system dynamics → player decisions → observable behavior → experience → evidence → revision`

A feature list describes what exists. A design explains what the player
perceives, decides, does, learns, risks and feels—and why the rules should cause
that sequence.

### 1.1 Causal design standard `[Research-backed synthesis: S1, S3, S4]`

For every material design claim, write:

1. `Intended experience`: the player-facing result.
2. `Mechanic`: the action, rule, state, resource or constraint created.
3. `Expected dynamic`: the repeated behavior that emerges during play.
4. `Observable signal`: what a tester or event log can capture.
5. `Failure alternative`: another behavior the same rule may create.
6. `Test`: evidence that distinguishes the intended and failure dynamics.

Example:

- Experience: “I created a narrow opening under pressure.”
- Mechanic: a short evade with commitment, collision immunity and a cooldown.
- Expected dynamic: player holds evade until two threat timings overlap.
- Signal: evade occurs inside the valid response window and creates an attack
  opportunity rather than merely adding travel speed.
- Failure alternative: player spams evade on cooldown for general movement.
- Test: compare evade timing, follow-up action and damage avoided across rooms.

“This will be fun” is not a causal explanation.

### 1.2 Evidence labels `[Mandatory operating standard]`

- `Project invariant`: canonical requirement, not a local tuning variable.
- `Observed`: direct build, playtest, telemetry, interview or research evidence.
- `Research-backed`: result from `SOURCES.md`, with transfer limits.
- `Practitioner-backed`: first-party or expert method, with context.
- `Internal heuristic`: role-created decision tool, awaiting validation.
- `Hypothesis`: falsifiable expectation for this project.
- `Risk control`: conservative trust, accessibility or ethics guardrail.
- `Preference`: subjective creative choice.

A number without a source or test is a hypothesis, even when presented in a
spreadsheet.

### 1.3 Separate invariants, variables and hypotheses `[Internal heuristic]`

| Type | Meaning | Change rule |
|---|---|---|
| Invariant | The promised identity or approved constraint | Change only through explicit design decision |
| Variable | A permitted tuning surface | Change within stated bounds and dependencies |
| Hypothesis | An unverified causal claim | Test before canonizing |
| Example | One implementation illustrating the rule | Replace freely if the rule survives |

This separation prevents an illustrative number or prototype accident from
becoming accidental canon.

## 2. Player Promise, Pillars and Design Problem

### 2.1 Player promise `[Internal operating model]`

Write the promise as:

> For `[player/situation]`, the game lets you repeatedly `[meaningful activity]`
> under `[distinctive pressure]`, so you experience `[specific emotional or
> social result]`.

The promise must identify what players do, not only world, genre or theme.
“Dark fantasy co-op ARPG” is positioning. “Read a crowded fight, create an
opening and detonate it through manual spell execution” is gameplay intent.

### 2.2 Pillars `[Internal heuristic]`

Each pillar needs:

- Player-facing statement.
- Rules that support it.
- Observable behaviors that demonstrate it.
- Anti-pillars: tempting designs that violate it.
- Trade-offs accepted to preserve it.
- Test question.

Limit pillars to the few constraints that decide conflicts. If every desirable
quality is a pillar, none has priority.

### 2.3 Frame a design problem `[Internal heuristic]`

Use:

- Current player behavior.
- Intended behavior.
- Evidence of the gap.
- Suspected causal layer: clarity, control, rule, tuning, content, reward,
  onboarding or technical defect.
- Constraints and invariants.
- Smallest change that can test the causal theory.

Do not solve a comprehension problem with balance numbers or a balance problem
with more VFX.

## 3. Mechanics: From Verb to State Machine

### 3.1 Definition `[Research-backed: S3]`

A mechanic is a method an agent invokes to interact with game state. Describe
it as a verb plus rules and state change, not as a noun:

- Weak: “fireball system.”
- Useful: “aim, commit a resource, launch a projectile, resolve collision,
  apply damage and a status, then expose a reaction window.”

Rules define what is permitted and how the world behaves. Mechanics are how
agents act within those rules.

### 3.2 Complete mechanic specification `[Internal operating model]`

Every player-facing mechanic specifies:

1. `Intent`: problem solved and experience served.
2. `Agent and target`: who invokes it and what may receive it.
3. `Input`: device action, press/hold/release/chord and remapping needs.
4. `Preconditions`: state, resource, range, line of sight, target validity.
5. `Selection`: aim, lock, area, direction, priority and ambiguity resolution.
6. `Cost`: resource, time, position, opportunity, risk or information.
7. `Commit point`: when cancellation stops and cost is consumed.
8. `Phases`: anticipation, aim lock, active, recovery and cooldown.
9. `State transition`: exact before/after states and side effects.
10. `Output`: damage, movement, status, resource, information or world change.
11. `Feedback`: input acknowledgement, valid/invalid, commit, active, hit,
    miss, immunity, completion and readiness.
12. `Counterplay`: tactical, strategic and build-level responses.
13. `Failure`: why it failed and what the player can learn.
14. `Interaction rules`: priority, stacking, refresh, override, immunity,
    interruption and simultaneous events.
15. `Edge cases`: death, disconnect, pause, latency, terrain, missing target,
    state change during travel, duplicate input.
16. `Tunable variables`: values that may change without changing identity.
17. `Telemetry`: events and context needed to test it.
18. `Acceptance criteria`: observable pass/fail behavior.

### 3.3 Mechanic identity `[Internal heuristic]`

Separate:

- `Identity variables`: changing them changes what the mechanic is—targeting
  mode, mobility permission, role, risk structure, counterplay.
- `Tuning variables`: changing them adjusts strength or cadence—damage,
  duration, cost, cooldown, radius within valid bands.

When a balance change repeatedly touches identity variables, the problem is
design, not tuning.

### 3.4 Input–response contract `[Research-backed: S13]`

Basic actions must respond consistently and visibly. For each input, distinguish:

- `Received`: game detected the input.
- `Accepted`: preconditions passed.
- `Committed`: cost/state transition occurred.
- `Resolved`: result applied or validly failed.

If input is rejected, expose the relevant reason without flooding the screen.
Unexplained inconsistency teaches players not to trust the rules.

## 4. Meaningful Decisions, Agency and Counterplay

### 4.1 Decision anatomy `[Research/practitioner synthesis: S2, S4, S6]`

A meaningful decision needs:

- At least two legible options.
- A goal or tension that makes the choice relevant.
- A real trade-off; one option cannot dominate in all relevant states.
- Consequences the player can perceive and attribute.
- Enough information to form an intention.
- Uncertainty that preserves judgment without making causality opaque.
- Appropriate recurrence: enough repetition to learn, not so much that it
  becomes administration.

Choice count is not depth. Depth comes from context changing which option is
best and from players improving their model.

### 4.2 Decision audit `[Internal heuristic]`

For every repeated choice, answer:

| Question | Failure if absent |
|---|---|
| What does the player know? | Guessing |
| What remains uncertain? | Solved routine or opaque outcome |
| What is being traded? | Dominant option |
| When is the choice committed? | No tension or accidental lock-in |
| How is consequence perceived? | Low agency |
| Can the player improve? | No mastery |
| What new context changes the answer? | Repetition without depth |

### 4.3 Agency `[Research/practitioner synthesis: S4, S6, S7]`

Agency is not maximum freedom. It is the felt ability to form an intention,
act, perceive a coherent consequence and update future behavior.

Protect agency by:

- Making rules consistent.
- Signaling irreversible commitments.
- Keeping consequences related to the apparent decision.
- Showing why failure occurred.
- Allowing multiple viable plans where the promise implies expression.
- Avoiding fake choices that converge before any meaningful consequence.

Constraints can strengthen agency when they make trade-offs legible.

### 4.4 Counterplay `[Practitioner-backed: S10]`

Counterplay is an action, choice or strategy that mitigates a threat.

- `Tactical`: dodge, interrupt, block, break line of sight, reposition, delay,
  cleanse.
- `Strategic`: target priority, route, resource preparation, build choice,
  formation, timing, avoidance.
- `Systemic weakness`: a stable limitation that prevents a threat from owning
  every context.

High impact demands proportionally strong and broadly available response
opportunities. A response locked to one optional class is not universal
counterplay.

### 4.5 Counterplay specification `[Internal heuristic]`

For each threat:

- Signal and recognition channel.
- Earliest correct response.
- Latest valid response.
- Required knowledge.
- Required execution.
- Cost of response.
- Partial-success outcome.
- Failure consequence.
- Recovery opportunity.
- Strategic preparation.
- Party-size implications.
- Accessibility alternatives.

The player need not always succeed, but after failure should be able to name a
plausible better action.

## 5. Feedback, Readability and Game Feel

### 5.1 Feedback hierarchy `[Research-backed: S6, S13, S15]`

Feedback answers, in priority order:

1. What threatens me now?
2. What did my action do?
3. What changed in the system?
4. What can I do next?
5. How am I progressing?

More feedback can reduce readability. Allocate visual, audio, motion, haptic and
UI emphasis by decision importance.

### 5.2 Multi-channel grammar `[Research-backed/risk control: S15]`

Do not encode essential information in color, audio, text, motion or haptics
alone. Define:

- Gameplay meaning.
- Primary channel.
- Redundant channel.
- Contrast/silhouette requirement.
- Timing and persistence.
- Priority when cues overlap.
- Reduced-motion and sound-off behavior.

### 5.3 Feel is a causal bundle `[Internal synthesis]`

“Game feel” can include:

- Input latency and buffering.
- Acceleration/deceleration and animation commitment.
- Camera response.
- Hit pause, recoil, knockback and time emphasis.
- Sound transient and pitch.
- VFX timing and spatial agreement.
- Target reaction and state consequence.

Diagnose the missing layer. Increasing every signal creates noise and may hide
the actual rule.

### 5.4 Readability budget `[Internal heuristic]`

At any moment, list the simultaneous high-priority questions. If players must
solve more questions than the promise supports, reduce overlap before
lengthening every tell.

A combat design may, for example, reserve its budget for three questions:
immediate danger, encounter structure and build execution. The number and
categories are project hypotheses, not universal limits.

## 6. Loops, Challenge and Pacing

### 6.1 Nested loops `[Internal synthesis: S1, S2, S5]`

Map each loop:

| Loop | Typical content | Required output |
|---|---|---|
| Action | Aim, move, cast, evade, hit | Immediate control and feedback |
| Decision | Spend/save, commit/hold, target/reposition | Meaningful trade-off |
| Combat/pack | Read roles, create opening, resolve | Mastery and resource state |
| Encounter/room | Objective, escalation, recovery | Authored tactical problem |
| Run | Route, build, risk, boss | Build arc and pacing |
| Meta | Unlock, learn, choose future approach | Long-term direction without invalidating skill |

Each outer loop must alter the context of inner decisions. If it only repeats
them longer, it is content quantity rather than progression.

### 6.2 Challenge model `[Research-backed synthesis: S6, S8, S17]`

Challenge is multidimensional:

- Rules/knowledge.
- Perception/readability.
- Decision complexity.
- Execution/timing.
- Spatial pressure.
- Resource pressure.
- Coordination.
- Endurance.
- Recovery cost.
- Uncertainty.

Tune the intended axis. Raising enemy health often increases endurance without
improving decisions.

### 6.3 Difficulty contract `[Internal heuristic]`

Define what changes by difficulty and what never changes:

- May change: pattern composition, timing within fair bands, coordination,
  reinforcement budget, resource scarcity, recovery generosity.
- Usually invariant: input rules, hitbox honesty, tell meaning, aim-lock point,
  core counterplay and event semantics.

Hidden adaptation risks breaking trust. If difficulty adapts, define protected
rules, bounds, reset behavior and whether players are told. `[S8]`

### 6.4 Intensity curve `[Practitioner-backed synthesis: S9]`

Pacing is not constant escalation. Author:

- Orientation.
- Demand.
- Peak.
- Resolution.
- Recovery.
- Anticipation of the next problem.

Variation should be structured and bounded. Pure randomness cannot guarantee a
learning sequence; pure scripting can collapse into memorization. For this
project, select authored encounter variants—do not procedurally construct the
scene or create endless pressure.

## 7. Combat, Enemies and Encounters

### 7.1 Combat action grammar `[Internal operating model]`

Every damaging threat has:

`anticipation → aim lock → active frames → recovery`

Specify:

- What can track before and after aim lock.
- Hit volume and movement.
- Interrupt/poise rules.
- Damage application count.
- Friendly/enemy collision behavior.
- Cancel permissions.
- Recovery vulnerability.
- Overlap permissions.

Animation length alone is not a telegraph. The cue must communicate threat
identity, affected space, commit point and response.

### 7.2 Enemy role `[Internal heuristic]`

An enemy role is a decision it forces, not a silhouette:

- Desired player response.
- Pressure channel.
- Range and movement.
- Threat cadence.
- Counterplay.
- Synergy with other roles.
- Solo behavior.
- Failure state when isolated or stacked.
- Readability signature.

If two enemies ask the same question at the same timing and range, they are
content variants, not distinct roles.

### 7.3 Pack grammar `[Internal synthesis]`

A pack needs:

- `Thesis`: the tactical problem in one sentence.
- `Anchor`: the role that stabilizes the problem.
- `Pressure`: forces movement or resource use.
- `Punisher`: exploits a predictable response.
- `Relief valve`: accessible counterplay and recovery opening.
- `Overlap budget`: maximum simultaneous critical tells.
- `Resolution`: how dismantling structure changes the fight.

Do not compose by enemy count alone.

### 7.4 Encounter grammar `[Internal operating model]`

Every encounter defines:

1. Reveal: what the player can read before or at activation.
2. First demand: the initial question.
3. Answer window: a fair chance to apply learned verbs.
4. Counter-pattern: how the room responds to the obvious strategy.
5. Escalation: finite authored change.
6. Resolution: proof the problem was solved.
7. Recovery: controlled resource/time state.
8. Exit state: what carries forward.

### 7.5 Encounter thesis test `[Internal heuristic]`

Reject or revise if:

- The room can be described only as “more enemies.”
- Success does not require the intended verb or decision.
- One universal strategy bypasses all meaningful states.
- Failure attribution is unclear.
- The counter-pattern removes every response.
- Reinforcements are endless or erase progress.
- The room tests a mechanic before teaching it.

### 7.6 Boss as learning exam `[Internal synthesis]`

Boss phases should recombine learned verbs, not replace the game with unrelated
rules. Each phase specifies:

- Prior lesson tested.
- New combination or constraint.
- Safe observation opportunity.
- Mastery signal.
- Failure lesson.
- Inter-phase resource and checkpoint contract.

## 8. Level and Content Design

### 8.1 Space creates behavior `[Research-backed: S11, S20]`

Geometry, enemy scripts and item placement cause movement, sight, timing and
target choices. A spatial brief must state expected behavior:

- Landmark and orientation.
- Entry knowledge.
- Critical paths and optional paths.
- Chokes, flanks, loops and dead ends.
- Range bands and sight lines.
- Safe/recovery pockets.
- Pressure and release zones.
- Objective visibility.
- Enemy staging and reinforcement origin.
- Traversal/camera/collision constraints.
- Intended and failure routes.

### 8.2 Spatial pattern card `[Internal heuristic]`

For a reusable pattern record:

- Problem it solves.
- Preconditions.
- Geometry/placement structure.
- Expected player behavior.
- Enemies/objectives that amplify it.
- Counter-pattern.
- Accessibility/readability risks.
- Metrics/observation.
- Genre and camera limits.

Patterns are design vocabulary, not recipes. `[S18]`

### 8.3 Authored variation `[Project invariant + internal heuristic]`

For each room archetype, author variants by changing one meaningful axis:

- Entry relationship.
- Anchor location.
- Route topology.
- Objective timing.
- Reinforcement direction.
- Recovery availability.

Preserve the learning thesis. Never globally scale/spread coordinates or fill a
scene with generated scatter.

## 9. Systems, Economies, Progression and Rewards

### 9.1 Resource-flow model `[Research/practitioner-backed: S5, S8]`

Map every tangible or abstract resource:

- Source: creates it.
- Pool: stores it.
- Drain: destroys it.
- Converter: changes it.
- Trader: exchanges it.
- Gate: routes it.
- State connection: changes flow based on system state.

Include time, attention, position, health, cooldowns and opportunity as
resources when they drive decisions—not only currency.

### 9.2 Economy questions `[Internal heuristic]`

- What desirable behavior does each flow reward?
- Which source scales with skill, time, luck or money?
- Which sink preserves decisions rather than merely removing value?
- Can a positive feedback loop make success self-amplifying?
- Can a negative loop make failure unrecoverable?
- Where can players hoard, farm, duplicate or bypass?
- Which resource becomes irrelevant?
- What is the expected state at each loop boundary?
- What happens at the extremes, not only the average?

### 9.3 Progression dimensions `[Internal synthesis]`

- `Vertical`: larger magnitude or capacity.
- `Horizontal`: new option or context.
- `Transformative`: changes behavior, targeting, timing, risk or synergy.
- `Expressive`: changes identity without power.
- `Knowledge`: player mastery, not avatar statistics.

State which dimension every reward uses. If a project's promise prioritizes
behavior-changing builds, vertical growth must not erase the decisions,
pressure or counterplay that define that promise.

### 9.4 Reward contract `[Internal heuristic]`

Each reward defines:

- Behavior it recognizes.
- Information available before choosing.
- Immediate and delayed value.
- Opportunity cost.
- Interaction with current build.
- Duplicate/bad-luck handling.
- Power floor and ceiling.
- Effect on future decision diversity.
- Presentation and claim accuracy.

A reward that is always correct is a power grant, not a choice.

### 9.5 Degenerate strategy test `[Internal heuristic]`

A strategy is suspect when it:

- Dominates across most states and skill levels.
- Removes the need to read enemies or space.
- Converts all resources into one best output.
- Produces safety without meaningful cost.
- Scales its own source faster than sinks can respond.
- Is boring but optimal enough that players feel punished for refusing it.

Do not immediately nerf the output. Find whether the cause is information,
cost, risk, availability, synergy or encounter composition.

## 10. Balance

### 10.1 Define balance before measuring it `[Research-backed: S19]`

Balance may mean:

- Fair chance between opponents.
- Viable choices within a build system.
- Appropriate challenge for a target skill.
- Useful contribution across co-op roles.
- Stable economy.
- Matchup diversity.
- Perceived fairness and counterplay.

These goals can conflict. A 50% aggregate win rate can hide skill, matchup,
selection and mastery effects.

### 10.2 Balance stack `[Internal synthesis: S5, S10, S19]`

1. `Validity`: rule works and can be understood.
2. `Counterplay`: opposing/encounter response exists.
3. `Power`: expected value in defined contexts.
4. `Diversity`: multiple plans remain viable.
5. `Depth`: best answer changes with state and mastery.
6. `Perception`: outcomes feel attributable and fair.

Numbers cannot repair missing validity or counterplay.

### 10.3 Quantitative model `[Internal heuristic]`

For every tunable:

- Definition and unit.
- Baseline and permitted range.
- Dependencies.
- Breakpoints.
- Sensitivity: outcome change per input change.
- Best/worst-case interaction.
- Party-size and skill-segment effect.
- Simulation assumption.
- Playtest target band.
- Rollback condition.

Use calculations to detect impossibilities, discontinuities and feedback—not
to certify enjoyment.

### 10.4 Comparison matrix `[Internal heuristic]`

Segment results by:

- New/learning/mastered player.
- Solo and each relevant party size.
- Build/school/rune.
- Enemy/pack/room.
- Difficulty.
- Input device/accessibility option.
- Success and failure state.

Report distributions and outliers, not only means.

### 10.5 Change discipline `[Internal heuristic]`

Prefer the smallest change that tests the causal theory. Record:

- Problem and evidence.
- Intended player behavior change.
- Exact variable changed.
- Expected second-order effects.
- Protected invariants.
- Evaluation window and sample.
- Decision/rollback rule.

## 11. Solo and Cooperative Design

### 11.1 Co-op is interaction, not player count `[Research-backed: S7, S12]`

Co-op mechanics should create observable coordination:

- Complementary action.
- Shared target or timing.
- Rescue/protection.
- Shared resource or risk.
- Transfer of information.
- Synchronized or chained action.
- Different perspectives on the same problem.

Standing in the same room while dealing independent damage is parallel play.

### 11.2 Complementarity without coercion `[Internal heuristic]`

For each mechanic/system:

| Question | Solo | Co-op |
|---|---|---|
| Can the problem be solved? | Required | Required |
| What becomes more expressive? | Baseline plan | Timing, combination, rescue |
| What new load appears? | None | Coordination and threat allocation |
| Is a specific school/class mandatory? | No | No unless explicitly approved |
| Can one expert remove agency from others? | N/A | Prevent or expose |

### 11.3 Party scaling `[Project invariant + internal heuristic]`

Scale tactical load, not health alone:

- More simultaneous roles within readability budget.
- Split pressure.
- Rescue and protection opportunities.
- Wider space use.
- Coordinated enemy behavior.
- Resource/revive pressure.

Preserve tell meaning and counterplay. Validate every party size; interpolation
between solo and five players is not evidence.

### 11.4 Co-op failure modes `[Internal synthesis: S9, S12]`

- Quarterbacking: one player makes every decision.
- Passenger play: one player contributes little but cannot tell why.
- Mandatory dependency: session fails when a class/school is absent.
- Invisible contribution: support actions are not attributed.
- Grief leverage: one player can consume shared value or block progress.
- Unequal downtime: death/disconnect removes play for too long.
- Coordination tax: communication demand exceeds intended audience capacity.

Write prevention and recovery rules for each relevant risk.

## 12. Onboarding, Mastery and Accessibility

### 12.1 Learning ladder `[Research synthesis: S14, S17]`

Teach through:

1. `Expose`: show the problem and the relevant cue.
2. `Name`: minimal instruction at the moment of need.
3. `Safe practice`: one rule with low failure cost.
4. `Confirm`: immediate feedback that the action worked.
5. `Test`: require the action without prompting.
6. `Combine`: add it to an existing rule.
7. `Vary`: change context so knowledge transfers.
8. `Master`: use it under normal pressure.

Do not explain several verbs, status systems and resources in one text panel.

### 12.2 Onboarding specification `[Internal heuristic]`

For each lesson:

- Prior knowledge assumed.
- Trigger and player goal.
- Information shown.
- Required action.
- Safe affordance.
- Success/failure feedback.
- Retry cost.
- Prompt fade rule.
- Later unprompted test.
- Accessibility alternative.
- Event evidence.

### 12.3 Accessibility-by-design `[Risk control: S15]`

Review from concept:

- Remappable inputs and alternatives to holds/mashing/chords.
- Timing windows and optional assists.
- Text size, contrast and duration.
- Color-independent semantics.
- Captions and meaningful audio cues.
- Object, target and hitbox clarity.
- Motion/reduced-motion and camera comfort.
- Photosensitivity.
- Difficulty options that state what changes.
- Cognitive load, pause and repeatable instructions.
- Communication alternatives for co-op.

Assists should preserve the intended decision where possible while reducing an
unnecessary motor, sensory or cognitive barrier.

## 13. Playtesting, Telemetry and Evidence

### 13.1 Playtest starts with a question `[Internal operating model]`

Write:

- Hypothesis.
- Target cohort and relevant prior experience.
- Build/version and exact content.
- Task and context.
- Behaviors to observe.
- Metrics and event definitions.
- Interview questions asked after behavior.
- Confounds.
- Pass/fail/learn decision rule.
- Permitted between-session changes.

“See if it is fun” produces anecdotes, not a decision.

### 13.2 Evidence layers `[Internal synthesis: S13, S14, S20]`

Triangulate:

1. `Behavior`: what players did.
2. `System`: what states/events occurred.
3. `Observation`: where they hesitated, misread, adapted or collaborated.
4. `Report`: what they believed, intended and felt.

Conflicts are informative:

- Says “clear,” behaves incorrectly: social desirability or false confidence.
- Succeeds, says “unfair”: hidden causality or low perceived control.
- Fails, retries eagerly: challenge may be legible and motivating.
- Telemetry looks healthy, observation shows boredom: metric lacks experience.

### 13.3 RITE discipline `[Research-backed: S14]`

Change between sessions only when:

- The issue is evidenced and severe.
- Cause is sufficiently clear.
- Fix is local and low-risk.
- Team records the change and invalidated comparisons.
- Later participants verify the fix.

Ambiguous preference or systemic balance questions require stable cohorts, not
rapid ad hoc mutation.

### 13.4 Event dictionary `[Research-backed synthesis: S20]`

Every event specifies:

- Event name and design question.
- Trigger and exclusions.
- Timestamp and sequence/session IDs.
- Actor, target and party context.
- Relevant position/state/resource/build.
- Success/failure reason.
- Version/content/difficulty.
- Privacy/data-minimization need.
- Validation procedure.

Instrument questions, not everything. Event count without denominator and
opportunity is often meaningless.

### 13.5 Metric interpretation `[Internal heuristic]`

| Question | Useful behavior/metric | Cannot prove alone |
|---|---|---|
| Was threat read? | response before aim lock, correct movement | cue was emotionally satisfying |
| Was mechanic used intentionally? | context, target, follow-up, held resource | player understood every rule |
| Is room too hard? | failure state, location, cause, retry, skill segment | frustration or fairness |
| Does co-op create teamwork? | assists, rescues, transfers, synchronized action | relatedness |
| Is build dominant? | pick, success, context, mastery, alternatives | why chosen |

### 13.6 Causal language gate `[Internal risk control]`

- Randomized/concurrent controlled evidence may support “caused,” subject to
  instrumentation and interference checks.
- Stable before/after or matched cohorts support “associated with” or
  “consistent with.”
- Observation/interview supports “participants reported/behaved.”
- Expert review supports “identified risk,” not player outcome.

## 14. Ethics and Player Trust

### 14.1 Ethical contract `[Research-backed: S16]`

The designer is an advocate for the player. Reject patterns that intentionally
create negative experiences against player interests without informed consent.

Review time, money and social capital:

- Is the required time legible?
- Can players stop without disproportionate punishment?
- Are probabilities, costs and permanent consequences clear?
- Is grind serving mastery/meaning or only delaying progress?
- Does scarcity create a decision or exploit fear of missing out?
- Can social obligations coerce unwanted return or spending?
- Does paid value solve intentionally manufactured misery?

### 14.2 Friction versus manipulation `[Internal heuristic]`

Legitimate friction:

- Serves the promised challenge or fantasy.
- Is disclosed through stable rules.
- Allows informed choice.
- Has meaningful learning/counterplay.
- Respects stopping and real-life constraints.

Manipulative friction:

- Exists mainly to force time, spending or social pressure.
- Hides cost, odds or commitment.
- Punishes disengagement unrelated to gameplay.
- Uses confusion as conversion.

## 15. Documentation and Handoff

### 15.1 Design spec standard `[Internal operating model]`

Every substantive spec contains:

- Player promise and problem.
- Scope, invariants and exclusions.
- Target experience.
- Causal map.
- Rules and state transitions.
- Inputs, outputs and feedback.
- Resources and economy.
- Counterplay and failure.
- Solo/co-op behavior.
- Accessibility.
- Tunables and balance hypotheses.
- Edge cases.
- Events and playtest plan.
- Acceptance criteria.
- Dependencies, risks and open decisions.
- Evidence ledger.

### 15.2 Acceptance criteria `[Internal heuristic]`

Criteria must be observable and role-neutral:

- Weak: “spell feels powerful.”
- Useful: “on valid hit, player sees/hears immediate confirmation, target enters
  the documented state exactly once, nearby higher-priority threats remain
  readable, and testers can identify hit/miss/immunity without explanation.”

Do not embed one technical implementation unless it is itself a constraint.

### 15.3 Evidence ledger template

| Design claim | Label | Source/observation | Transfer limit | Test/decision |
|---|---|---|---|---|
|  |  |  |  |  |

## 16. Quality Gates

### Promise gate

- Target player, repeated activity, pressure and intended experience are clear.
- Pillars decide trade-offs and anti-pillars are explicit.

### Mechanic gate

- Verb, rules, state transitions, phases, cost, output, feedback, failure and
  edge cases are complete.

### Decision/agency gate

- Options and trade-offs are legible.
- Consequences are perceivable and attributable.
- The best answer changes with meaningful context.

### Counterplay/readability gate

- Impact has proportional tactical or strategic response.
- Critical information survives overlap and has redundant channels.

### Loop/economy gate

- Nested loops change decision context.
- Sources, sinks, storage, conversion and feedback loops are mapped.
- Degenerate and extreme states are tested.

### Encounter/space gate

- Encounter has a thesis and finite authored progression.
- Geometry and composition state expected behavior and recovery.
- Content tests learned verbs rather than unexplained exceptions.

### Balance gate

- Balance meaning and target cohort are defined.
- Data is segmented; assumptions and sensitivity are recorded.
- Math, observation and player report are not conflated.

### Co-op gate

- Solo remains viable.
- Co-op creates observable interaction and contribution.
- Party scaling adds tactical load without violating readability.
- Disconnect, death, rescue and grief cases are specified.

### Onboarding/accessibility gate

- Every required rule is exposed, safely practiced, tested and later combined.
- Inputs, cues, timing, text, motion and communication barriers are reviewed.

### Evidence/ethics gate

- Claims carry evidence labels and limits.
- Test and rollback rules exist.
- No coercive time, money or social-capital pattern is present.

## 17. Working Templates

### 17.1 Design brief

```md
# [System/feature]
Player:
Promise:
Problem:
Target experience:
Project invariants:
Anti-goals:
Evidence:

## Causal map
Mechanic:
Expected dynamics:
Observable behavior:
Failure alternative:
Test:

## Scope
In:
Out:
Dependencies:
Risks/open decisions:
```

### 17.2 Mechanic card

```md
# [Verb]
Intent:
Agent/target:
Input:
Preconditions:
Selection:
Cost:
Commit point:
Phases:
State transitions:
Output:
Feedback:
Counterplay:
Failure:
Interactions/priority:
Edge cases:
Tunables:
Telemetry:
Acceptance:
Evidence ledger:
```

### 17.3 Encounter card

```md
# [Encounter]
Thesis:
Learned verbs tested:
Entry knowledge:
Reveal:
First demand:
Answer window:
Counter-pattern:
Escalation:
Overlap budget:
Resolution/recovery:
Enemy roles:
Spatial behavior:
Solo/co-op matrix:
Accessibility:
Events:
Pass/fail hypothesis:
```

### 17.4 Balance experiment

```md
Problem/evidence:
Balance definition:
Hypothesis:
Protected invariants:
Variable changed:
Expected behavior:
Second-order risks:
Cohorts/segments:
Metrics + observation:
Pass/hold/rollback rule:
Result:
Next decision:
```
