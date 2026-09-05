/**
 * Proves the guard refuses the real thing and allows text that merely names it.
 *
 * It lives in a file rather than in a `node -e` one-liner for the same reason
 * the heredoc rule exists: the guard reads the command it is asked about, and a
 * test that spells the forbidden commands on a shell line is itself refused.
 *
 * Written as a vitest suite because vitest collects it by its name whether or
 * not it wants to be collected. As a bare script it printed eleven passing cases
 * and then failed the run with "No test suite found" - a red suite whose own
 * output says everything behaved as intended, which teaches the reader to ignore
 * a red suite. That is a worse outcome than having no test at all.
 */
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const FORBIDDEN = 'git ' + 'checkout'
const RESET = 'git ' + 'reset'

const ask = (command) => {
  const result = spawnSync(process.execPath, ['.claude/hooks/block-destructive-git.mjs'], {
    encoding: 'utf8',
    input: JSON.stringify({ tool_input: { command } }),
  })
  return (result.stdout ?? '').includes('"permissionDecision":"deny"')
}

const heredoc = [`git commit -F - <<'EOF'`, `a message explaining what ${FORBIDDEN} does`, 'EOF'].join('\n')

const cases = [
  { expect: true, name: 'the command itself', command: `${FORBIDDEN} -- src/x.ts` },
  { expect: true, name: 'hard reset', command: `${RESET} --hard` },
  { expect: true, name: 'clean', command: 'git clean -fd' },
  { expect: true, name: 'restore', command: 'git restore .' },
  { expect: true, name: 'stash', command: 'git stash push' },
  { expect: true, name: 'after a chained command', command: `npm test && ${RESET} --hard` },
  { expect: true, name: 'a real one following a heredoc', command: `${heredoc}\n${RESET} --hard` },
  { expect: false, name: 'a commit message that names it', command: heredoc },
  { expect: false, name: 'ordinary commit', command: 'git commit -m "x"' },
  { expect: false, name: 'staging', command: 'git add .' },
  { expect: false, name: 'the word in a grep', command: 'grep -n checkout file.ts' },
]

describe('the destructive-git guard', () => {
  for (const testCase of cases) {
    it(`${testCase.expect ? 'refuses' : 'allows'} ${testCase.name}`, () => {
      expect(ask(testCase.command)).toBe(testCase.expect)
    })
  }
})
