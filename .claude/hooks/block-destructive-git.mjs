#!/usr/bin/env node
/**
 * Refuses any git command that can destroy work nobody has committed.
 *
 * Written after `git checkout -- <file>` was run on a shared working tree to
 * undo one change. It did undo it. It also threw away every other uncommitted
 * edit in that file, and the agent that ran it could not say whose those were -
 * several sessions work in this repository at once. There is no undo: git keeps
 * no record of a working-tree file it overwrote.
 *
 * The rule this enforces: reverting is done by writing the reverse change, or
 * by putting the current state somewhere safe first. Never by asking git to
 * discard whatever happens to be there.
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
 * Matched on the git SUBCOMMAND, so `grep checkout`, a branch called
 * `reset-feel` or a commit message mentioning the word all pass through. Only
 * an actual invocation is stopped.
 */
const FORBIDDEN = [
  { name: 'git checkout', pattern: /(^|[;&|]|\s)git(\s+-[^\s]+|\s+-c\s+[^\s]+)*\s+checkout(\s|$)/ },
  { name: 'git restore', pattern: /(^|[;&|]|\s)git(\s+-[^\s]+|\s+-c\s+[^\s]+)*\s+restore(\s|$)/ },
  { name: 'git reset', pattern: /(^|[;&|]|\s)git(\s+-[^\s]+|\s+-c\s+[^\s]+)*\s+reset(\s|$)/ },
  { name: 'git clean', pattern: /(^|[;&|]|\s)git(\s+-[^\s]+|\s+-c\s+[^\s]+)*\s+clean(\s|$)/ },
  { name: 'git stash', pattern: /(^|[;&|]|\s)git(\s+-[^\s]+|\s+-c\s+[^\s]+)*\s+stash(\s|$)/ },
]

const hit = FORBIDDEN.find((entry) => entry.pattern.test(command))
if (!hit) process.exit(0)

const reason = [
  `BLOCKED: ${hit.name} is not available in this repository.`,
  '',
  'It discards uncommitted work in the working tree, and this tree is shared -',
  'other sessions are editing it right now. Whatever it removes cannot be',
  'recovered, and you cannot see beforehand what you are removing.',
  '',
  'To undo a change you made: write the reverse edit yourself, with Edit or a',
  'script, so only your own lines move.',
  'To park work you want back later: copy the files somewhere, or commit them',
  'to a branch. Never hand the decision to git.',
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
