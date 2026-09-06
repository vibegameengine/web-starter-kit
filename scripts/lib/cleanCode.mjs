// The clean-code measurement, in one place: the guard hook that judges one file
// after it is written and the baseline script that records the repository both
// call it, so their numbers cannot drift apart.
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

/** The extensions these rules apply to. The guard and the baseline share them. */
const SOURCE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i

/** Dependencies, build output, and the skills, whose examples are meant to be bad. */
const EXCLUDED = /(^|[\\/])(node_modules|dist|coverage|vendor|agents)([\\/]|$)/i

/**
 * Whether a path is one this measurement applies to.
 *
 * The guard and the baseline MUST agree here. When they did not, the guard
 * measured `vite.config.ts` while the baseline could not record it — so a
 * 92-line function in the kit's own config was hard-blocked on day one with no
 * way to grant it, which is the exact failure the ratchet exists to prevent.
 */
export function isSource(path) {
  return SOURCE_EXTENSIONS.test(path) && !EXCLUDED.test(path)
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

/** Every comment token's span, from the scanner rather than from line prefixes. */
function commentSpans(ts, text) {
  const spans = []
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, text)
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      spans.push([scanner.getTokenStart(), scanner.getTokenEnd()])
    }
    token = scanner.scan()
  }
  return spans
}

/**
 * Lines that are comment: the line's FIRST non-blank character is inside one.
 *
 * Two failures this shape avoids. A prefix test on the raw text calls every
 * `// two` inside a template literal a comment, and this repository has GLSL in
 * template literals — so shader lines counted as prose and function length came
 * out short. And flagging every line a comment token merely touches lets a
 * TRAILING comment erase the code it sits on: measured, a 104-line function fell
 * to 64 and stopped being blocked once 40 `// step n` comments were appended to
 * its lines. A gate against writing comments must not be payable in comments.
 */
function commentLineSet(ts, text) {
  const spans = commentSpans(ts, text)
  const flagged = new Set()
  let span = 0
  let line = 1
  let start = 0

  while (start <= text.length) {
    let end = text.indexOf('\n', start)
    if (end < 0) end = text.length
    const lead = text.slice(start, end).search(/\S/)
    if (lead >= 0) {
      const at = start + lead
      while (span < spans.length && spans[span][1] <= at) span += 1
      if (span < spans.length && at >= spans[span][0]) flagged.add(line)
    }
    start = end + 1
    line += 1
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

function collectFunctions(ts, source, context) {
  const { flagged, lineOf, rawLines } = context
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

  const flagged = commentLineSet(ts, text)
  const blank = lines.filter((line) => line.trim() === '').length
  const commentCount = flagged.size
  const codeCount = Math.max(0, lines.length - blank - commentCount)
  const run = longestCommentRun(flagged, lines.length)
  const functions = collectFunctions(ts, source, { flagged, lineOf, rawLines: lines })

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

/**
 * Whether a file earns an entry: it is past at least one threshold.
 *
 * Comment volume counts here even though it never blocks. A file recorded only
 * for its length used to be the only file whose prose was forgiven, so the three
 * most prose-heavy files in the repository went quiet while two dozen ordinary
 * ones repeated the same warning on every edit forever.
 */
export function isOverLimits(measurement) {
  return (
    measurement.fileLines > LIMITS.fileLines ||
    measurement.worstFunction > LIMITS.functionLinesHard ||
    measurement.commentRun > LIMITS.commentBlock ||
    (measurement.commentShare > LIMITS.commentShare && measurement.commentLines > 20)
  )
}

/** What a baseline remembers about a file: the numbers a ratchet compares. */
export function baselineOf(measurement) {
  return {
    commentRun: measurement.commentRun,
    commentShare: Math.round(measurement.commentShare * 100) / 100,
    fileLines: measurement.fileLines,
    functionsOverLimit: measurement.functionsOverLimit,
    worstFunction: measurement.worstFunction,
  }
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/**
 * Blockers are regressions against the baseline, never the state it recorded: a
 * gate the repository already fails is a gate everyone learns to switch off.
 *
 * The COUNT of oversized functions is compared as well as the worst one. With
 * only the worst, a file baselined at one 203-line function could be rewritten
 * into two of 200 and pass — measured, and it is what that check exists for.
 *
 * Comment volume WARNS and never blocks, and that is a decision rather than
 * timidity. No machine can tell the paragraph that must go from the measurement
 * that must stay unshortened, so a gate that blocked on prose would sooner or
 * later block the one comment the rule exists to protect. Length is mechanical;
 * prose is judged by a reader.
 */
export function judge(measurement, baseline) {
  const blockers = []
  const warnings = []
  const allowedFile = Math.max(LIMITS.fileLines, baseline?.fileLines ?? 0)
  const allowedFunction = Math.max(LIMITS.functionLinesHard, baseline?.worstFunction ?? 0)
  const allowedCount = Math.max(0, baseline?.functionsOverLimit ?? 0)
  const allowedRun = Math.max(LIMITS.commentBlock, baseline?.commentRun ?? 0)
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
      `${plural(measurement.functionsOverLimit, 'function is', 'functions are')} over ${LIMITS.functionLinesHard} lines, against ${allowedCount} recorded. A new oversized function is a new one to read.`,
    )
  }

  for (const fn of measurement.functions) {
    if (fn.lines > allowedFunction) {
      blockers.push(`${fn.name}() is ${fn.lines} lines of code (limit ${LIMITS.functionLinesHard}, target ${LIMITS.functionLines}) at line ${fn.line}. Extract the part that has a name of its own.`)
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

  if (measurement.commentRun > allowedRun) {
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
  return execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64e6 })
    .split('\n')
    .filter(Boolean)
    .filter(isSource)
}
