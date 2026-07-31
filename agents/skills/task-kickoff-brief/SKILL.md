---
name: task-kickoff-brief
description: Open every task by writing a kickoff brief — the task restated exactly as understood, the concrete work that will follow, and the explicit list of skills to load before the first edit. Use at the start of any request that will change files, and again whenever the scope, the understanding, or the chosen approach changes mid-task.
---

# Task Kickoff Brief

## ⛔ ALWAYS MANDATORY — the visual verification gate (read before anything else)

**`visual-verification-gate` appears on the skill list of EVERY brief, always.
No exception, no judgement call, no "this one is just an audit / a doc / a
refactor".** It is not a skill you weigh against the task like the others; it is
a standing requirement every brief carries. Load it before the first edit, and
satisfy it before reporting the task done.

The only thing a brief may decide is WHICH surface the gate applies to — never
WHETHER it applies.

Marking it `N/A` is permitted only when the task can neither alter a rendered
surface nor make a claim about one, and that reason must be written out in full.
These are NOT that reason:

- "no browser/tool was available" — walk the tool ladder to its end first;
- "a headed run was not taken" — that is the gap, not an excuse for it;
- "counted from source instead of measuring" — source reading is not evidence;
- "nothing was edited, so nothing can regress" — a claim ABOUT the rendered
  result still has to be verified against the rendered result.

**Naming an unverified gap does not discharge it.** Writing "not visually
verified" is honest reporting, never a substitute for doing the verification.
If you find yourself about to write that sentence, go and close the gap instead.

A task starts with a written brief, not with an edit. The brief proves the request
was understood before effort is spent, and it fixes the skill set up front so no
mandatory technique is discovered halfway through — or silently skipped.

The brief is cheap. Rewriting work built on a misread request is not.

## Non-negotiable rules

- Write the brief BEFORE the first file edit, and show it to the user.
- Restate the task in your own words. Never echo the request back verbatim — a
  copy proves nothing about comprehension.
- Read enough of the existing code to make the brief true. A brief written from
  assumptions about what exists is a guess with formatting.
- Choose skills by matching the task against the full available skill catalog,
  deliberately, before writing anything — not mid-task, not after a review
  complains.
- Name the skills you deliberately did NOT load and why. A near-miss skill left
  unnamed is indistinguishable from a skill you forgot.
- Load the chosen skills, then start. Do not write the brief and begin from
  memory of what a skill "probably says".
- State assumptions explicitly. An unstated assumption is a defect waiting for
  the review.
- Separate what was ASKED from what you INFERRED. The inferred part is where
  disagreements live, so it must be visible.
- Re-issue or amend the brief the moment the understanding changes.

## Brief format

```text
Task as understood
- Goal: what the user wants to be true when this is done, in your words
- Asked explicitly: the literal request
- Inferred: what you concluded the request implies, marked as inference
- Out of scope: adjacent work you will NOT do
- Unknowns: what you could not determine from the code or the request

Current state
- What already exists that this touches (files, systems, prior work)
- What is missing, wrong, or duplicated

Plan
- Ordered, concrete steps; each one an observable change, not a theme
- Acceptance: how each step is proven done

Skills to load
- <skill>: why this task needs it
- Not loading <near-miss skill>: why it does not apply

Decisions for the user
- Questions whose answers change the work (or "none")
```

Keep it short. A brief that is longer than the change it precedes is procrastination.

## Restating the task

- Convert the request into outcomes, not activities. "Player can open the pack
  and move items" beats "work on inventory".
- Name the surfaces that will change. If you cannot name them, you have not read
  enough yet — read first, then write the brief.
- Where the request is ambiguous, pick the reading a careful colleague would pick,
  state it as an assumption, and continue. Only block when proceeding under any
  reading could be unsafe or would waste the whole effort if wrong.
- Where the request conflicts with the project's own rules or its design spec,
  say so in one line in the brief and propose the resolution. Do not silently
  reinterpret the request into the version you prefer.
- If the request is trivial and mechanical, the brief collapses to one sentence
  plus the skill line. Do not pad it into ceremony.

## Choosing the skills

1. Enumerate what the task actually touches: rendering, layout, state, timing,
   assets, content pipeline, architecture, verification, localization.
2. For each of those, look for a skill that owns it. A skill that owns a surface
   is MANDATORY when you touch that surface, whether or not the user named it.
3. Prefer the most specific skill. A general workflow skill does not replace the
   one that governs the exact surface you are editing.
4. Always ask which skill defines ACCEPTANCE for this task, not only which one
   defines construction. A plan with no verification skill is unfinished.
5. Record the near misses. For each skill that plausibly applies but will not be
   loaded, give the one-line reason.

Loading three relevant skills up front is cheaper than one rewrite. When unsure
whether a skill applies, load it.

## Amending mid-task

The brief is a live contract, not a preamble. Re-state the changed part — and
only the changed part — when:

- the code turns out to be different from what the brief assumed;
- the user answers an open question or redirects the work;
- a step is blocked and part of the scope must be deferred;
- a newly-touched surface pulls in a skill that was not on the list.

Never let the delivered work quietly diverge from the brief. Finish the agreed
scope, and say explicitly what was left out and why.

## Anti-patterns

- Starting to edit and writing the plan afterwards to match what was already done.
- A brief that lists file names but never says what the user gets.
- "I will use the relevant skills" — the list must be concrete and named.
- Restating the request as a paraphrase with no current-state reading behind it.
- Declaring scope done while an unmentioned part of the ask was dropped.
- Treating the brief as approval to skip the user's decisions: open questions
  that change the work are asked, not assumed away.
- Listing every skill the task touches EXCEPT the one that proves the result.

## ⛔ Closing reminder — the visual verification gate

Every brief carries `visual-verification-gate`. Always. If you have read to the
end of this skill and it is not on your list, the list is wrong — go back and
put it there before the first edit.

A task is not done when the code compiles, the tests pass and the brief's steps
are ticked. It is done when the rendered result has been LOOKED AT in a headed
surface and the evidence is recorded. "Compiled but not visually verified" names
an unfinished task honestly; it never describes a finished one.
