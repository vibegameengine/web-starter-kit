---
name: clean-code
description: Size and comment limits for the TypeScript in this repository — function and file length, parameter count, nesting, and the one kind of comment that is allowed to stay. Use when writing or editing any .ts/.tsx/.mjs file here, and when a clean-code-guard message blocks an edit.
---

# Clean code, measured

Not style preferences. Every threshold below is measured mechanically by
`.claude/hooks/clean-code-guard.mjs`, and the "why" column says where each number
came from. Two of them are not a measurement of this repository and say so;
one of them the repository does not currently meet, and says that too.

**Length blocks. Comment volume only warns.** No machine can tell the paragraph
that must go from the measurement that must stay unshortened, so a gate that
blocked on prose would eventually block the one comment the rule exists to
protect. The comment thresholds are there to be read by a person.

The state that produced these rules, measured by `scripts/lib/cleanCode.mjs` over
the 229 tracked source files the day they were written: 14 543 lines of code and
**4 276 lines of comment — 23% of every non-blank line**. The longest file was
980 lines, 45.8% of its non-blank lines comment. Nobody decided that; it accrued
one reasonable-looking paragraph at a time.

## The thresholds

| What | Limit | Why this number |
|---|---|---|
| File | **500 lines** | Four files pass it — 980, 942, 592, 555 — and each had grown into three or four responsibilities. The next longest is 488, so the line sits in the gap the repository itself left |
| Function | **40 lines**, hard stop at **80** | Counted WITHOUT its JSX and WITHOUT its comments — see below. At 40 a function stops fitting on a screen, and a function read in two halves hides its bugs in the seam. 38 files hold one over 40; 15 hold one over 80, which is why the hard stop is where the blocking happens |
| Parameters | **4** | The fifth is an options object asking to exist. 8 files pass it, every one with a positional bag |
| Nesting | **4** | Control flow only: an object literal is not nesting. **Not taken from this repository — nothing here exceeds 4.** It is a limit to keep it that way, and the one threshold here that has never fired |
| Comment run | **8 lines** | Longer than that is a paragraph, and a paragraph has a better home — see below. 84 files hold one, so this one warns constantly until the baseline records it |
| Comment share | **30% of a file** | Above that the file is a document with code in it. **This repository does not meet it**: of the 55 files with more than 20 comment lines, 36 are over 30%, the median is 37.8% and the worst is 80%. It is a target, not a description, and the ratchet is what keeps it from being noise |

**JSX does not count toward a function's length.** A component returning forty
lines of markup is not a forty-line function to read. Measured: counting every
line inside a function, markup and prose included, puts 28 files over the hard
limit instead of 15 — and 17 of those 28 are ordinary `.tsx` components. A
threshold that fires on everything teaches people to switch it off.

**Comments do not count either.** Length measures code, and prose is judged by
the comment rules instead. Otherwise one paragraph is punished twice.

**These are looser than the rules they came from,** and deliberately: the project
this was ported from blocks at 40 lines, 3 parameters and 3 levels of nesting.
40 stays here as the target, but the hard stop is 80, because 38 of these 229
files hold a function over 40 and a gate that fires on a sixth of the repository
is a gate that gets switched off in a week. Tighten them once the baseline list
has shrunk, not before.

## Comments: three actions, not one

The rule is NOT "no comments". It is that most comments in a codebase are a
failure to say it in the code, and a few are the most valuable lines in the file.
Every comment gets one of three fates.

**Delete it** when it restates the code. `/** Angular damping for this body. */`
above `readonly angularDamping: number` says nothing the line below does not. The
first cut here took the three most prose-heavy files from 715 comment lines to
530 — 185 deleted, and the files got shorter by 204.

That same cut is also the warning. It deleted ten things it was not allowed to:
a source (`GLTFLoader._markDefs`), a reverted experiment's own numbers
(`0.0145`, pelvis `0.042 -> 0.162`), a pointer to the document holding the
verdicts, and the sentence recording that a portalled light asked for 20.8
intensity, every frame, of nobody. They had to be restored from git. Compressing
prose and deleting evidence feel identical while you are doing it — which is why
the third fate below is absolute.

**Move it** when it is a paragraph of design rationale. Those belong in `docs/`,
where they can be read in order by someone deciding something — not beside one
line, where they are read by accident by someone fixing something else. Leave a
single line pointing at the document. Done twice here: the architecture of
`ragdollBody.ts` and the stepping model of `legStepping.ts` are now sections of
`docs/ragdoll-and-animation.md`, and the two files open with a pointer.

A moved paragraph must point at something that SHIPS. A restored comment here
cited `wip/imp-anim/VERDICTS.md`, which is git-ignored — the citation was dead in
every clone but the one it was written in.

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
does not complain about what the repository already contains:
`.claude/clean-code-baseline.json` records today's numbers per file, and the
guard reports only a file that got WORSE than its baseline, or a new file that
starts over a limit.

That is deliberate. A gate the codebase itself fails is a gate everyone learns to
ignore — measured here first-hand: without a baseline it would have complained
about an edit to any of 93 files on day one, four of them over 500 lines and 15
holding a function over the hard limit. Improvements are silent; regressions
speak. Regenerate the baseline with `npm run clean-code:baseline` after a real
cleanup, never to make a complaint go away.

The ratchet compares five numbers per file: length, the worst function, **the
count of functions over the hard limit**, the longest comment run and the comment
share. The count is there because the worst alone is not enough — a file recorded
at one 203-line function could be rewritten into two of 200 and pass every check.

**What "block" actually means.** This is a `PostToolUse` hook: the file is already
on disk when it runs. `decision: "block"` hands the reason back to the model, it
does not undo the write. The gate is an alarm an agent has to answer, not a lock —
and it is bypassed entirely by writing the file through a shell command rather
than through Write or Edit, because the hook is wired to those two tools.

When the guard cannot measure — stdin was not JSON, the payload carried no path,
the compiler will not resolve, the baseline is corrupt — it says so. It never
exits quietly: "measured, and clean" and "never ran at all" have to look
different, or the day it breaks is the day the repository looks like it got
clean. The one silence left is a file outside its scope, and the guard and the
baseline share a single predicate for that (`isSource`) so neither can judge a
file the other cannot record.

Both are opt-in: copy `.claude/settings.example.json` to `.claude/settings.json`,
and delete the block you do not want.

## Order of work when editing

1. Read the whole function first. If it does not fit on a screen, split it before
   changing behaviour — an edit inside a god function adds god function.
2. Leave it cleaner than you found it, but **never mix** a behaviour change with a
   rename or a split in one commit: when it breaks, nobody can tell which half
   did it.
3. After splitting, run the tests. A split without a test run is not a
   refactor, it is a hope.
