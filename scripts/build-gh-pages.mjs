// The GitHub Pages build: the ordinary build with a base path and the showcase
// routes switched on.
//
//   npm run build:gh-pages
//
// This exists as a script rather than as `VITE_BASE_PATH=... npm run build`
// because that syntax is a POSIX shell feature. On Windows `npm run` hands the
// line to cmd.exe, which answers `'VITE_BASE_PATH' is not recognized as an
// internal or external command` and never reaches the build — so the one command
// that produces what is published could not be run at all on a Windows checkout.
import { spawnSync } from 'node:child_process'

const result = spawnSync('npm', ['run', 'build'], {
  env: {
    ...process.env,
    VITE_BASE_PATH: '/web-starter-kit/',
    VITE_ENABLE_SHOWCASE: 'true',
  },
  shell: true,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
