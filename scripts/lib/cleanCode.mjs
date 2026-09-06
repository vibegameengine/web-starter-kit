// The clean-code measurement, in one place.
//
// Two callers need identical numbers: the guard hook that judges one file after
// it is written, and the baseline script that records the whole repository. If
// they measured separately they would drift, and a drifting baseline blocks
// edits that changed nothing.
//
// Thresholds and their justification: agents/skills/clean-code.

export const LIMITS = {
  commentBlock: 8,
  commentShare: 0.3,
  fileLines: 500,
  functionLines: 40,
  functionLinesHard: 80,
  nesting: 4,
  parameters: 4,
}

const isFunctionLike = (ts, node) =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessor(node) ||
  ts.isSetAccessor(node)

/**
 * Control flow only, and each construct counted once.
 *
 * `else if` is an `IfStatement` in the else branch of another, so a flat chain of
 * five would read as five levels deep — measured, and it is why the else branch
 * does not add one. A `CatchClause` sits inside its own `TryStatement` for the
 * same reason.
 */
const nestingDelta = (ts, node) => {
  if (ts.isCatchClause(node)) return 0
  if (ts.isIfStatement(node) && node.parent && ts.isIfStatement(node.parent) && node.parent.elseStatement === node) return 0
  const counts =
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node)
  return counts ? 1 : 0
}

function nameOf(ts, source, node) {
  if (node.name) return node.name.getText(source)
  const parent = node.parent
  const named = parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent))
  return named && parent.name ? parent.name.getText(source) : '(anonymous)'
}

/**
 * Comment lines from the SCANNER, not from what a line starts with.
 *
 * A prefix test calls every `// two` inside a template literal or a JSX text node
 * a comment. This repository has GLSL in template literals, so that mattered:
 * shader lines were counted as prose, function length came out short and the
 * comment share came out high.
 */
function commentLines(ts, text, lineOf) {
  const flagged = new Set()
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, text)
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      const from = lineOf(scanner.getTokenStart())
      const to = lineOf(scanner.getTokenEnd())
      for (let line = from; line <= to; line += 1) flagged.add(line)
    }
    token = scanner.scan()
  }
  return flagged
}

/** Lines a function spends inside JSX: markup is not logic to read. */
function jsxLineSet(ts, source, node, lineOf) {
  const covered = new Set()
  const scan = (child) => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      const from = lineOf(child.getStart(source))
      const to = lineOf(child.getEnd())
      for (let line = from + 1; line <= to; line += 1) covered.add(line)
      return
    }
    ts.forEachChild(child, scan)
  }
  ts.forEachChild(node, scan)
  return covered
}

function longestCommentRun(flagged, totalLines) {
  let longest = 0
  let at = 0
  let run = 0
  let start = 0
  for (let line = 1; line <= totalLines; line += 1) {
    if (!flagged.has(line)) {
      run = 0
      continue
    }
    if (run === 0) start = line
    run += 1
    if (run > longest) {
      longest = run
      at = start
    }
  }
  return { at, longest }
}

function collectFunctions(ts, source, lineOf, flagged, rawLines) {
  const functions = []

  /** Lines in the range that are code: not comment, not markup, not blank. */
  const codeLines = (from, to, jsx) => {
    let count = 0
    for (let line = from; line <= to; line += 1) {
      if (flagged.has(line) || jsx.has(line)) continue
      if ((rawLines[line - 1] ?? '').trim() === '') continue
      count += 1
    }
    return count
  }

  const walkBody = (node, depth, owner) => {
    if (isFunctionLike(ts, node) && node.body) {
      visit(node, 0)
      return
    }
    const depthHere = depth + nestingDelta(ts, node)
    owner.nesting = Math.max(owner.nesting, depthHere)
    ts.forEachChild(node, (child) => walkBody(child, depthHere, owner))
  }

  function visit(node, depth) {
    if (isFunctionLike(ts, node) && node.body) {
      const start = lineOf(node.getStart(source))
      const end = lineOf(node.getEnd())
      const record = {
        line: start,
        lines: codeLines(start, end, jsxLineSet(ts, source, node, lineOf)),
        name: nameOf(ts, source, node),
        nesting: 0,
        parameters: node.parameters.length,
      }
      functions.push(record)
      ts.forEachChild(node, (child) => walkBody(child, 0, record))
      return
    }
    const depthHere = depth + nestingDelta(ts, node)
    ts.forEachChild(node, (child) => visit(child, depthHere))
  }

  ts.forEachChild(source, (node) => visit(node, 0))
  return functions
}

/** Everything the thresholds are expressed in, for one file. */
export function measureFile(ts, path, text) {
  const lines = text.split(/\r?\n/)
  const kind = /\.tsx$/i.test(path) ? ts.ScriptKind.TSX : /\.[cm]?ts$/i.test(path) ? ts.ScriptKind.TS : ts.ScriptKind.JS
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  const lineOf = (position) => source.getLineAndCharacterOfPosition(position).line + 1

  const flagged = commentLines(ts, text, lineOf)
  const blank = lines.filter((line) => line.trim() === '').length
  const commentCount = flagged.size
  const codeCount = Math.max(0, lines.length - blank - commentCount)
  const run = longestCommentRun(flagged, lines.length)
  const functions = collectFunctions(ts, source, lineOf, flagged, lines)

  return {
    commentLines: commentCount,
    commentRun: run.longest,
    commentRunAt: run.at,
    commentShare: codeCount + commentCount === 0 ? 0 : commentCount / (codeCount + commentCount),
    fileLines: lines.length,
    functions,
    functionsOverLimit: functions.filter((fn) => fn.lines > LIMITS.functionLinesHard).length,
    worstFunction: functions.reduce((most, fn) => Math.max(most, fn.lines), 0),
  }
}

/** What a baseline remembers about a file: the numbers a ratchet compares. */
export function baselineOf(measurement) {
  return {
    commentShare: Math.round(measurement.commentShare * 100) / 100,
    fileLines: measurement.fileLines,
    functionsOverLimit: measurement.functionsOverLimit,
    worstFunction: measurement.worstFunction,
  }
}

/**
 * Blockers are regressions against the baseline, never the state it recorded: a
 * gate the repository already fails is a gate everyone learns to switch off.
 *
 * The COUNT of oversized functions is compared as well as the worst one. With
 * only the worst, a file baselined at one 203-line function could be rewritten
 * into two of 200 and pass — measured, and it is what this check exists for.
 */
export function judge(measurement, baseline) {
  const blockers = []
  const warnings = []
  const allowedFile = Math.max(LIMITS.fileLines, baseline?.fileLines ?? 0)
  const allowedFunction = Math.max(LIMITS.functionLinesHard, baseline?.worstFunction ?? 0)
  const allowedCount = Math.max(0, baseline?.functionsOverLimit ?? 0)
  const allowedShare = Math.max(LIMITS.commentShare, baseline?.commentShare ?? 0)

  if (measurement.fileLines > allowedFile) {
    blockers.push(
      baseline
        ? `the file is ${measurement.fileLines} lines, past its own baseline of ${baseline.fileLines}. It was already over the ${LIMITS.fileLines}-line limit; it may not grow further.`
        : `the file is ${measurement.fileLines} lines against a ${LIMITS.fileLines}-line limit. Split it by responsibility BEFORE the next behaviour change.`,
    )
  }

  if (measurement.functionsOverLimit > allowedCount) {
    blockers.push(
      `${measurement.functionsOverLimit} functions are over ${LIMITS.functionLinesHard} lines, against ${allowedCount} recorded. A new oversized function is a new one to read.`,
    )
  }

  for (const fn of measurement.functions) {
    if (fn.lines > allowedFunction) {
      blockers.push(`${fn.name}() is ${fn.lines} lines of code (limit ${LIMITS.functionLinesHard}, target ${LIMITS.functionLines}) at line ${fn.line}.`)
    } else if (fn.lines > LIMITS.functionLines) {
      warnings.push(`${fn.name}() is ${fn.lines} lines at line ${fn.line}.`)
    }
    if (fn.parameters > LIMITS.parameters) {
      warnings.push(`${fn.name}() takes ${fn.parameters} parameters against a limit of ${LIMITS.parameters}: an options object is asking to exist. Line ${fn.line}.`)
    }
    if (fn.nesting > LIMITS.nesting) {
      warnings.push(`${fn.name}() nests ${fn.nesting} deep against a limit of ${LIMITS.nesting}: that is a function waiting to be named. Line ${fn.line}.`)
    }
  }

  if (measurement.commentRun > LIMITS.commentBlock) {
    warnings.push(`a ${measurement.commentRun}-line comment starts at line ${measurement.commentRunAt}. A paragraph belongs in docs/ or in a name — unless it records a measurement, which stays.`)
  }
  // Rounded on both sides because the baseline stores two decimals, and an
  // unrounded 0.594 against a recorded 0.59 is a file complaining about itself.
  if (Math.round(measurement.commentShare * 100) / 100 > allowedShare && measurement.commentLines > 20) {
    warnings.push(`${Math.round(measurement.commentShare * 100)}% of this file is comment (${measurement.commentLines} lines). Most of it is describing what the code already says.`)
  }

  return { blockers, warnings }
}

/** The files these rules apply to, from git, with no pathspec surprises. */
export function trackedSources(execSync) {
  const listed = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
  return listed.filter(
    (file) =>
      /\.(ts|tsx|mts|cts|mjs)$/i.test(file) &&
      (file.startsWith('src/') || file.startsWith('vite/') || file.startsWith('scripts/') || file.startsWith('.claude/hooks/')) &&
      !file.startsWith('agents/'),
  )
}
