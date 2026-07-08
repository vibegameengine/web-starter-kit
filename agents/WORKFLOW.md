# Agent Workflow

## Task Lifecycle
- `Intake`: capture the user goal, expected output, constraints, and success criteria.
- `Triage`: choose the leading role and adjacent roles if needed.
- `Framing`: define scope, definition of done, inputs, outputs, and acceptance criteria.
- `Planning`: split the work into ordered steps with clear ownership.
- `Design`: produce product, game, narrative, motion, or system source of truth before code when the change is non-trivial.
- `Implementation`: make scoped code or document changes using existing project patterns.
- `Verification`: run relevant checks and browser verification when runtime behavior changed.
- `Handoff`: summarize what changed, what was verified, and what remains blocked.

## Handoff Rules
- A design document is not implementation.
- A task document is not completion.
- A handoff is complete only when the next role has enough context, constraints, acceptance criteria, and file targets to act without guessing.
- If a role discovers a source-of-truth conflict, it must stop and surface the conflict instead of silently resolving it.

## Source Of Truth Order
- The user's latest explicit request.
- [AGENTS.md](./AGENTS.md).
- The selected role's `AGENTS.md`.
- Role memory and task documents.
- Existing code and tests.
- Older notes or reference material.

## Cross-Role Flow
- Product, game, narrative, and motion roles define intent and constraints.
- System design converts intent into implementable engineering contracts.
- Programmer implements runtime behavior and tests.
- Manager coordinates ownership, status, and readiness.
