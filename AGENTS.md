# Agent Entry Point

## ⛔ ABSOLUTE RULES (read first, no exceptions)

Every rule below carries the incident that produced it, and those incidents
happened in the game this kit was distilled from. Where an example names an
arena, a wave, a mob or a route, that world is not in this repository — the
number and the mechanism are what transfer, and they were measured, not
imagined. The rules themselves apply here without exception.

0. **COMMIT. As soon as a coherent piece works — commit it. Do not wait to be
   asked.** Not at the end of the task, not when the whole feature is finished,
   not "once it is proven": the moment a piece compiles and does something, it
   goes into git.
   - **Even if somebody else is working in the tree. Especially then.** Several
     agents share this working copy. Uncommitted work has no history, no diff and
     no way back: `git log -- <file>` on an untracked file prints nothing, so
     when it breaks nobody can tell what changed or who changed it.
   - Measured on this project: a whole navigation system - six files - sat
     untracked for three hours while another session edited one of those files
     underneath it. For twenty of those minutes the tree did not compile, and the
     question "what broke it" had no answer to give, because there was no
     baseline to diff against.
   - Asking permission to commit is not caution, it is the delay itself. This
     rule is the permission. Commit on a branch, never straight to `main`.

1. **NEVER run the app in headless mode.** No headless browsers, no
   headless/software-GL (swiftshader) rendering — for ANY reason, ever. Headless
   WebGL/WebGPU results are misleading and must never be used to judge or claim
   that anything works.
   - **Visual confirmation happens in a HEADED (visible-window) browser** — either
     the **user** looking in their real browser, or you driving Playwright with
     `headless: false` against a normal `npm run dev` server. A real visible
     window on the real GPU is allowed and is the correct way to check how the
     scene actually looks. Headless is the ban; headed is fine.
   - Compilation checks (`tsc`, `npm run build`) and reading source are allowed,
     but they are NOT visual verification — never claim something "looks right"
     from a typecheck/build alone; look at a headed frame.
   - **For normal hot-reload work, do not run `tsc`, `npm run build`, lint,
     tests, or Knip as a routine check.** Reuse the already-running dev server,
     let HMR apply the scoped change, and confirm the affected surface in a
     headed browser. Run a static check only when the user explicitly asks for
     it or when diagnosing a concrete compile/runtime failure.

2. **NEVER delete files, remove code wholesale, or `npm uninstall` without the
   user's explicit permission.** Preserve work (keep in place or save to a
   branch) and ask first. See memory `never-delete-without-permission`.

2a. **NEVER MEASURE A SYSTEM IN A PLAYABLE SCENE.** A playable scene is for
   measuring INTEGRATION — that these systems run together, in the real
   renderer, without the frame falling apart — and for nothing else. Any claim
   about how a system BEHAVES is measured in its own DEV lab, built with
   `/dev-lab-authoring`: chosen geometry, a fixed cast, the same numbers on every
   run.

   Why, in numbers from the day this was written. A wave was measured on the
   combat arena to decide whether recast was steering it. Twice in a row the run
   was contaminated by state the scene owns and the measurement does not —
   survivors of the previous wave standing on the player at t = 0, and a `reset`
   that quietly rebuilt the fight at wave one, so a wave-2 run reported sixteen
   bodies of which ten carried `w1-` ids. Both runs looked perfectly healthy and
   printed confident numbers. The same questions asked in the lab answered on the
   first try and reproduced exactly.

   A playable scene has a live player, a spawner that drip-feeds, waves that
   overlap, deaths, physics corpses and a camera that moves. Each of those is a
   variable the measurement did not declare, and every one of them is free to
   explain the result instead of the thing being measured. A frame from such a
   scene cannot distinguish a working system from a broken one: measured, the
   demo arena's wave arrives 6 of 6 with pathfinding switched fully OFF, from
   five different standing places.

   So: if the question is "does this work", build the lab. If the question is
   "do these fit together in the real product", the scene is the right place and
   the answer is a frame, not a statistic. A statistic gathered in a playable
   scene proves nothing and will be rejected.

2b. **A FAULT IS FOUND IN THE CODE, IN THIS ORDER. Frames are proof, never a
   debugger.**

   1. **Read the code first.** Grep for who already does the thing, open the
      file, read the arithmetic. Most faults are visible there and nowhere else.
   2. **Then reason.** Ask why the code produces what is described — think the
      mechanism through before touching anything.
   3. **A frame is EVIDENCE THAT SOMETHING WORKS, not an instrument for finding
      out why it does not.** You will not debug anything with screenshots. The
      only exception is a task that is literally about comparing frames.

   Measured, the day this was written. Blood stood off the walls in the level.
   The answer was two rasters describing one wall — the drawing on the kit's
   ~1.75 m grid slid by a fractional recentre offset, the collision on a 0.9375 m
   grid pinned to the world origin, so a wall face could differ by half a cell,
   0.47 m. That is arithmetic, and it sat in the level's two grid modules — the
   one that draws and the one that collides — the whole time. Those files belong
   to the game this kit was distilled from and are not in this repository; what
   is portable is the shape of the fault, two rasters describing one wall.
   Instead of reading them the agent planned to shoot at walls in a headed
   browser and look — proposing to judge a 47 cm discrepancy by eye, in a
   screenshot, in a scene with a live fight in it. The owner: *"твой расчёт, что ты каким-то чудом
   сможешь понять это кадром — как ты себе это вообще представляешь?"*

   The same session had already lost an hour to the same reflex: the yard was
   drawn twice, and `grep -rn "<GeneratedCathedralArena" src` — one line, one
   second — was run after a hundred tool calls of probes and captures.

2c. **WHAT THE USER SAYS IS A FACT UNTIL PROVEN OTHERWISE. Do not re-measure it.**

   When the owner says "the sky is gone", "there are two geometries", "the world
   is offset a little", "blood is fine in the lab" — that is a report from the
   person looking at the running game. Take it as given and go find the CAUSE.
   Spending a turn confirming the symptom is spending the owner's time to learn
   what they already told you, and it reads as not listening.

   Contradicting it needs evidence, not doubt: if the code says otherwise, say
   which line and why, and let them correct you.

3. **NEVER build scenes procedurally / dynamically — scenes are ALWAYS authored
   by hand.** No RNG scatter, no seeded generators, no `range()`/random placement,
   no "spawn N of these from a loop to fill space". Every element's position,
   rotation and scale is chosen **deliberately** to serve the composition and the
   reference — never sketched, scattered, or "roughed in".
   - Work one intent at a time. After each placement step, take a **headed
     screenshot and look at it** — 100% visual confirmation of every step, no
     "probably fine, moving on".
   - Think through where each element goes and why *before* writing it. Layout is
     a design decision, not a `for` loop.
   - See the scene-authoring skill (`threejs-scene-authoring`).

4. **NEVER stop to ask a question you could answer yourself.** You were given a
   goal. Not knowing something is not a reason to hand the decision back — it is
   the work. Run `/harsh-critic` with the question and let a fresh agent answer
   it, then act on the answer and say what you decided and why.
   - This includes decisions that feel like they belong to the user: which of two
     designs to take, whether a stale test encodes a feature or a mistake,
     whether to commit, what a roster of enemies should be. Decide, state the
     decision plainly in the report, and make it reversible where you can.
   - The bar for actually stopping is narrow: an action that is destructive,
     outward-facing, or that you cannot undo. Everything else is you being lazy.
   - Asking twice for the same thing is the tell. If a question has gone
     unanswered, that is an answer: decide it.

5. **NEVER remove asset optimization to make something work.** `?meshopt`,
   `?texture=…`, audio re-encoding and every other build-time optimizer stay ON.
   Dropping one is not a fix — it is shipping the megabytes to hide a bug that is
   still there, and it will be copied by the next asset.
   - If an optimized asset breaks a system, **fix the system**. The optimizer is
     doing something legitimate and documented; the consumer is making an
     assumption that does not hold.
   - Worked example, and the reason this rule exists: `?meshopt` quantizes a
     skinned mesh — vertex positions are rescaled and re-centred and the inverse
     bind matrices are rewritten to compensate. The render is identical, but
     `Skeleton.pose()` then returns a bind pose at a different scale, and the
     ragdoll measured its capsules in it: giant colliders on a living body, and
     the body doubling in size the moment it died. The fix is in
     `ragdoll/systems/mixamoRig.ts` (`poseToBind` normalizes the bind pose back to
     the size the body actually lives at) — NOT in the import.
   - Removing an optimizer query is a change the user asks for explicitly, never
     one an agent reaches for while debugging.

6. **ALWAYS write down, as you go, what a future agent would want to know.** Not
   at the end, not "if there is time" — while the finding is still fresh, in a
   markdown file, in the same change that produced it.
   - Two destinations, and say which one a lesson belongs to:
     **project** — how THIS game's systems behave, into `docs/…md`;
     **kit** — a lesson that would hold in any project with the same technique
     (a ragdoll, a skinned rig, a build-time optimizer, a headed test bench).
     Mark those explicitly so they can be lifted into the shared kit later. A
     lesson nobody labelled as portable never gets ported.
   - Write the FALSIFIED ones too, with the number that falsified them. A
     recorded dead end is worth more than a recorded success: the success gets
     re-derived from the code, the dead end gets retried by every agent after
     you. Put it next to the line it concerns, not only in a document.
   - What earns a line: a constant that turned out to be stale, a statistic that
     measured the wrong thing, an instrument that disagreed with another, a fix
     that made things worse and by how much, an assumption the code quietly
     violated.
   - **The bench is not evidence.** Captures belong in the git-ignored
     `wip/<task>/`; the SCRIPT that produced them belongs in `scripts/`. The
     test: if losing it would make a number you wrote down unrepeatable, it is a
     tool, and tools are committed. A whole task's instrument sat in `wip/` here
     while the document quoting it was committed — one `git clean` from turning
     every measurement into an unverifiable claim.
   - This is not documentation-for-its-own-sake, and it does not replace doing
     the work. It is the difference between a session that leaves a system and a
     session that leaves a system plus the reasons it is shaped that way.

7. **NEVER write a Markdown file through a shell script.** No heredoc, no
   `cat >`, no `echo`, no Python that assembles prose. Use the Write tool, once.

   Prose is full of the characters a shell eats: apostrophes, backticks,
   `$`, `\`, and lines that look like a heredoc terminator. The quoting is
   wrong on the first attempt, the failure arrives only after the whole
   document has been sent, and the entire document is then sent again. The
   owner named the cost exactly: **twice the tokens for one file.**

   Measured here: a research document went out as a `cat > … <<'EOF'`
   heredoc, died on `unexpected EOF while looking for matching \`'`, and was
   re-sent verbatim through Write. Nothing about the second attempt was
   different except the tool.

   The rule is about the DIRECTION of the edit, not the file type. A script is
   still the right tool for a surgical change to code — a one-line constant, a
   rename across files, an anchored replace. It is the wrong tool the moment
   the payload is a paragraph. If you are about to paste more than a few lines
   of prose into a shell, you are about to pay for it twice.

8. **ALWAYS think and talk to other agents in English, compressed caveman-style.
   ALWAYS answer the user in Russian.** The two channels are separate and the
   rule is about the audience, not about the language you happen to be in.
   - **Internal traffic — English, caveman.** Reasoning, subagent briefs, task
     descriptions, what an agent reports back, agent-to-agent handoffs. Nobody
     reads this but machines: drop articles, filler (`just`, `really`,
     `basically`), pleasantries, hedging and narration of tool calls. Fragments
     are fine. It is output tokens either way, and output is 5× the price of
     input.
   - **The user's channel — Russian, normal prose.** Every reply the owner
     reads. Compressing that one buys a few tokens and costs comprehension.
   - **Never compress what must survive verbatim:** code, file paths, exact
     error strings, API and CLI names, numbers, units, and the words
     `not`/`never`/`only`/`except`. Flipping a negation is worse than any token
     saved. Do not invent abbreviations (`cfg`, `impl`, `req`) — the tokenizer
     splits them the same as the full word, so they save nothing and read worse.
   - **Drop the compression where ambiguity is expensive:** security warnings,
     confirmations of irreversible actions, and multi-step sequences whose order
     could be misread. Resume it once that part is clear.
   - Persisted artifacts are the user's channel, not the internal one: commits,
     docs, `wip/` notes, issue and PR text, and this file are written in normal
     prose because humans read them later.

## Roles

## Local WIP (mandatory)

Before starting work, **always read `wip/README.md`**. `wip/` is a local,
Git-ignored workspace for verification screenshots, temporary renders, debug
probes and active handoff notes. Put those artifacts there — never in `docs/`,
source directories or commits. If it is missing, create `wip/README.md` before
producing WIP artifacts and keep its current task notes accurate.

All agent roles and workflow rules live in [agents/AGENTS.md](./agents/AGENTS.md).

Start there, then open the selected role under `agents/<role>/AGENTS.md`.

**After selecting your role and before starting any work, determine the list of
skills the task needs and load them up front.** Match the request against the
available skills (`agents/skills/`, surfaced under `.claude/skills/`) first —
choose the relevant ones deliberately before writing anything, not mid-task.
