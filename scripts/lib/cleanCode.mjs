// The clean-code measurement, in one place.
//
// Two callers need identical numbers: the guard hook that judges a single file
// after it is written, and the baseline script that records the whole repository.
// If they measured separately they would drift, and a drifting baseline blocks
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

/** Control flow only: an object literal three deep is not nesting. */
const isNesting = (ts, node) =>
  ts.isIfStatement(node) ||
  ts.isForStatement(node) ||
  ts.isForOfStatement(node) ||
  ts.isForInStatement(node) ||
  ts.isWhileStatement(node) ||
  ts.isDoStatement(node) ||
  ts.isSwitchStatement(node) ||
  ts.isTryStatement(node) ||
  ts.isCatchClause(node)

function nameOf(ts, source, node) {
  if (node.name) return node.name.getText(source)
  const parent = node.parent
  const named = parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent))
  return named && parent.name ? parent.name.getText(source) : '(anonymous)'
}

function commentMap(lines) {
  const flags = new Array(lines.length).fill(false)
  let inBlock = false
  lines.forEach((raw, index) => {
    const line = raw.trim()
    if (inBlock) {
      flags[index] = true
      if (line.includes('*/')) inBlock = false
      return
    }
    if (line.startsWith('/*')) {
      flags[index] = true
      if (!line.includes('*/')) inBlock = true
      return
    }
    if (line.startsWith('//') || line.startsWith('*')) flags[index] = true
  })
  return flags
}

function longestCommentRun(flags) {
  let longest = 0
  let at = 0
  let run = 0
  let start = 0
  flags.forEach((isComment, index) => {
    if (!isComment) {
      run = 0
      return
    }
    if (run === 0) start = index + 1
    run += 1
    if (run > longest) {
      longest = run
      at = start
    }
  })
  return { at, longest }
}

/** Lines a function spends inside JSX: markup is not logic to read. */
function jsxLines(ts, source, node, lineOf) {
  let covered = 0
  const scan = (child) => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      covered += lineOf(child.getEnd()) - lineOf(child.getStart(source))
      return
    }
    ts.forEachChild(child, scan)
  }
  ts.forEachChild(node, scan)
  return covered
}

function collectFunctions(ts, source, lineOf, isComment) {
  const functions = []

  const commentsIn = (from, to) => {
    let count = 0
    for (let index = from - 1; index < to && index < isComment.length; index += 1) if (isComment[index]) count += 1
    return count
  }

  const walkBody = (node, depth, owner) => {
    if (isFunctionLike(ts, node) && node.body) {
      visit(node, 0)
      return
    }
    const depthHere = isNesting(ts, node) ? depth + 1 : depth
    owner.nesting = Math.max(owner.nesting, depthHere)
    ts.forEachChild(node, (child) => walkBody(child, depthHere, owner))
  }

  function visit(node, depth) {
    if (isFunctionLike(ts, node) && node.body) {
      const start = lineOf(node.getStart(source))
      const end = lineOf(node.getEnd())
      const record = {
        lines: end - start + 1 - jsxLines(ts, source, node, lineOf) - commentsIn(start, end),
        line: start,
        name: nameOf(ts, source, node),
        nesting: 0,
        parameters: node.parameters.length,
      }
      functions.push(record)
      ts.forEachChild(node, (child) => walkBody(child, 0, record))
      return
    }
    const depthHere = isNesting(ts, node) ? depth + 1 : depth
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

  const isComment = commentMap(lines)
  const commentLines = isComment.filter(Boolean).length
  const codeLines = lines.filter((line) => line.trim() !== '').length - commentLines
  const run = longestCommentRun(isComment)
  const functions = collectFunctions(ts, source, lineOf, isComment)
  const worst = functions.reduce((most, fn) => Math.max(most, fn.lines), 0)

  return {
    commentLines,
    commentRun: run.longest,
    commentRunAt: run.at,
    commentShare: codeLines + commentLines === 0 ? 0 : commentLines / (codeLines + commentLines),
    fileLines: lines.length,
    functions,
    worstFunction: worst,
  }
}

/** What a baseline remembers about a file: the numbers a ratchet compares. */
export function baselineOf(measurement) {
  return {
    commentShare: Math.round(measurement.commentShare * 100) / 100,
    fileLines: measurement.fileLines,
    worstFunction: measurement.worstFunction,
  }
}

/**
 * Blockers are regressions against the baseline, never the state it recorded.
 * A gate the repository already fails is a gate everyone learns to switch off.
 */
export function judge(measurement, baseline) {
  const blockers = []
  const warnings = []
  const allowedFile = Math.max(LIMITS.fileLines, baseline?.fileLines ?? 0)
  const allowedFunction = Math.max(LIMITS.functionLinesHard, baseline?.worstFunction ?? 0)

  if (measurement.fileLines > allowedFile) {
    blockers.push(
      baseline
        ? `the file is ${measurement.fileLines} lines, past its own baseline of ${baseline.fileLines}. It was already over the ${LIMITS.fileLines}-line limit; it may not grow further.`
        : `the file is ${measurement.fileLines} lines against a ${LIMITS.fileLines}-line limit. Split it by responsibility BEFORE the next behaviour change.`,
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
  if (measurement.commentShare > LIMITS.commentShare && measurement.commentLines > 20) {
    warnings.push(`${Math.round(measurement.commentShare * 100)}% of this file is comment (${measurement.commentLines} lines). Most of it is describing what the code already says.`)
  }

  return { blockers, warnings }
}
