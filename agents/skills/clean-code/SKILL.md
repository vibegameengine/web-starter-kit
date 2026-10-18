---
name: clean-code
description: The comment ban and the size limits for the TypeScript and JavaScript in this repository — no comments except toolchain directives and ones marked @important, plus function and file length, parameter count and nesting. Use when writing or editing any .ts/.tsx/.js/.mjs file here, and when a clean-code-guard message blocks an edit.
---

# Clean code, measured

Not style preferences. Every rule below is measured mechanically by
`.claude/hooks/clean-code-guard.mjs` through `scripts/lib/cleanCode.mjs`, and the
"why" column says where each number came from.

**Comments are forbidden, and a new one blocks.** So does a file or function
growing past its limit. Parameters and nesting only warn.

The state that produced these rules, measured over the 229 tracked source files
the day they were written: 14 543 lines of code and **4 276 lines of comment —
23% of every non-blank line**. The longest file was 980 lines, 45.8% of its
non-blank lines comment. Nobody decided that; it accrued one reasonable-looking
paragraph at a time.

## The thresholds

| What | Limit | Why this number |
|---|---|---|
| File | **500 lines** | Four files pass it — 980, 942, 592, 555 — and each had grown into three or four responsibilities. The next longest is 488, so the line sits in the gap the repository itself left |
| Function | **40 lines**, hard stop at **80** | Counted WITHOUT its JSX and WITHOUT its comments — see below. At 40 a function stops fitting on a screen, and a function read in two halves hides its bugs in the seam. 38 files hold one over 40; 15 hold one over 80, which is why the hard stop is where the blocking happens |
| Parameters | **4** | The fifth is an options object asking to exist. 8 files pass it, every one with a positional bag |
| Nesting | **4** | Control flow only: an object literal is not nesting. **Not taken from this repository — nothing here exceeds 4.** It is a limit to keep it that way, and the one threshold here that has never fired |
| Comments | none | See below. Toolchain directives and comments marked `@important` are not counted |

**JSX does not count toward a function's length.** A component returning forty
lines of markup is not a forty-line function to read. Measured: counting every
line inside a function, markup and prose included, puts 28 files over the hard
limit instead of 15 — and 17 of those 28 are ordinary `.tsx` components. A
threshold that fires on everything teaches people to switch it off.

**Comments do not count either.** Length measures code, and a comment is judged
by the ban instead. A comment trailing a line of code does not remove that line
from the count: measured, 40 appended `// step n` comments once took a 104-line
function down to 64 and out of the block.

**These are looser than the rules they came from,** and deliberately: the project
this was ported from blocks at 40 lines, 3 parameters and 3 levels of nesting.
40 stays here as the target, but the hard stop is 80, because 38 of these 229
files hold a function over 40 and a gate that fires on a sixth of the repository
is a gate that gets switched off in a week. Tighten them once the baseline list
has shrunk, not before.

## Comments are forbidden

No comments in code: no line comments, block comments, JSDoc, TODO/FIXME,
commented-out code, banners or explanatory notes. Most comments in a codebase are
a failure to say it in the code, and the ones that are not have a better home.

**Say it in the code.** `/** Angular damping for this body. */` above
`readonly angularDamping: number` says nothing the line below does not. A comment
that explains a step is a function name asking to exist; one that explains a
number is a named constant asking to exist.

**Move rationale out.** A paragraph of design reasoning belongs in `docs/`, a
skill or the owning role's `memory.md`, where it is read in order by someone
deciding something. It must point at something that SHIPS: a comment here once
cited `wip/imp-anim/VERDICTS.md`, which is git-ignored — dead in every clone but
the one it was written in.

**Deleting is where evidence gets lost.** The first cut here deleted ten things it
was not allowed to: a source (`GLTFLoader._markDefs`), a reverted experiment's own
numbers (`0.0145`, pelvis `0.042 -> 0.162`), and the sentence recording that a
portalled light asked for 20.8 intensity, every frame, of nobody. They had to be
restored from git. Before removing a comment that records a MEASUREMENT, cites a
SOURCE or marks a dead end, move it to a document — or mark it `@important`.

### What passes the guard

**`@important` anywhere in the comment.** The escape hatch for the line that
cannot live anywhere but beside the code, and it is spent rarely:

```ts
// @important measured: 125 Hz against 120 fps gives alpha 1.04 every frame.
```

**Toolchain directives,** because they are instructions to a tool, not prose:
`/// <reference … />`, `eslint-disable` / `eslint-enable` / `-next-line` / `-line`
(a `-- reason` after them is part of the directive), `/* eslint rule: off */`,
`/* global … */`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `@ts-check`,
`/*#__PURE__*/`, `/* @vite-ignore */`, `webpackChunkName:`, `prettier-ignore`,
`c8` / `istanbul` / `v8 ignore`, `@vitest-environment`, `@jsxImportSource`,
`//# sourceMappingURL=`. The list lives in `TOOLING_DIRECTIVES` in
`scripts/lib/cleanCode.mjs`; a directive only passes when it opens the comment.

A shebang (`#!/usr/bin/env node`) is not a comment at all.

### Old comments

A file recorded in the baseline may keep the comments it already has, and the
guard warns about them on every edit. It blocks when the count grows. Remove them
while the file is open, moving anything worth keeping first.

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
holding a function over the hard limit. Regressions block; old comments in a
recorded file only warn. Regenerate the baseline with `npm run clean-code:baseline`
after a real cleanup, never to make a complaint go away.

The ratchet compares four numbers per file: length, the worst function, **the
count of functions over the hard limit**, and the count of forbidden comments.
The function count is there because the worst alone is not enough — a file
recorded at one 203-line function could be rewritten into two of 200 and pass
every check.

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

The guard is wired in `.claude/settings.json`. `.claude/settings.example.json`
also carries the opt-in `block-destructive-git` hook.

## Order of work when editing

1. Read the whole function first. If it does not fit on a screen, split it before
   changing behaviour — an edit inside a god function adds god function.
2. Leave it cleaner than you found it, but **never mix** a behaviour change with a
   rename or a split in one commit: when it breaks, nobody can tell which half
   did it.
3. After splitting, run the tests. A split without a test run is not a
   refactor, it is a hope.
