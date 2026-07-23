# Agent Entry Point

## ⛔ ABSOLUTE RULES (read first, no exceptions)

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

2. **NEVER delete files, remove code wholesale, or `npm uninstall` without the
   user's explicit permission.** Preserve work (keep in place or save to a
   branch) and ask first. See memory `never-delete-without-permission`.

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
