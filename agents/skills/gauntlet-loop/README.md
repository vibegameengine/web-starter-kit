# Gauntlet Loop

A working process for driving AI-agent work to a standard it would not reach on
its own: **build it, set adversaries on it, fix what survives scrutiny, go
again** — until the critics go quiet.

It exists because the naive loop (look at your own output, tweak, look again)
converges on something that satisfies you and nobody else. An agent judging its
own work is really just checking that the code did what was typed. A gauntlet
replaces that with reviewers whose job is to disagree.

Proven driving a browser kart racer toward a concept-art reference, where a
single unlensed critic found eight things four specialised critics had all
missed — including that the road was simply the wrong shape.

## What is here

| | |
| --- | --- |
| [**`SKILL.md`**](SKILL.md) | The process. Prose, not configuration — it explains why, and it is the thing to read. Drop it in `~/.claude/skills/gauntlet-loop/` to use it as a Claude Code skill. |
| [**`example/`**](example/) | **One complete run, end to end.** A pricing card rebuilt against a screenshot of the real page: the bar written before starting, the blockout, three passes, the five critic prompts as sent, two rounds of real critic output, both consolidated defect lists, both rejection logs. Mean pixel error 17.09 → 12.73 → 9.98. |
| [**`harness/`**](harness/) | Five commands that turn a rendered thing into numbers: render in a fixed frame, colour at a point, a feature's bounding box and its delta from the reference, runs of flat colour along a scanline, one overall difference number. |
| [**`templates/`**](templates/) | The critic and builder briefs as blanks. Authoring five critic briefs and two file-ownership lists per builder is the bulk of the real labour. |

Start with `example/`. Every instruction in `SKILL.md` that sounds abstract has a
concrete instance there — including the ones that turned out to be wrong the
first time.

## The short version

**Fan out critics, not just builders.** Parallel, read-only, one lens each —
composition, materials, lighting, props. Each told explicitly *not* to comment on
the others' lenses, because overlap produces four vague reviews instead of four
sharp ones. Demand numbers: "too dark" is unusable; "our midtones are
rgb(93,97,78), the reference is rgb(136,95,77), set the hemisphere to X" is a
patch you can apply.

**Ship the critics a way to obtain a number.** This is where a first run fails:
five critics dispatched with a brief they have no means of satisfying, and five
of them come back with adjectives. `harness/` exists because the agent that first
ran this process from the repository alone had to write it before any critic
could answer the brief.

**Always run one critic with no lens at all.** Lenses have a blind spot exactly
where they meet. In the worked example the unlensed critic found that a nested
corner radius was geometrically wrong — while the layout critic had just declared
the rectangles pixel-perfect and the colour critic had declared the fills exact,
and both of them were right. In the run before that, four lensed critics produced
forty defects between them and every one of them missed that the primary subject
was the wrong shape.

**Make critique a separate act, written, before touching code.** An agent that
builds and judges in one continuous motion is only checking that the code did
what was typed. Writing it down is what forces measurement, and measurement is
what finds the cause: not "the button looks a bit high" but "exactly 42 px high,
and the cause is the four-line wrap, not the padding" — where the obvious fix
would have been wrong.

**Give every builder a file set it exclusively owns**, plus an explicit list of
the files another agent is editing right now. Two agents in one file lose work
silently. When there is only one file, do not partition it: run the critics in
parallel as always and apply the consolidated list yourself, in order.

**Let builders overrule critics, and make them report what they rejected.** A
measured number is still a guess about intent. This is also how the loop catches
its own overcorrections — in the worked example, round 2 *reversed* a round-1
change instead of stacking a second fix on top of it, because round 1 had fixed a
real symptom using the wrong variable.

**Blockout before assets.** Rebuild the target's composition as flat-coloured
boxes at true size and position first. No model, texture or light rescues a
layout that is wrong, and a beautiful asset in the wrong place is *worse* than a
box in the right place, because it invites you to stop looking. In the worked
example, nine grey rectangles caught a coordinate-origin error that every
measurement taken afterwards would have carried.

**Verify in the shipping frame, and cap the rounds.** Every render in the same
aspect and size, from a file the tooling reads rather than a flag people forget,
or no two numbers are comparable. And write a round cap into the bar before
starting: "until the critics go quiet" is the stop condition, the cap is the stop
guarantee, and a defect whose cause is unfixable has to be closed in writing or a
naive critic will re-file it forever.

The rest — how to brief a critic, how to consolidate five of them into one list,
what to do when two of them contradict each other, when to stop, what to do when
the target is a sentence rather than a file, and the recorded pitfalls from the
runs that produced this — is in [`SKILL.md`](SKILL.md).

## Scope

This repository is the review process and nothing else.

## Licence

MIT — see [LICENSE](LICENSE). The reference images in `example/reference/` are
screenshots of a third-party website, included as the subject of criticism;
nothing here is affiliated with them.
