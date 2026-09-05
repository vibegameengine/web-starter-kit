#!/usr/bin/env node
/**
 * Refuses the git commands that can destroy work nobody has committed.
 *
 * Written after `git checkout -- <file>` was run on a shared working tree to
 * undo one change. It did undo it. It also threw away every other uncommitted
 * edit in that file, and the agent that ran it could not say whose those were -
 * several sessions work in a tree like this at once. There is no undo: git keeps
 * no record of a working-tree file it overwrote.
 *
 * The rule this enforces: reverting is done by writing the reverse change, or
 * by putting the current state somewhere safe first. Never by asking git to
 * discard whatever happens to be there.
 *
 * The first version matched the subcommand with one flat regex per name. An
 * adversarial pass found it both too loose and too tight, and the two failures
 * feed each other: `git switch main`, `git -C other checkout main`,
 * `X=$(git checkout main)` and `git worktree remove --force` walked straight
 * through, while `git checkout -b feature/x` - which creates a branch, destroys
 * nothing, and which rule 0 of AGENTS.md requires - was refused, along with
 * `git stash list` and `git reset --soft`. A guard that blocks the safe form of
 * an operation teaches the reader to route around it, and the route around it
 * passes the dangerous form too.
 *
 * So this one tokenizes rather than pattern-matching a line, and judges the
 * subcommand together with the flags that decide whether it touches the working
 * tree.
 *
 * Reads a PreToolUse payload on stdin and answers with a permission decision.
 */
const CHUNKS = []
for await (const chunk of process.stdin) CHUNKS.push(chunk)

let payload
try {
  payload = JSON.parse(Buffer.concat(CHUNKS).toString('utf8') || '{}')
} catch {
  process.exit(0)
}

const raw = payload?.tool_input?.command
if (typeof raw !== 'string') process.exit(0)

/*
 * Heredoc bodies are text, not commands.
 *
 * The first version of this refused its OWN commit: the message explained what
 * the forbidden commands do, the words sat inside the heredoc, and the guard
 * saw them in the command string. It then refused the edit that would have
 * fixed it, for the same reason. A guard nobody can write about is a guard
 * nobody can document, and the way round it is not to weaken the match.
 *
 * Bodies are replaced before matching; the `git commit -F -` that opens them is
 * left alone, so a real invocation after a heredoc is still caught.
 */
const command = raw.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\2\s*$/gm, ' <<HEREDOC ')

/*
 * A substitution is a command in its own right, which is why `$(` and a
 * backtick end an argument list here exactly as `;` and `&&` do. The first
 * version's `(^|[;&|]|\s)` prefix let `X=$(git checkout main)` through, because
 * `$(` is neither a separator character nor whitespace.
 */
const SEPARATOR = /[;&|(){}`\n]|\$\(/
const tokens = command.split(/\s+/).filter(Boolean)

/** A git invocation, whatever path or wrapper it arrives under. */
const isGit = (token) => /(^|[/\\])git(\.exe)?$/i.test(token.replace(/^.*[$`(=;&|]/, ''))

/** Global options that consume the token after them. */
const GLOBAL_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--exec-path', '--namespace'])

const invocations = []
for (let index = 0; index < tokens.length; index += 1) {
  if (!isGit(tokens[index])) continue
  let cursor = index + 1
  while (cursor < tokens.length && tokens[cursor].startsWith('-')) {
    const flag = tokens[cursor]
    cursor += 1
    if (GLOBAL_WITH_VALUE.has(flag) && cursor < tokens.length) cursor += 1
  }
  if (cursor >= tokens.length) continue
  const args = []
  for (let scan = cursor + 1; scan < tokens.length; scan += 1) {
    if (SEPARATOR.test(tokens[scan]) || isGit(tokens[scan])) break
    args.push(tokens[scan])
  }
  invocations.push({ args, subcommand: tokens[cursor] })
}

const has = (args, ...flags) => args.some((arg) => flags.includes(arg))

/**
 * What each subcommand is judged on. Absent from this table means allowed: only
 * the operations that can silently overwrite the working tree are listed, and
 * each one is let through in the form that cannot.
 */
const VERDICTS = {
  checkout: (args) =>
    has(args, '-b', '-B', '--orphan')
      ? null
      : 'git checkout overwrites working-tree files from the index or a commit',
  clean: () => 'git clean deletes untracked files, and nothing records what they were',
  reset: (args) =>
    has(args, '--hard', '--merge', '--keep')
      ? 'git reset --hard/--merge/--keep rewrites the working tree'
      : null,
  restore: () => 'git restore overwrites working-tree files from the index or a commit',
  stash: (args) =>
    args.length > 0 && ['list', 'show'].includes(args[0])
      ? null
      : 'git stash moves uncommitted work out of the tree, including work that is not yours',
  switch: (args) =>
    has(args, '-f', '--force', '--discard-changes')
      ? 'git switch --force/--discard-changes throws away working-tree changes'
      : null,
  worktree: (args) =>
    args[0] === 'remove'
      ? 'git worktree remove deletes a checkout whole, uncommitted work included'
      : null,
}

let hit = null
for (const invocation of invocations) {
  const judge = VERDICTS[invocation.subcommand]
  if (!judge) continue
  const verdict = judge(invocation.args)
  if (verdict) {
    hit = { name: `git ${invocation.subcommand}`, why: verdict }
    break
  }
}

if (!hit) process.exit(0)

const reason = [
  `BLOCKED: ${hit.name} is not available here.`,
  '',
  `${hit.why}. Whatever it removes cannot be recovered, and you cannot see`,
  'beforehand what you are removing - in a tree several sessions edit at once,',
  'some of it will not be yours.',
  '',
  'To undo a change you made: write the reverse edit yourself, with Edit or a',
  'script, so only your own lines move.',
  'To park work you want back later: copy the files somewhere, or commit them to',
  'a branch. `git checkout -b`, `git switch -c`, `git stash list` and',
  '`git reset --soft` are all still available. Never hand the decision to git.',
  '',
  `Refused command: ${raw.trim().slice(0, 200)}`,
].join('\n')

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
}))
