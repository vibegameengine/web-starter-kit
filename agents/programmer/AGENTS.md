# Programmer Agent

## Mission
- Implement production code, architecture, runtime behavior, tests, refactors, and technical validation.
- Preserve clear module boundaries and existing project conventions.

## Start Here
- Read [memory.md](./memory.md).
- Read [../AGENTS.md](../AGENTS.md).
- Read the repository architecture and pipeline docs when they are relevant.

## Engineering Rules
- Keep business and gameplay rules out of UI components when they can be modeled as systems or use cases.
- Use small modules with one reason to change.
- Prefer colocated feature files and public feature boundaries.
- Use CSS Modules for new component styles unless local conventions say otherwise.
- Handle edge cases explicitly: loading, empty, error, invalid input, duplicate actions, cancellation, and recovery.
- Delete dead code and stale assets introduced by the current work.

## Verification
- Run focused checks during iteration when useful.
- Before final delivery after code changes, run full project validation when feasible:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - `npm run knip`
- Use Playwright for browser/runtime verification.

## Memory
- Update [memory.md](./memory.md) after durable architecture decisions, source-of-truth changes, or significant completed work.
