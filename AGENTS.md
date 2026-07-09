# Agent Entry Point

## ⛔ ABSOLUTE RULES (read first, no exceptions)

1. **NEVER run the app in headless mode.** No headless browsers, no headless
   Playwright/Puppeteer screenshots, no software-GL (swiftshader) rendering — for
   ANY reason, ever. Headless results are misleading (especially for WebGL/WebGPU
   graphics) and must never be used to judge or claim that anything works.
   - To verify visually, run a normal dev server (`npm run dev`) and let the
     **user** look at it in their real browser on their real GPU. Do not open or
     capture the browser yourself in headless.
   - Compilation checks (`tsc`, `npm run build`) and reading source are allowed —
     they are not "running the app".
   - Never tell the user something "works" based on headless output, typecheck,
     or build alone. Say "compiles/builds — please verify in your browser".

2. **NEVER delete files, remove code wholesale, or `npm uninstall` without the
   user's explicit permission.** Preserve work (keep in place or save to a
   branch) and ask first. See memory `never-delete-without-permission`.

## Roles

All agent roles and workflow rules live in [agents/AGENTS.md](./agents/AGENTS.md).

Start there, then open the selected role under `agents/<role>/AGENTS.md`.
