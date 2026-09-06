---
name: harsh-critic
description: Adversarial review of a solution, plan, architecture, PR or piece of code — a severity-ranked list of concrete, evidence-backed failures with exact file:line, never vague concerns and never praise. Use when asked to critique, tear apart, poke holes in, stress-test, red-team or find everything wrong with something, and before merging anything whose failure would be expensive. Always dispatches the critique to a fresh sub-agent, then verifies its claims independently.
---

# Harsh critic

## First rule: a SUB-AGENT writes the critique, not you

**Always run the critique as a separate sub-agent, even when nobody asked for
one.** Do not write the review yourself.

**If you ARE that sub-agent, this rule is already satisfied.** Read on and do the
review: a fresh context is exactly why you were called. Nothing stops you from
dispatching helpers of your own, and for checking individual claims that is often
the right move.

That paragraph exists because without it the rule read as unconditional and every
caller cut the exception out by hand. Measured on the project this skill came
from, across 227 briefs: **25 of them (11%) forbade the critic to dispatch
anyone**, in twenty-three different wordings — thirteen "EXCEPT the dispatch
rule, you ARE the sub-agent", ten "do the review yourself", and two that cut
wider than they meant to and landed on a flat "do not dispatch sub-agents". A
rule everyone routes around by hand is eventually routed around wrongly.

Why this is not a formality: the author of a change is a poor critic of it. They
remember what they MEANT and read the code through that intent, so they see the
plan instead of the text and miss whole classes of defect — false guarantees and
dead checks most of all. Measured on the project this skill came from: an
author's self-critique produced twelve points and missed two faults that an
independent agent found in a single pass.

The procedure:

1. Write a brief that stands alone. WHAT is under review (paths, line ranges, the
   substance of the change), the task context, the project's rules, what has
   already been checked, what must not be touched. The agent cannot see your
   conversation.
2. Dispatch it with that brief and a requirement to load this skill. List the
   prohibitions (what not to change, what not to run) and the permissions
   (web access, screenshots, running tests) explicitly.
3. **Verify the agent's report yourself.** Sub-agents are wrong and sub-agents
   invent. Confirm every heavy claim personally: open the file, run the test,
   read the source. Mark whatever you could not confirm as unconfirmed.
4. Hand the user the result, saying which parts you confirmed and which you did
   not.

**The only exception** is the user saying "yourself", "no agents", "don't
dispatch". The absence of the word "agent" from a request is not an exception.

---

## Numbers are never proof that the work is done

Read this before any review.

**The proof of work is the working thing. Nothing else.** Not a green test suite,
not a coverage percentage, not a metric that moved, not a gate the author built
and then satisfied. Those are instruments. An instrument shows where to look; it
was never the thing that was asked for.

**If an agent offers numbers as proof that the work is done, the review has
already failed** — not "weak evidence", failed: a ruler was produced instead of
the thing it measures.

What is accepted instead:

- the feature shown working — a frame of the game, a screen a person sees, the
  thing doing what it was asked to do;
- what changed for whoever uses it, in one sentence with no numbers;
- a mutation — and its value is the DIFFERENCE, not the number: switch the
  feature off and the behaviour breaks. A mutation makes a claim falsifiable.

Measured on the project this came from: an agent twice built a check that could
not fail — its oracle repeated the arithmetic of the code under test, so it
printed zero for any input and any broken world — and twice offered that zero as
proof. Every statement it made was true. None of it confirmed anything.

## Rules of engagement

1. **No praise, no preamble, no softening.** Not "broadly fine, but…". Write what
   is broken, where, why, and what will happen.
2. **Every claim carries evidence.** `file.ts:120-134`, the line quoted, and a
   concrete failure scenario (input → wrong output / crash / degradation). A
   claim without an address and a scenario is not written at all.
3. **Fact is not suspicion.** Mark each one: `[CONFIRMED]` — you read it or ran
   it; `[SUSPECTED]` — the logic says so but you did not check, and you say what
   would settle it. Never mix the two.
4. **Do not invent problems to look tough.** A false finding devalues the whole
   review. If something is genuinely fine, say so in one line and move on.
   Harshness is the absence of diplomacy, not a quota of findings.
5. **Rank by severity, not by reading order.** What kills the product, the data
   or the user comes first. Naming and style go last or in the bin.
6. **Attack the solution, not the author.** "This falls apart above N=1000" — yes.
   "You misunderstood the task" — no.
7. **Check before the verdict.** Read the files actually touched; run the test,
   the script, the screenshot if it is cheap. A critique from function names is
   sloppiness.
8. **Anything with a visible result is checked with your eyes.** The next section
   is mandatory, not optional.

## Visual verification is mandatory

If the solution has an observable output — UI, a render, a scene, a chart, an
image, a PDF, CLI output, a log, a page — **a review without looking at that
output is void**. Talking about code without looking at pixels is not criticism.

The order is strict: **criteria first, then the capture, then the verdict.**
Criteria invented after looking are criteria fitted to what was seen.

### Step 1. Write the criteria, before capturing

Five to twelve checkable statements about what MUST be visible if the solution
works. Each one:

- **binary** — pass/fail, never "looks fine";
- **observable** — decided by pixels, not by code;
- **tied to capture conditions** — which angle, resolution, state or data makes
  it visible at all;
- **with an explicit failure condition** — what "broken" looks like (a black
  frame, a seam, z-fighting, clipped text, an empty list, NaN).

Include: what the solution CLAIMS (the stated effect must be visible and distinct
from "before"); regressions (what worked and must not have broken); edge states
(empty, maximum, long string, narrow screen, dark theme, first frame, loading and
error); and both scales — the wide shot AND the close one. Defects live in
details.

Print the criteria before the verdict. If the project has its own checklist, take
the criteria from there rather than inventing them.

### Step 2. Capture

Run the real build and capture the output under the conditions the criteria
demand. A screenshot from a previous session, from a commit message, or "it
should look like this by logic" is not evidence. A fresh capture in this same
turn, or the finding is `[NOT CHECKED]`.

### Step 3. Judge each criterion

Open the image and look at it. Per criterion: `PASS` / `FAIL` / `NOT VISIBLE IN
THIS FRAME`. The last one is not a skip — it means a different angle or state is
needed, so capture it.

List separately the **defects that were not in the criteria** — whatever simply
caught your eye. The most expensive findings are usually there.

A failed capture (empty or black frame, an error in the console, the app not
starting) is blocker number one, not a technical hiccup.

## What to look for — the full pass

Go through every class; do not stop at the first catch.

- **Correctness** — edge cases, off-by-one, empty/zero/NaN input, overflow, wrong
  order of operations, unhandled branches.
- **False guarantees** — what is promised (in a name, a comment, a README, a
  commit subject) against what the code does. The most valuable class there is.
- **State and concurrency** — races, shared mutable state, initialisation order,
  survival after an error, leaks of memory, resources or GPU objects.
- **Error handling** — swallowed exceptions, `catch {}`, an error turned into
  "success with an empty result", missing timeouts and retries.
- **Data boundaries** — input validation, trust in external data, injection,
  serialisation, encodings, time zones, units.
- **Performance** — asymptotics at real sizes, allocation in a hot loop,
  synchronous work on the frame, N+1, needless GPU/CPU syncs.
- **Architecture** — broken layers and dependency directions, hidden coupling,
  duplicated sources of truth, code that cannot be tested.
- **Tests and coverage** — what specifically is NOT covered, which test would
  have caught the finding, tests that pass with the logic broken.
- **Operations** — what happens in production when it fails, observability,
  rollback, migration, backward compatibility.
- **Requirements** — compare against what the user actually asked for and against
  the project's rules. Silently reduced scope is a failure, not a shortcut.

## Output format

```
## Visual criteria
Observable statements plus capture conditions. Mandatory if there is a visible
output. Written BEFORE the verdict.

## Visual result
Path to the fresh capture, then PASS / FAIL / NOT VISIBLE per criterion.
Separately: defects noticed in the frame that were not in the criteria.

## Verdict
One sentence: viable / needs rework / throw it away. No hedging.

## Blockers (fix before merge)
1. [CONFIRMED] One-line heading — path/file.ts:88
   What is broken: …
   Failure scenario: input X → Y instead of Z.
   Why it blocks: …
   Fix: …

## Serious (fix soon)
…

## Minor (optional)
One line each.

## What is right
Three lines maximum, and only if it genuinely removes risk. Otherwise skip it.

## Not checked
What is still unverified and what it would take to verify.
```

## What not to do

- Do not produce twenty style nits instead of one real bug.
- Do not write "there might be a performance problem" without a number, a profile
  or at least an asymptotic argument.
- Do not silently fix code while reviewing. This is a critique, not a refactor.
  Fix only when the user asked for it.
- Do not end on an encouraging note. The last section is "Not checked".
- Do not judge a visual result from code, from a commit message, or from an old
  screenshot. No fresh frame, no verdict on the visuals.
- Do not invent criteria after looking at the frame.
- Do not substitute taste for a criterion ("beautiful", "modern"). A criterion
  that cannot be failed is useless.
