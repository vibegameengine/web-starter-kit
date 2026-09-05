/**
 * Proves the guard refuses the real thing, allows text that merely names it, and
 * - the half that was missing - allows the safe form of every operation it
 * refuses.
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
 *
 * The first eleven cases only ever asked the guard to do what it was written to
 * do, so they passed against a version that missed `git switch`, `git -C other
 * checkout`, a command substitution and `git worktree remove`, and that refused
 * `git checkout -b`, `git stash list` and `git reset --soft`. A bench that only
 * tries the cases its subject was designed for cannot fail. The bypasses and the
 * false positives below are the cases that can.
 */
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const CHECKOUT = 'git ' + 'checkout'
const RESET = 'git ' + 'reset'
const SWITCH = 'git ' + 'switch'
const STASH = 'git ' + 'stash'

const ask = (command) => {
  const result = spawnSync(process.execPath, ['.claude/hooks/block-destructive-git.mjs'], {
    encoding: 'utf8',
    input: JSON.stringify({ tool_input: { command } }),
  })
  return (result.stdout ?? '').includes('"permissionDecision":"deny"')
}

const heredoc = [`git commit -F - <<'EOF'`, `a message explaining what ${CHECKOUT} does`, 'EOF'].join('\n')

const cases = [
  { expect: true, name: 'the command itself', command: `${CHECKOUT} -- src/x.ts` },
  { expect: true, name: 'hard reset', command: `${RESET} --hard` },
  { expect: true, name: 'clean', command: 'git clean -fd' },
  { expect: true, name: 'restore', command: 'git restore .' },
  { expect: true, name: 'stash', command: `${STASH} push` },
  { expect: true, name: 'bare stash', command: STASH },
  { expect: true, name: 'after a chained command', command: `npm test && ${RESET} --hard` },
  { expect: true, name: 'a real one following a heredoc', command: `${heredoc}\n${RESET} --hard` },

  // The forms that walked through the first version.
  { expect: true, name: 'the same discard under another repository', command: `git -C ../other ${CHECKOUT.slice(4)} -- src/x.ts` },
  { expect: true, name: 'a discard inside a command substitution', command: `OUT=$(${CHECKOUT} -- src/x.ts)` },
  { expect: true, name: 'a discard by absolute path to git', command: `/usr/bin/${CHECKOUT} -- src/x.ts` },
  { expect: true, name: 'switch throwing changes away', command: `${SWITCH} --discard-changes main` },
  { expect: true, name: 'removing a worktree whole', command: 'git worktree remove --force ../wt' },
  { expect: true, name: 'a discard after a safe git command', command: `git status && ${CHECKOUT} -- .` },

  // The safe forms. Refusing these is what teaches an agent to route around the
  // guard, and the route around it carries the dangerous forms too.
  { expect: false, name: 'creating a branch', command: `${CHECKOUT} -b feature/x` },
  { expect: false, name: 'creating a branch the modern way', command: `${SWITCH} -c feature/x` },
  { expect: false, name: 'moving to an existing branch', command: `${SWITCH} main` },
  { expect: false, name: 'listing stashes', command: `${STASH} list` },
  { expect: false, name: 'showing a stash', command: `${STASH} show` },
  { expect: false, name: 'undoing a commit but keeping the tree', command: `${RESET} --soft HEAD~1` },
  { expect: false, name: 'unstaging', command: `${RESET} HEAD -- src/x.ts` },
  { expect: false, name: 'listing worktrees', command: 'git worktree list' },

  { expect: false, name: 'a commit message that names it', command: heredoc },
  { expect: false, name: 'ordinary commit', command: 'git commit -m "x"' },
  { expect: false, name: 'staging', command: 'git add .' },
  { expect: false, name: 'the word in a grep', command: 'grep -n checkout file.ts' },
  { expect: false, name: 'a branch whose name contains one', command: `${SWITCH} -c reset-feel` },
]

describe('the destructive-git guard', () => {
  for (const testCase of cases) {
    it(`${testCase.expect ? 'refuses' : 'allows'} ${testCase.name}`, () => {
      expect(ask(testCase.command)).toBe(testCase.expect)
    })
  }
})
