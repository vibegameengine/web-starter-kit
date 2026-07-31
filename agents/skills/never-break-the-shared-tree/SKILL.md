---
name: never-break-the-shared-tree
description: >-
  The working tree is shared with the user and with other agents, and it must
  build and run at every moment — never "until the next edit". MANDATORY before
  deleting, renaming, moving, extracting or splitting ANY file, and before
  removing an export, a prop, a route entry, a CSS class, a config key, or a
  dependency. Enforces the order of operations that keeps a removal atomic: find
  the references FIRST, repoint or remove them in the SAME change, delete LAST,
  then prove the tree still compiles and the affected surface still renders.
  Trigger on- "delete this file", "remove that component", "rename", "move to",
  "extract into", "clean up dead code", "start over", "redo it from scratch",
  "uninstall", "drop that export", "it doesn't compile", "module not found",
  "failed to resolve import", "the app is white/blank", "I got an error after
  your change", or any refactor that removes something other code can reach.
---

# Never leave the shared tree broken

The repository is not a private scratchpad. The user runs the app from the same
checkout you are editing, and so do other agents. Between your delete and your
follow-up fix there is a window where the app does not start — and someone else
is inside that window, debugging a failure you created.

A broken tree is not "a step in the middle of a refactor". It is an outage.

## Non-negotiable rules

1. **A removal is not done until nothing references the removed thing.** File,
   export, prop, route entry, style class, asset, dependency — same rule.
2. **Find the references before you delete, not after.** Search the whole source
   tree for the symbol AND for the path. Both, every time; one of them always
   catches what the other misses.
3. **Removal and its call sites travel in one change.** Never "delete now, clean
   the imports next". There is no next — there is only the window in which
   everything is broken.
4. **Build the replacement before you remove the original.** New code in, callers
   switched over, old code out. Never the reverse order.
5. **Prove it after every structural change**: run the project's typecheck, then
   load the affected surface in a headed window and look at it. A change that
   compiles but renders a blank screen is still an outage.
6. **If you find the tree broken — by your change or anyone's — stop and repair
   it first.** Do not layer new work on a failing build, and do not "finish the
   thought" before fixing.
7. **Starting over does not suspend any of this.** "Delete it all and redo it
   properly" means the redo lands atomically, not that the project may sit dead
   in between.

## The order of operations

When something must go away:

```text
1. INVENTORY   list every reference: importers, re-exports, barrels, routes,
               tests, docs, generated manifests, config
2. REPLACE     if a replacement exists, add it and make it work first
3. REPOINT     move every reference found in step 1 onto the replacement,
               or delete the reference where nothing replaces it
4. REMOVE      only now delete the original
5. PROVE       typecheck; then open the affected surface headed and look
```

Steps 3 and 4 are one edit sequence with no verification gap between them, and
step 5 happens before you start anything else.

## Finding every reference

Symbol search alone is not enough, and neither is path search:

- **By symbol** — the exported name, the component name, the type name. Catches
  importers that renamed the path but not the identifier.
- **By path fragment** — the directory name and the file stem. Catches
  `import styles from './X.module.css'`, asset imports, dynamic `import()`,
  lazy route registrations, and string paths a symbol search never sees.
- **Beyond source** — barrels and index files, route tables, test files, DEV/lab
  registries, docs and design notes, build config, and any generated manifest
  that walks the import graph.

A directory deletion needs the same sweep for EVERY file inside it, not just the
one you were thinking about — a stylesheet, an asset, and a co-located preview
each have their own importers.

## Verification that actually proves it

- A typecheck is the floor, not the ceiling. Run it, and read the output rather
  than assuming silence.
- Then load the affected route/screen in a **headed** window and look at the
  frame. Blank pages, unresolved-import overlays and missing assets do not show
  up in a typecheck.
- Check the surfaces that *reached* the deleted thing, not only the one you were
  editing. If three screens imported it, look at all three.
- If a dev server is running, confirm it recovered. A hot-reload error overlay
  that only clears on a hard reload is still broken for whoever is watching it.

## Anti-patterns

- "I'll delete these now and rewrite the screen in the next step."
- "The imports will be fixed by the end of the task anyway."
- "It's only broken for a minute."
- Deleting a directory because a component in it is being replaced, without
  checking who imports the stylesheet, the asset, or the preview beside it.
- Removing an export from a barrel and leaving consumers to fail at build time.
- Treating "the typecheck passes" as proof the screen still renders.
- Reporting a refactor as complete while an unresolved import is on screen.

## Checklist

- [ ] Every reference to the removed thing was searched by symbol AND by path.
- [ ] Barrels, routes, tests, labs, docs and manifests were included in the sweep.
- [ ] The replacement was in place and working before the original was removed.
- [ ] Removal and repointing landed together, with no gap in between.
- [ ] The project's typecheck was run after the structural change and read.
- [ ] Every surface that reached the removed thing was opened headed and looked at.
- [ ] The tree builds and runs right now, at this moment, for anyone else in it.
