/*
 * `npm run dev:lean` — the dev server trimmed for a remote link.
 *
 * A launcher rather than `VITE_DEV_LEAN=true vite` in package.json, because npm
 * runs scripts through cmd.exe on Windows and the inline-env form is a syntax
 * error there. Everything this file does is set one variable and hand the rest
 * of the command line to Vite; the behaviour lives in `vite.config.ts`.
 *
 * HMR is untouched: an edit is still the one changed module, still no reload.
 * `--bundle` (or `VITE_DEV_BUNDLE=true`) additionally serves the client as one
 * bundle — a much faster first paint, and NO HMR at all, since every edit then
 * re-bundles the app and reloads the page. Read the note in `vite.config.ts`
 * before reaching for it.
 */
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const bundleIndex = args.indexOf('--bundle')
if (bundleIndex !== -1) args.splice(bundleIndex, 1)

const child = spawn('npx', ['vite', ...args], {
  env: {
    ...process.env,
    VITE_DEV_LEAN: 'true',
    ...(bundleIndex === -1 ? {} : { VITE_DEV_BUNDLE: 'true' }),
  },
  shell: true,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
