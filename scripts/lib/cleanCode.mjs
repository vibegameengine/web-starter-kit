export const LIMITS = {
  fileLines: 500,
  functionLines: 40,
  functionLinesHard: 80,
  nesting: 4,
  parameters: 4,
}

export const COMMENT_ALLOW_MARKER = '@important'

const SOURCE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i

const EXCLUDED = /(^|[\\/])(node_modules|dist|coverage|vendor|agents)([\\/]|$)/i

const TOOLING_DIRECTIVES = [
  /^\/\/\/\s*<(reference|amd-module|amd-dependency)\b/,
  /^\s*[#@]\s*sourceMappingURL=/,
  /^\s*eslint-(disable|enable)(-next-line|-line)?\b/,
  /^\s*eslint-env\s/,
  /^\s*eslint\s+[\w@/-]+\s*:/,
  /^\s*globals?\s+\w+(\s*:\s*\w+)?(\s*,\s*\w+(\s*:\s*\w+)?)*\s*$/,
  /^\s*@ts-(expect-error|ignore|nocheck|check)\b/,
  /^\s*[#@]__(PURE|NO_SIDE_EFFECTS)__\s*$/,
  /^\s*@vite-ignore\s*$/,
  /^\s*webpack[A-Z]\w*\s*:/,
  /^\s*prettier-ignore\b/,
  /^\s*(c8|istanbul|v8)\s+ignore\b/,
  /^\s*@vitest-environment\s/,
  /^\s*@jsx(ImportSource|Runtime|Frag)?\s/,
]

export function isSource(path) {
  return SOURCE_EXTENSIONS.test(path) && !EXCLUDED.test(path)
}

const commentBody = (token) => {
  if (token.startsWith('///')) return token
  if (token.startsWith('//')) return token.slice(2)
  return token.slice(2, -2).replace(/^\*/, '')
}

export function isAllowedComment(token) {
  if (token.includes(COMMENT_ALLOW_MARKER)) return true
  const body = commentBody(token)
  return TOOLING_DIRECTIVES.some((directive) => directive.test(body))
}

const isFunctionLike = (ts, node) =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessor(node) ||
  ts.isSetAccessor(node)

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

const isJsDocNode = (ts, node) => node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode

function commentTokens(ts, source, text) {
  const found = new Map()
  const collect = (position) => {
    const ranges = [...(ts.getLeadingCommentRanges(text, position) ?? []), ...(ts.getTrailingCommentRanges(text, position) ?? [])]
    for (const range of ranges) found.set(range.pos, { end: range.end, start: range.pos, text: text.slice(range.pos, range.end) })
  }
  const visit = (node) => {
    if (isJsDocNode(ts, node)) return
    const children = node.getChildren(source)
    if (children.length > 0) children.forEach(visit)
    else if (node.kind !== ts.SyntaxKind.JsxText) collect(node.pos)
  }
  visit(source)
  collect(source.endOfFileToken.pos)
  return [...found.values()].sort((a, b) => a.start - b.start)
}

function commentLineSet(tokens, text) {
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
      while (span < tokens.length && tokens[span].end <= at) span += 1
      if (span < tokens.length && at >= tokens[span].start) flagged.add(line)
    }
    start = end + 1
    line += 1
  }
  return flagged
}

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

function collectFunctions(ts, source, context) {
  const { flagged, lineOf, rawLines } = context
  const functions = []

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

export function measureFile(ts, path, text) {
  const lines = text.split(/\r?\n/)
  const kind = /\.tsx$/i.test(path) ? ts.ScriptKind.TSX : /\.[cm]?ts$/i.test(path) ? ts.ScriptKind.TS : ts.ScriptKind.JS
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  const lineOf = (position) => source.getLineAndCharacterOfPosition(position).line + 1

  const tokens = commentTokens(ts, source, text)
  const flagged = commentLineSet(tokens, text)
  const functions = collectFunctions(ts, source, { flagged, lineOf, rawLines: lines })
  const forbidden = tokens.filter((token) => !isAllowedComment(token.text)).map((token) => lineOf(token.start))

  return {
    comments: forbidden.length,
    commentsAt: forbidden,
    fileLines: lines.length,
    functions,
    functionsOverLimit: functions.filter((fn) => fn.lines > LIMITS.functionLinesHard).length,
    worstFunction: functions.reduce((most, fn) => Math.max(most, fn.lines), 0),
  }
}

export function isOverLimits(measurement) {
  return measurement.fileLines > LIMITS.fileLines || measurement.worstFunction > LIMITS.functionLinesHard || measurement.comments > 0
}

export function baselineOf(measurement) {
  return {
    comments: measurement.comments,
    fileLines: measurement.fileLines,
    functionsOverLimit: measurement.functionsOverLimit,
    worstFunction: measurement.worstFunction,
  }
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

function judgeComments(measurement, baseline, blockers, warnings) {
  const allowed = Math.max(0, baseline?.comments ?? 0)
  const where = measurement.commentsAt.slice(0, 10).join(', ')
  if (measurement.comments > allowed) {
    blockers.push(
      `${plural(measurement.comments, 'comment', 'comments')} at line ${where}, against ${allowed} recorded. Comments are forbidden: say it in a name, or mark a comment that must stay with ${COMMENT_ALLOW_MARKER}.`,
    )
  } else if (measurement.comments > 0) {
    warnings.push(`${plural(measurement.comments, 'old comment remains', 'old comments remain')} at line ${where}. Remove them while the file is open.`)
  }
}

export function judge(measurement, baseline) {
  const blockers = []
  const warnings = []
  const allowedFile = Math.max(LIMITS.fileLines, baseline?.fileLines ?? 0)
  const allowedFunction = Math.max(LIMITS.functionLinesHard, baseline?.worstFunction ?? 0)
  const allowedCount = Math.max(0, baseline?.functionsOverLimit ?? 0)

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

  judgeComments(measurement, baseline, blockers, warnings)
  return { blockers, warnings }
}

export function trackedSources(execSync) {
  return execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64e6 })
    .split('\n')
    .filter(Boolean)
    .filter(isSource)
}
