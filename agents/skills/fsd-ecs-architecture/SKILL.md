---
name: fsd-ecs-architecture
description: >-
  Where every file goes in this project's src/ and how to work in it. The
  codebase is Feature-Sliced Design (FSD) layers + a Unity-style ECS. ECS
  mapping: an ENTITY is a React component that IS a game being
  (features/<slice>/entities/*.tsx); a COMPONENT
  is a React hook you attach to any entity (features/<slice>/components/use*.ts);
  a SYSTEM is pure framework-free logic (features/<slice>/systems/*.ts). MANDATORY
  before adding, moving, or renaming any file under src/ — new entity, hook,
  system, screen, scene, feature, shared util, asset, or route. Enforces: correct
  layer placement, relative imports (no path aliases), deep cross-slice imports
  (barrels only for a feature's public screen), the app/scenes/features/shared
  layering, and DEV-only debug routes for lab/dead code. Trigger on: "where do I
  put", "add a feature", "add an entity / component / system", "new screen",
  "new scene", "new route", "folder structure", "FSD", "ECS", "how is src
  organized", "import from another feature", "where does this hook go".
---

# FSD + ECS architecture — what goes where

`src/` is **Feature-Sliced Design layers** on the outside, **a Unity-style ECS**
inside each feature.

## The ECS mapping (memorize this)

| ECS term | In this repo | Lives in | Example |
| --- | --- | --- | --- |
| **entity** | a React component that **IS** a game being | `features/<slice>/entities/*.tsx` | `PlaceholderCharacter`, `Tany`, `Relic`, `Water` |
| **component** | a React **hook** you attach to any entity | feature-specific → `features/<slice>/components/use*.ts`; **generic/reused → `shared/lib/`** | `useSpin`, `useBob` (in `shared/lib`) |
| **system** | **pure** logic, no React / no three | feature-specific → `features/<slice>/systems/*.ts`; **generic → `shared/lib/`** | `shared/lib/motion.ts` (`spinAngle`, `bobHeight`) |

The Unity analogy: an **entity** is the GameObject, a **component** (hook) is a
MonoBehaviour you bolt on to give it behaviour, a **system** is the pure math the
component calls. Behaviour is **composed by attaching hooks**, never by
inheritance. A component/system starts inside its feature and is **promoted to
`shared/lib` once a second feature needs it** (the spin/bob motion did — the
`character` entity and the `world` Relic both use it):

```
shared/lib/
  motion.ts            # system: spinAngle()/bobHeight() — pure, unit-tested (motion.test.ts)
  useSpin.ts           # component: spins any Object3D ref via useFrame
  useBob.ts            # component: bobs any Object3D ref via useFrame

features/character/
  entities/PlaceholderCharacter.tsx   # entity: capsule being; attaches useSpin + useBob
  entities/Tany.tsx                   # entity: real Tripo GLB character (useGLTF)
  ui/CharacterDebugScreen.tsx         # screen for the /character-debug route

features/world/
  entities/Relic.tsx                  # entity: spinning prism; composes the SAME shared hooks
```

A **component (hook)** takes a ref + options and drives it every frame; it is
entity-agnostic — attach `useSpin(ref)` to a character, a prop, or a pickup:

```ts
export function useSpin(ref: RefObject<Object3D | null>, options?: SpinOptions) {
  useFrame((state) => {
    if (!ref.current) return
    ref.current.rotation.y = spinAngle(state.clock.elapsedTime, options) // system does the math
  })
}
```

## The FSD layers (outer structure)

```
src/
  main.tsx            # entry: gesture blockers + <BootstrapGate><App/></BootstrapGate>
  App.tsx             # renders <AppRouter/> — nothing else
  app/
    router/AppRouter.tsx   # routes; "/" = main scene, DEV-only lazy routes for debug screens
  scenes/
    <scene-name>/     # a mounted world: <Canvas>, post-processing, the scene GRAPH.
                      # Deep-imports entities from features. This is the composition root.
  features/
    <slice>/          # a vertical slice of the game. Holds entities/ components/ systems/
                      # ui/ materials/ assets/ + optional index.ts (public API = its screen)
  shared/
    config/           # app-wide constants (appVersion.ts)
    lib/              # cross-feature primitives (ShadowGroup, ShadowThrottle, shadowLayers)
    vendor/           # third-party code we vendored (realism-effects)
  vite-env.d.ts       # ambient types; stays at src root
```

**Dependency direction (never violate):** `app → scenes → features → shared`.
A feature must not import a scene or the router. `shared/` imports nothing above
it. Scenes may deep-import feature entities/systems (they are the composition
root); features do not import other features except through a `shared/`-style
public boundary.

## Decision table — "I want to add X"

| You are adding… | Put it in | Notes |
| --- | --- | --- |
| A thing that exists in the world (character, prop, building, water) | `features/<slice>/entities/X.tsx` | A React component. Behaviour comes from attached hooks. |
| Reusable per-frame behaviour (spin, bob, follow, health-drain) | `features/<slice>/components/useX.ts`, or `shared/lib/` if used by 2+ features | A hook taking a ref/target. Keep it entity-agnostic. |
| Pure game/math logic (layout, damage, pathing, RNG-free math) | `features/<slice>/systems/X.ts`, or `shared/lib/` if generic | No React, no three. **This is the layer you unit-test.** |
| A full screen (HUD + canvas mount, a debug lab) | `features/<slice>/ui/XScreen.tsx` | Screens mount scenes; they don't contain the scene graph. |
| The `<Canvas>` + post + scene graph | `scenes/<scene-name>/` | Deep-imports feature entities. One folder per distinct world. |
| three.js Material/Geometry registries | `features/<slice>/materials/` | e.g. `world/materials/materials.ts`. |
| An asset (png/mp3/glb) used by one feature | `features/<slice>/assets/` | Import it relatively from within the feature. |
| A primitive used by ≥2 features | `shared/lib/` | Only promote to shared once a second consumer exists (YAGNI). |
| An app-wide constant | `shared/config/` | e.g. `appVersion.ts`. |
| A new route | `app/router/AppRouter.tsx` | See "Adding a route" below. |

## Import rules

- **Relative imports only** — there are no path aliases (`@/…`).
- **Cross-slice imports are deep and explicit**: a scene imports
  `../../features/world/entities/Blockout`, not from a barrel. This is the
  established convention.
- **Barrels (`index.ts`) are optional and minimal** — only a feature's **public
  screen** goes in one (e.g. `features/world/index.ts` re-exports `GameScreen`,
  consumed by the router). Do not re-export entities/hooks/systems you only use
  inside the feature — `knip` will flag them.

## Adding a new feature (recipe)

1. `features/<slice>/` with the subfolders you actually need
   (`entities/ components/ systems/ ui/`; add `materials/ assets/` if used).
2. Write **systems** first (pure, testable) → then **components** (hooks that
   call systems) → then **entities** (components that attach hooks) → then a
   **ui/ screen** if it needs its own route.
3. Add `characterMotion.test.ts`-style tests for the systems.
4. If a scene needs the entities, deep-import them from the scene.
5. Add `index.ts` exporting only the public screen **if** the router/another
   slice consumes it.

## Adding a scene + route

- Scene: `scenes/<name>/<Name>Scene.tsx` — owns the `<Canvas>`, lights, post, and
  the scene graph; deep-imports entities from features.
- Screen: `features/<slice>/ui/<Name>Screen.tsx` — mounts the scene, adds HTML
  overlay, and **must call `useReportInitialRenderReady()`** (from
  `../../bootstrap`) so the `BootstrapGate` overlay dismisses on a direct load —
  unless it mounts `GameCanvas`, which already reports readiness.
- Route in `app/router/AppRouter.tsx`: main route `/` is eager; debug/lab routes
  are `import.meta.env.DEV`-gated and `lazy()`-loaded so they tree-shake out of
  production. Pattern:

```tsx
const CharacterDebugScreen = ENABLE_DEBUG_ROUTES
  ? lazy(async () => ({ default: (await import('../../features/character/ui/CharacterDebugScreen')).CharacterDebugScreen }))
  : null
```

## Dead code & debug routes

Do not delete unused/WIP render code (see memory `never-delete-without-permission`).
Give it a home instead: preserve passes/entities in place unwired, and turn
salvageable screens into **DEV-only routes** (the old pipeline demo lives at
`/pipeline-demo`, the character lab at `/character-debug`). This keeps `knip`
honest without losing work.

## Verify

Never trust a typecheck alone (AGENTS.md #1). After structural changes run
`npm run test` + `npm run knip`, then load the affected routes in a **headed**
browser (`headless: false`) and look at the frame. `npm run build` /
`npm run lint` may be pre-existing red from untracked render WIP — confirm any
error is not yours (unchanged file body ⇒ pre-existing) before acting on it.
