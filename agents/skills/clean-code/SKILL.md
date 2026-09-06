---
name: clean-code
description: Size and comment limits for the TypeScript in this repository — function and file length, parameter count, nesting, and the one kind of comment that is allowed to stay. Use when writing or editing any .ts/.tsx/.mjs file here, and when a clean-code-guard message blocks an edit.
---

# Clean code, measured

Not style preferences. Every threshold below was set from a measurement of this
repository, and every one is checked mechanically by
`.claude/hooks/clean-code-guard.mjs`.

The state that produced these rules, measured the day they were written: 196
source files, 10 877 lines of code, **4 040 lines of comment — 27% of the
source**. One file was 980 lines and 59% prose. Nobody decided that; it accrued
one reasonable-looking paragraph at a time.

## The thresholds

| What | Limit | Why this number |
|---|---|---|
| File | **500 lines** | Two files here passed it, at 980 and 942, and both had grown into four responsibilities each. Nothing else in 206 files came close, so the line is where the repository itself put it |
| Function | **40 lines**, hard stop at **80** | Counted WITHOUT its JSX and WITHOUT its comments — see below. At 40 a function stops fitting on a screen, and a function read in two halves hides its bugs in the seam |
| Parameters | **4** | The fifth is an options object asking to exist. Four files here pass it, all four with a positional bag |
| Nesting | **4** | Control flow only: an object literal is not nesting. The fifth level is a function that has not been named yet |
| Comment run | **8 lines** | Longer than that is a paragraph, and a paragraph has a better home — see below |
| Comment share | **30% of a file** | Above that the file is a document with code in it |

**JSX does not count toward a function's length.** A component returning forty
lines of markup is not a forty-line function to read. Measured: counting markup
made the guard block 24 files, most of them ordinary components — a threshold
that fires on everything teaches people to switch it off.

**Comments do not count either.** Length measures code, and prose is judged by
the comment rules instead. Otherwise one paragraph is punished twice.

## Comments: three actions, not one

The rule is NOT "no comments". It is that most comments in a codebase are a
failure to say it in the code, and a few are the most valuable lines in the file.
Every comment gets one of three fates.

**Delete it** when it restates the code. `/** Angular damping for this body. */`
above `readonly angularDamping: number` says nothing the line below does not.
Half of the 4 040 lines measured here were this.

**Move it** when it is a paragraph of design rationale. Those belong in `docs/`,
where they can be read in order by someone deciding something — not beside one
line, where they are read by accident by someone fixing something else. Leave a
single line pointing at the document.

**Keep it, and do not shorten it,** when it records a MEASUREMENT, cites a
SOURCE, or marks a dead end:

```ts
// Measured: 125 Hz against 120 fps gives alpha 1.04 every frame.
// Winter, Biomechanics of Human Movement, table 4.1 — segment mass fractions.
// FEET were tried here and reverted: corpse span went 0.559 -> 1.047 m.
```

These are the repository's memory. They survive context compaction, they cannot
be re-derived from the code, and a rule that deletes them is a rule that costs
the next person a week. When "fewer comments" and "keep the measurement"
disagree, the measurement wins.

A comment that LIES is worse than no comment. When the code under a comment
changes, the comment changes in the same edit or it goes.

## Names carry what the comment was going to say

- A function name is a verb for WHAT, not HOW: `poseToBind`, not `doStep2`.
- A name that needs a comment beside it is the wrong name.
- Do not abbreviate: `parameterBag`, not `pb`.
- One concept, one word, everywhere. If it is `segment`, it is never `part`.

## Function boundaries

- **One thing.** If the description of a function contains "and", it is two.
- **No side effect the name does not admit.** `checkPassword` that also opens a
  session is a trap.
- **Return a value, not an out-parameter.** Two results mean one object.
- **No boolean parameters.** A flag in a signature means the function does two
  different things; give them two names.

## Errors stay out of the data

An error is returned or thrown; it is never encoded in the value alongside real
data. Never return "empty" to mean "could not": an empty array that means failure
is indistinguishable from an empty array that means nothing matched, and the
caller cannot tell — which is how a silent fault gets a whole feature built on
top of it.

## The guard is a ratchet, not a wall

`.claude/hooks/clean-code-guard.mjs` measures the file that was just written. It
does not block what the repository already contains: `.claude/clean-code-baseline.json`
records today's worst numbers per file, and the guard blocks only a file that
gets WORSE than its baseline, or a new file that starts over the limit.

That is deliberate. A gate the codebase itself fails is a gate everyone learns to
ignore — measured here first-hand: switching this rule on without a baseline
would have blocked 14 files on day one. Improvements are silent; regressions
stop. Regenerate the baseline with `npm run clean-code:baseline` after a real
cleanup, never to make a complaint go away.

## Order of work when editing

1. Read the whole function first. If it does not fit on a screen, split it before
   changing behaviour — an edit inside a god function adds god function.
2. Leave it cleaner than you found it, but **never mix** a behaviour change with a
   rename or a split in one commit: when it breaks, nobody can tell which half
   did it.
3. After splitting, run the tests. A split without a test run is not a
   refactor, it is a hope.
