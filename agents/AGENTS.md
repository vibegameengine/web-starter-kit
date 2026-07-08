# Multi-Agent Workflow

## Scope
- This file is the source of truth for repository-level agent routing, workflow, memory, handoff, and validation rules.
- These instructions are game-oriented, but they must not depend on one specific game, setting, mechanic, platform, or store.
- After choosing a role, stay in that role until the task is complete or the user explicitly asks to switch roles.

## Available Agent Roles
- Manager: [manager/AGENTS.md](./manager/AGENTS.md)
- Programmer: [programmer/AGENTS.md](./programmer/AGENTS.md)
- System designer: [system-design/AGENTS.md](./system-design/AGENTS.md)
- Product designer: [product-design/AGENTS.md](./product-design/AGENTS.md)
- Game designer: [game-design/AGENTS.md](./game-design/AGENTS.md)
- Narrative designer: [narrative-design/AGENTS.md](./narrative-design/AGENTS.md)
- Motion designer: [motion-design/AGENTS.md](./motion-design/AGENTS.md)
- Platform publishing: [platform-publishing/AGENTS.md](./platform-publishing/AGENTS.md)

## Start Here
- Read [memory.md](./memory.md) before noticeable work.
- Choose the leading role for the task.
- Read the selected role's `AGENTS.md` and local `memory.md`.
- Use [WORKFLOW.md](./WORKFLOW.md) for task lifecycle, handoff, and verification flow.

## Role Selection
- Choose `manager` for routing, coordination, scope, task framing, handoff, and final readiness decisions.
- Choose `programmer` for code, architecture, runtime behavior, bugs, refactors, UI implementation, tests, and validation.
- Choose `system-design` for engineering specs, module boundaries, contracts, edge cases, data flow, and implementation handoff.
- Choose `product-design` for UX behavior, screen states, flows, interaction rules, feedback, and product-facing acceptance criteria.
- Choose `game-design` for game rules, core loop, mechanics, rewards, progression, balance, meta systems, and gameplay invariants.
- Choose `narrative-design` for story, characters, tone of voice, naming, dialogue, lore, onboarding text, and narrative framing.
- Choose `motion-design` for animation intent, timing, easing, feedback, transitions, ceremony, and reduced-motion strategy.
- Choose `platform-publishing` for release readiness, metadata, platform compliance, package requirements, submission, and store blockers.

## No Silent Role Drift
- Do not silently mix roles.
- If a task becomes cross-disciplinary, name the leading role, adjacent roles, and why they are needed.
- If ownership changes, state the switch before using the new role's rules.

## Production-Ready By Default
- Do not frame work as a PoC, MVP, prototype, temporary shortcut, or placeholder unless the user explicitly asks.
- Small steps are acceptable, but each step must fit the final architecture and remain safe to evolve.
- If an asset or implementation detail is temporary, the contract and behavior must still be replaceable without rewriting the feature.

## Runtime Checks
- Use Playwright for browser/runtime verification instead of HTTP-only checks.
- Before starting a new dev server, check whether the app is already available through the browser workflow when feasible.
- Close Playwright sessions after the task that used them.

## Validation
- Before final delivery after code changes, run the repository's standard validation commands when feasible:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - `npm run knip`
- If validation is blocked or red, report the exact blocker.
- Do not call a task complete while known failures from the current work remain unresolved.

## Repository Rules
- Runtime assets must live near their owning feature/component or shared primitive.
- Do not import production assets directly from a root `assets/` staging folder.
- Keep external references, experiments, and throwaway examples out of committed production paths.
- Use CSS Modules for new component UI unless the project has a stronger local convention.
- Prefer isolated features with clear public boundaries for non-trivial product behavior.

## Memory Policy
- Repository-level agent memory lives in [memory.md](./memory.md).
- Role-specific memory lives in `agents/<role>/memory.md`.
- Memory stores durable decisions, constraints, user preferences, source-of-truth changes, and cross-role conflicts.
- Do not duplicate canonical rules from `AGENTS.md` into memory.
