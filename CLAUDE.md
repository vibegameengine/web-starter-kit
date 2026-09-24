# CLAUDE.md

The project rules are in [AGENTS.md](./AGENTS.md). Read them first.

## Comments are banned

Do not write comments in code. None: no line comments, no block comments, no docstrings,
no JSDoc, no `@important` markers, in any language.

- Say it in a name: extract a function or a constant whose name says what the comment would.
- Anything worth keeping that a name cannot carry — a measurement, a source, a dead end, a
  launch command — goes into `docs/`, never beside the code.
- Toolchain directives the build needs (`// @ts-expect-error`, `/// <reference>`,
  `eslint-disable`) are not comments and stay.

This rule overrides the "keep it" fate of rule 6a in AGENTS.md: the measurement still gets
written down, but in `docs/`.
