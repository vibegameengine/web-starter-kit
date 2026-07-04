# Source-layout conventions

These are the structural rules the origin project converged on. The kit ships a
minimal `src/` that already follows them; adopt as much or as little as you
like.

## Layers

```
src/
  main.tsx            # entry: mount BootstrapGate + App, one place only
  App.tsx             # route/screen composition root
  index.css           # global reset + design tokens (CSS variables)
  config/             # cross-cutting constants (e.g. injected app version)
  bootstrap/          # the readiness-gate feature (systems + ui)
  features/<name>/    # isolated features; import only via the feature's index.ts
  shared/             # framework-free helpers reused across features
```

Rule of thumb: **dependencies point inward.** UI renders state and emits intent;
business rules live in `systems/` and are testable without React.

## Feature-internal structure

A non-trivial feature is organized by responsibility, not by file type dumped in
one folder:

- `ui/*Screen.tsx` / `*Page.tsx` — the only place screen composition happens.
- `components/*` — React hooks and attachable logic **only** (no pure logic).
- `systems/*` — pure functions, rules, and computations with **no JSX and no
  React state**. This is where anything worth unit-testing lives.
- `entities/*` / `scene/*` — for canvas/WebGL apps, the runtime objects
  (an ECS-style split: `entity → components(hooks) → systems`).
- `localization/*`, `config/*`, `assets/*` — colocated with the feature.
- `index.ts` — the feature's public surface. Other code imports the feature
  through this file, not its internals.

The `bootstrap/` feature in this kit is a concrete example of the
`systems/` + `ui/` split.

## Hard rules worth keeping

- **No barrel/aggregator files inside a feature's runtime** that re-export a mix
  of `entities`, `components`, and `systems`. Import each module from its real
  layer so dependency boundaries stay visible. (A single public `index.ts` per
  feature is fine — that's the boundary, not an internal shortcut.)
- **No production import from a root `assets/` staging folder.** An asset used at
  runtime lives next to where it's used (colocated `assets/`), or next to the
  shared primitive that owns it.
- **CSS Modules by default** for component styles; no new global class-name
  stylesheets for feature UI.
- **Clean-code discipline:** single responsibility per unit, intention-revealing
  names, guard clauses over deep nesting, no silent `catch`, delete dead code
  rather than commenting it out.
- **Run `npm run knip`** as part of cleanup to find dead files and exports —
  don't guess.

## Testing posture

Pure logic in `systems/` and `scripts/` carries unit tests and is held to the
coverage threshold. Framework glue (screens, the entry, providers) is verified
by the production build and a Playwright smoke test rather than by chasing
coverage on hard-to-unit-test wiring. See the `test.coverage` block in
[`vite.config.ts`](../vite.config.ts).
