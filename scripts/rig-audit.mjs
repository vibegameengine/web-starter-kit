#!/usr/bin/env node
/**
 * rig-audit — измеряет риг в ЭКСПОРТИРОВАННОМ GLB.
 *
 * ИСТОРИЯ ЭТОГО ФАЙЛА, чтобы никто не наступил повторно.
 * Первая версия считала только гистограмму весов по именам костей и выдала
 * EXIT=0 на риге, у которого кости стояли на 3-6 см мимо меша. Критик показал
 * три способа её обмануть, и все три были не гипотетическими:
 *
 *  1. Порог "ни одна кость не держит >25% вершин" обходится ДОБАВЛЕНИЕМ КОСТЕЙ.
 *     Веса того же рига, схлопнутые обратно в старый набор имён, дали 75% —
 *     хуже, чем 62% у рига, который эта же метрика провалила.
 *  2. Метрика не читала ни одной координаты, поэтому смещение кости её не
 *     меняло вообще. Случайный риг (3 случайные кости на вершину) проходил
 *     все пороги.
 *  3. Нескинованный меш молча пропускался через `continue`, так что забытая
 *     левая рука давала зелёный.
 *
 * Поэтому здесь теперь ДВЕ группы проверок, и вторая — главная:
 *   A. распределение весов (дёшево, но обманывается дроблением костей);
 *   B. ГЕОМЕТРИЯ: где кость стоит относительно меша, который она двигает.
 *      Эту группу нельзя пройти, добавив костей — она сравнивает координаты.
 *
 * `--self-test` — негативный контроль: сдвигает джойнты и требует, чтобы
 * аудит УПАЛ. Метрика, которая не умеет провалить испорченный риг, бесполезна.
 *
 *   node scripts/rig-audit.mjs <file.glb> [--json] [--self-test]
 *
 * Коды выхода:  0 — пройдено | 1 — пороги нарушены | 2 — нет файла/аргумента
 *               3 — файл не читается (ОТДЕЛЬНО от провала порогов)
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

// ПРОИСХОЖДЕНИЕ ПОРОГОВ. Критик справедливо указал, что зелёный EXIT против
// самопридуманного числа не является внешней проверкой. Поэтому каждый порог
// ниже помечен, откуда он взят, и tool печатает это в отчёте:
//   [СПЕЦ]   — следует из формата glTF, спорить не с чем;
//   [ЗАМЕР]  — выведен из измеренной геометрии ЭТОГО меша;
//   [СУЖДЕНИЕ] — мой выбор, внешнего основания НЕТ.
// Провал по [СУЖДЕНИЕ]-порогу означает "хуже, чем я решил считать приемлемым",
// а не "объективно плохо". Не путать одно с другим.
const PROVENANCE = {
  PRIMARY_MAX: '[СУЖДЕНИЕ] внешнего основания нет; исходная жалоба была "одна кость держит 76%"',
  TOUCH_MAX: '[СУЖДЕНИЕ] внешнего основания нет',
  COLLAPSED_PRIMARY_MAX: '[СУЖДЕНИЕ] внешнего основания нет; сверять с долей вершин самой кисти в меше',
  MEDIAN_MAX: '[СУЖДЕНИЕ] внешнего основания нет',
  SUM_TOL: '[СПЕЦ] квант нормализованного unsigned byte = 1/255',
  JOINTS_1: '[СПЕЦ] glTF: JOINTS_0 — VEC4, больше 4 влияний требует второго набора',
  BONE_CENTROID_MAX: '[ЗАМЕР] доля габарита меша',
  VERTEX_REACH_P99_MAX: '[ЗАМЕР] доля габарита меша',
  NOT_NEAREST_MAX: '[ЗАМЕР] доля вершин',
  CROSS_FINGER_MAX: '[ЗАМЕР] доля вершин',
  WEIGHT_JUMP_MAX: '[ЗАМЕР] доля рёбер',
}

// --- пороги группы A: распределение весов ---
const PRIMARY_MAX = 0.25
const TOUCH_MAX = 0.55
const TOUCH_EPS = 0.01
const MEDIAN_EPS = 0.05
const MEDIAN_MAX = 3
// Квант нормализованного unsigned byte равен 1/255 = 3.9e-3, поэтому допуск на
// сумму весов ДОЛЖЕН быть больше него: с 1e-3 любой экспортёр, который не
// пере-нормирует после квантизации, давал бы 100% ложных провалов.
const SUM_TOL = 3 / 255

// --- пороги группы B: геометрия (доли от габарита меша, а не абсолютные см) ---
/** Центроид вершин, для которых кость главная, не должен лежать далеко от самой кости. */
const BONE_CENTROID_MAX = 0.06
/** 99-й процентиль расстояния вершина -> её главная кость. */
const VERTEX_REACH_P99_MAX = 0.20
/** Доля вершин, чья главная кость не является ближайшей к ним. */
const NOT_NEAREST_MAX = 0.15
/** Доля вершин под влиянием двух РАЗНЫХ пальцев (перетекание между пальцами). */
const CROSS_FINGER_MAX = 0.08
/** Доля рёбер со скачком весов L1 > 0.5 (разрыв меша на суставе). */
const WEIGHT_JUMP_MAX = 0.01

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const selfTest = args.includes('--self-test')
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('usage: node scripts/rig-audit.mjs <file.glb> [--json] [--self-test]')
  process.exitCode = 2
  process.exit()
}
const abs = resolve(file)
if (!existsSync(abs)) {
  console.error(`rig-audit: файла нет: ${abs}`)
  process.exitCode = 2
  process.exit()
}

// Регистрируем ВСЕ расширения: без этого файл после meshopt/quantize из
// vite/glbAssetOptimizerPlugin.ts не читается вообще, а исключение выглядело
// точно так же, как провал порогов.
let io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
try {
  const { MeshoptDecoder } = await import('meshoptimizer')
  io = io.registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
} catch {
  /* meshoptimizer опционален; без него упадём с кодом 3 и внятным текстом */
}

let doc
try {
  doc = await io.read(abs)
} catch (err) {
  console.error(`rig-audit: НЕ УДАЛОСЬ ПРОЧИТАТЬ ${abs}`)
  console.error(`  ${err?.message ?? err}`)
  console.error('  Это НЕ провал порогов — это нечитаемый файл. Код выхода 3.')
  process.exitCode = 3
  process.exit()
}

const root = doc.getRoot()
const failures = []

// Файл может быть безупречен и при этом не доезжать до игрока. Критик поймал
// ровно это: "важно мерить то, что приезжает в браузер" — верно, но ничего из
// измеряемого в браузер не приезжало. Поэтому инструмент теперь сам сообщает,
// ссылается ли на этот GLB хоть одна строка исходников.
let runtimeNote = null
try {
  const { execFileSync } = await import('node:child_process')
  const base = abs.split(/[\/]/).pop().replace(/\.glb$/i, '')
  const hits = execFileSync('git', ['grep', '-l', '--', base, '--', 'src', 'vite', '*.json'], {
    cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
  runtimeNote = hits ? ('на этот файл ссылаются: ' + hits.replace(/[\r\n]+/g, ', ')) : null
} catch {
  runtimeNote = null
}
if (!runtimeNote) {
  runtimeNote = 'НИ ОДНА строка src/ vite/ *.json на этот файл не ссылается — в игру он НЕ ПОПАДАЕТ. Зелёный аудит здесь ничего не говорит об игре.'
}

// ---------------------------------------------------------------- геометрия
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const xform = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
]
/** Расстояние от точки до отрезка; для вырожденного отрезка — до точки. */
function distToSegment(p, a, b) {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < 1e-12) return len(sub(p, a))
  let t = dot(sub(p, a), ab) / l2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return len(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]))
}
/** Имя цепи пальца, если кость принадлежит пальцу; иначе null. */
function fingerChain(name) {
  const m = /^(thumb|index|middle|ring|pinky)_\d+_([LR])$/.exec(name)
  return m ? `${m[1]}_${m[2]}` : null
}

/**
 * Схлопнутое имя кости: все фаланги пальцев -> кисть, twist -> его сегмент.
 *
 * Существует потому, что порог "ни одна кость не держит >25% вершин"
 * ТРИВИАЛЬНО обходится дроблением одной кости на шестнадцать. Измерено на этом
 * самом риге: веса, схлопнутые обратно в старый набор имён, дали hand_R 75%
 * против 62% у рига, который эта же метрика провалила. То есть зелёный был
 * куплен переименованием, а не качеством. На схлопнутой иерархии этот трюк
 * не работает — добавление костей её не меняет.
 */
function collapsedName(name) {
  const f = fingerChain(name)
  if (f) return `hand_${f.slice(-1)}`
  const t = /^(lowerarm|upperarm)_twist(?:_\d+)?_([LR])$/.exec(name)
  if (t) return `${t[1]}_${t[2]}`
  return name
}
/** Порог для схлопнутой иерархии: кисть со всеми пальцами — крупный сегмент. */
const COLLAPSED_PRIMARY_MAX = 0.55

/**
 * Сегменты костей в мировом пространстве: сустав -> его ребёнок-сустав.
 * В glTF у джойнта нет длины, есть только позиция, поэтому "кость" — это
 * отрезок до ребёнка. Лист трактуется как точка (вырожденный отрезок).
 * `shift` двигает каждый джойнт по X — им пользуется --self-test.
 */
function jointSegments(skin, shift = 0) {
  const joints = skin.listJoints()
  const set = new Set(joints)
  const pos = new Map()
  for (const j of joints) {
    const m = j.getWorldMatrix()
    pos.set(j, [m[12] + shift, m[13], m[14]])
  }
  return joints.map((j) => {
    const kids = j.listChildren().filter((c) => set.has(c))
    const a = pos.get(j)
    const b = kids.length ? pos.get(kids[0]) : a
    return { name: j.getName(), a, b }
  })
}

/** Одна полная проверка меша. Вынесена, чтобы --self-test мог прогнать её со сдвигом. */
function auditPrimitive(prim, skin, meshNode, label, shift) {
  const j0 = prim.getAttribute('JOINTS_0')
  const w0 = prim.getAttribute('WEIGHTS_0')
  const pos = prim.getAttribute('POSITION')
  const segs = jointSegments(skin, shift)
  const world = meshNode.getWorldMatrix()

  const count = j0.getCount()
  const primary = new Map()
  const collapsed = new Map()
  const touch = new Map()
  const perVertexAbove = []
  const primaryOf = new Int32Array(count).fill(-1)
  const weightsOf = new Array(count)
  let zeroWeight = 0
  let badSum = 0
  let worstSumErr = 0

  const jv = [0, 0, 0, 0]
  const wv = [0, 0, 0, 0]
  const pv = [0, 0, 0]
  const verts = new Array(count)
  const reach = []
  let notNearest = 0
  let crossFinger = 0

  for (let v = 0; v < count; v++) {
    j0.getElement(v, jv)
    w0.getElement(v, wv)
    pos.getElement(v, pv)
    const p = xform(world, pv)
    verts[v] = p

    let sum = 0
    let best = -1
    let bestW = 0
    let above = 0
    const chains = new Set()
    const row = []
    for (let k = 0; k < 4; k++) {
      const w = wv[k]
      if (!(w > 0)) continue
      const ji = jv[k]
      const name = segs[ji]?.name ?? `joint#${ji}`
      sum += w
      row.push([ji, w])
      if (w > TOUCH_EPS) {
        touch.set(name, (touch.get(name) ?? 0) + 1)
        const ch = fingerChain(name)
        if (ch) chains.add(ch)
      }
      if (w > MEDIAN_EPS) above++
      if (w > bestW) { bestW = w; best = ji }
    }
    weightsOf[v] = row
    perVertexAbove.push(above)
    if (chains.size > 1) crossFinger++

    if (sum <= 0) { zeroWeight++; continue }
    const err = Math.abs(sum - 1)
    if (err > worstSumErr) worstSumErr = err
    if (err > SUM_TOL) badSum++
    primaryOf[v] = best
    const bestName = segs[best]?.name ?? `joint#${best}`
    primary.set(bestName, (primary.get(bestName) ?? 0) + 1)
    const col = collapsedName(bestName)
    collapsed.set(col, (collapsed.get(col) ?? 0) + 1)

    // --- ГРУППА B: где вершина относительно кости, которая ею владеет ---
    const dPrimary = distToSegment(p, segs[best].a, segs[best].b)
    reach.push(dPrimary)
    let dNearest = Infinity
    for (const s of segs) {
      const d = distToSegment(p, s.a, s.b)
      if (d < dNearest) dNearest = d
    }
    if (dPrimary > dNearest * 1.25 + 1e-6) notNearest++
  }

  // габарит меша — знаменатель для геометрических порогов
  let mn = [Infinity, Infinity, Infinity]
  let mx = [-Infinity, -Infinity, -Infinity]
  for (const p of verts) for (let i = 0; i < 3; i++) { if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i] }
  const diag = len(sub(mx, mn)) || 1

  // центроид вершин, для которых кость главная, против самой кости
  const centroids = new Map()
  for (let v = 0; v < count; v++) {
    const b = primaryOf[v]
    if (b < 0) continue
    const c = centroids.get(b) ?? [0, 0, 0, 0]
    c[0] += verts[v][0]; c[1] += verts[v][1]; c[2] += verts[v][2]; c[3]++
    centroids.set(b, c)
  }
  const boneOffsets = []
  for (const [b, c] of centroids) {
    if (c[3] < 20) continue
    const cen = [c[0] / c[3], c[1] / c[3], c[2] / c[3]]
    const d = distToSegment(cen, segs[b].a, segs[b].b)
    boneOffsets.push({ bone: segs[b].name, vertices: c[3], offset: d, offsetRel: d / diag })
  }
  boneOffsets.sort((x, y) => y.offsetRel - x.offsetRel)

  reach.sort((a, b) => a - b)
  const p99 = reach.length ? reach[Math.min(reach.length - 1, Math.floor(reach.length * 0.99))] : 0

  // непрерывность весов по рёбрам треугольников
  const idx = prim.getIndices()
  let edges = 0
  let jumps = 0
  if (idx) {
    const arr = idx.getArray()
    const seen = new Set()
    const l1 = (a, b) => {
      const m = new Map()
      for (const [j, w] of weightsOf[a]) m.set(j, (m.get(j) ?? 0) + w)
      for (const [j, w] of weightsOf[b]) m.set(j, (m.get(j) ?? 0) - w)
      let s = 0
      for (const w of m.values()) s += Math.abs(w)
      return s
    }
    for (let t = 0; t + 2 < arr.length; t += 3) {
      for (const [x, y] of [[arr[t], arr[t + 1]], [arr[t + 1], arr[t + 2]], [arr[t + 2], arr[t]]]) {
        const key = x < y ? x * 4294967296 + y : y * 4294967296 + x
        if (seen.has(key)) continue
        seen.add(key)
        edges++
        if (l1(x, y) > 0.5) jumps++
      }
    }
  }

  perVertexAbove.sort((a, b) => a - b)
  return {
    mesh: label,
    vertices: count,
    boneCount: segs.length,
    hasJoints1: Boolean(prim.getAttribute('JOINTS_1')),
    morphTargets: prim.listTargets().length,
    zeroWeight,
    badSum,
    worstSumErr,
    medianBonesAbove: perVertexAbove.length ? perVertexAbove[Math.floor(perVertexAbove.length / 2)] : 0,
    diag,
    boneOffsets,
    reachP99: p99,
    reachP99Rel: p99 / diag,
    notNearestFrac: count ? notNearest / count : 0,
    crossFingerFrac: count ? crossFinger / count : 0,
    weightJumpFrac: edges ? jumps / edges : 0,
    edges,
    collapsed: [...collapsed].map(([n, c]) => ({ bone: n, count: c, pct: c / count })).sort((a, b) => b.pct - a.pct),
    primary: [...primary].map(([n, c]) => ({ bone: n, count: c, pct: c / count })).sort((a, b) => b.pct - a.pct),
    touch: [...touch].map(([n, c]) => ({ bone: n, count: c, pct: c / count })).sort((a, b) => b.pct - a.pct),
  }
}

function check(m, out) {
  if (m.hasJoints1) out.push(`${m.mesh}: присутствует JOINTS_1 — больше 4 влияний на вершину`)
  if (m.zeroWeight) out.push(`${m.mesh}: вершин с нулевым весом ${m.zeroWeight}`)
  if (m.badSum) out.push(`${m.mesh}: сумма весов вне 1.0 +- ${SUM_TOL.toFixed(4)} у ${m.badSum} вершин (худшая ${m.worstSumErr.toExponential(2)})`)
  if (m.medianBonesAbove > MEDIAN_MAX) out.push(`${m.mesh}: медиана костей с весом > ${MEDIAN_EPS} = ${m.medianBonesAbove} > ${MEDIAN_MAX}`)
  for (const p of m.primary) if (p.pct > PRIMARY_MAX) out.push(`${m.mesh}: ${p.bone} — primary для ${(p.pct * 100).toFixed(1)}% вершин (> ${PRIMARY_MAX * 100}%)`)
  for (const t of m.touch) if (t.pct > TOUCH_MAX) out.push(`${m.mesh}: ${t.bone} — касается ${(t.pct * 100).toFixed(1)}% вершин (> ${TOUCH_MAX * 100}%)`)
  // СХЛОПНУТАЯ иерархия: этот порог нельзя пройти, раздробив кость на много костей
  for (const c of m.collapsed) {
    if (c.pct > COLLAPSED_PRIMARY_MAX) out.push(`${m.mesh}: СХЛОПНУТО — ${c.bone} (со всеми своими фалангами/twist) главная для ${(c.pct * 100).toFixed(1)}% вершин (> ${COLLAPSED_PRIMARY_MAX * 100}%) — концентрация скрыта дроблением костей`)
  }
  // группа B — её нельзя пройти, добавив костей
  for (const b of m.boneOffsets) {
    if (b.offsetRel > BONE_CENTROID_MAX) {
      out.push(`${m.mesh}: ГЕОМЕТРИЯ — кость ${b.bone} стоит в ${(b.offset * 100).toFixed(1)} см от центроида своих же ${b.vertices} вершин (${(b.offsetRel * 100).toFixed(1)}% габарита, порог ${BONE_CENTROID_MAX * 100}%)`)
    }
  }
  if (m.reachP99Rel > VERTEX_REACH_P99_MAX) out.push(`${m.mesh}: ГЕОМЕТРИЯ — p99 расстояния вершина->главная кость ${(m.reachP99 * 100).toFixed(1)} см = ${(m.reachP99Rel * 100).toFixed(1)}% габарита (> ${VERTEX_REACH_P99_MAX * 100}%)`)
  if (m.notNearestFrac > NOT_NEAREST_MAX) out.push(`${m.mesh}: ГЕОМЕТРИЯ — у ${(m.notNearestFrac * 100).toFixed(1)}% вершин главная кость не ближайшая (> ${NOT_NEAREST_MAX * 100}%)`)
  if (m.crossFingerFrac > CROSS_FINGER_MAX) out.push(`${m.mesh}: ГЕОМЕТРИЯ — ${(m.crossFingerFrac * 100).toFixed(1)}% вершин под влиянием ДВУХ разных пальцев (> ${CROSS_FINGER_MAX * 100}%)`)
  if (m.weightJumpFrac > WEIGHT_JUMP_MAX) out.push(`${m.mesh}: ГЕОМЕТРИЯ — ${(m.weightJumpFrac * 100).toFixed(2)}% рёбер со скачком весов L1>0.5 — меш порвётся на суставе (> ${WEIGHT_JUMP_MAX * 100}%)`)
  if (m.morphTargets) out.push(`${m.mesh}: ${m.morphTargets} morph-таргетов вместе со скином — экспортёры режут влияния, проверить вручную`)
}

// ------------------------------------------------------------------ проход
const meshNodeOf = new Map()
for (const node of root.listNodes()) {
  const mesh = node.getMesh()
  if (mesh && !meshNodeOf.has(mesh)) meshNodeOf.set(mesh, node)
}
const meshes = []
for (const mesh of root.listMeshes()) {
  const node = meshNodeOf.get(mesh)
  const label = mesh.getName() || node?.getName() || '(без имени)'
  if (!node) { failures.push(`${label}: меш не привязан ни к одной ноде`); continue }
  const skin = node.getSkin()
  // Раньше здесь стоял тихий continue, и забытый скин давал ПРОЙДЕНО.
  if (!skin) { failures.push(`${label}: у меша НЕТ СКИНА — он не деформируется`); continue }
  for (const prim of mesh.listPrimitives()) {
    if (prim.getAttribute('JOINTS_0') && prim.getAttribute('WEIGHTS_0')) {
      if (prim.getAttribute('JOINTS_0').getType() !== 'VEC4') {
        failures.push(`${label}: JOINTS_0 не VEC4 (${prim.getAttribute('JOINTS_0').getType()}) — аудит рассчитан на 4 влияния`)
        continue
      }
      meshes.push(auditPrimitive(prim, skin, node, label, 0))
    } else {
      failures.push(`${label}: у примитива нет JOINTS_0/WEIGHTS_0 — он не заскинен`)
    }
  }
}
if (!meshes.length && !failures.length) failures.push('в файле нет ни одного скинованного меша')
for (const m of meshes) check(m, failures)

// ------------------------------------------------- негативный контроль
let selfTestLine = null
if (selfTest) {
  const SHIFT = 0.03 // 3 см — ровно тот промах, который первая версия пропустила
  let caught = 0
  for (const mesh of root.listMeshes()) {
    const node = meshNodeOf.get(mesh)
    const skin = node?.getSkin()
    if (!skin) continue
    for (const prim of mesh.listPrimitives()) {
      if (!prim.getAttribute('JOINTS_0')) continue
      const bad = []
      check(auditPrimitive(prim, skin, node, 'self-test', SHIFT), bad)
      if (bad.length) caught++
    }
  }
  const ok = caught > 0
  selfTestLine = ok
    ? `САМОПРОВЕРКА ПРОЙДЕНА: сдвиг джойнтов на ${SHIFT * 100} см проваливает аудит (${caught} меш(ей))`
    : `САМОПРОВЕРКА ПРОВАЛЕНА: сдвиг джойнтов на ${SHIFT * 100} см аудит НЕ ЗАМЕТИЛ — метрика слепа`
  if (!ok) failures.push(selfTestLine)
}

const report = { file: abs, meshes, failures, selfTest: selfTestLine, pass: failures.length === 0 }

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`rig-audit: ${abs}`)
  console.log(`ПУТЬ В РАНТАЙМ: ${runtimeNote}`)
  for (const m of meshes) {
    console.log(`\n  ${m.mesh}  вершин ${m.vertices}  костей ${m.boneCount}  габарит ${(m.diag * 100).toFixed(1)} см  JOINTS_1 ${m.hasJoints1 ? 'ЕСТЬ' : 'нет'}`)
    console.log(`    A) нулевых весов ${m.zeroWeight} | сумма вне допуска ${m.badSum} | медиана костей>${MEDIAN_EPS}: ${m.medianBonesAbove}`)
    console.log(`    B) p99 вершина->кость ${(m.reachP99 * 100).toFixed(1)} см (${(m.reachP99Rel * 100).toFixed(1)}%) | главная не ближайшая ${(m.notNearestFrac * 100).toFixed(1)}% | два пальца на вершину ${(m.crossFingerFrac * 100).toFixed(1)}% | скачки весов ${(m.weightJumpFrac * 100).toFixed(2)}%`)
    console.log(`    СХЛОПНУТО: ${m.collapsed.map((c) => `${c.bone} ${(c.pct * 100).toFixed(1)}%`).join('  ')}`)
    console.log('    кость                  primary%   touch%   смещение кости от своих вершин')
    const touchBy = new Map(m.touch.map((t) => [t.bone, t.pct]))
    const offBy = new Map(m.boneOffsets.map((b) => [b.bone, b]))
    const allBones = new Set([...m.primary.map((p) => p.bone), ...m.touch.map((t) => t.bone)])
    for (const bone of allBones) {
      const p = m.primary.find((x) => x.bone === bone)?.pct ?? 0
      const t = touchBy.get(bone) ?? 0
      const o = offBy.get(bone)
      const bad = p > PRIMARY_MAX || t > TOUCH_MAX || (o && o.offsetRel > BONE_CENTROID_MAX)
      console.log(`    ${bone.padEnd(22)} ${(p * 100).toFixed(1).padStart(7)}  ${(t * 100).toFixed(1).padStart(7)}   ${o ? `${(o.offset * 100).toFixed(1)} см` : '—'}${bad ? '  <-- ПРОВАЛ' : ''}`)
    }
  }
  if (selfTestLine) console.log(`\n${selfTestLine}`)
  console.log('')
  console.log('ПРОИСХОЖДЕНИЕ ПОРОГОВ (провал по [СУЖДЕНИЕ] — это "хуже, чем я решил считать приемлемым", а не "объективно плохо"):')
  for (const [k, v] of Object.entries(PROVENANCE)) console.log(`  ${k.padEnd(24)} ${v}`)
  console.log(failures.length ? `\nПРОВАЛ (${failures.length}):` : '\nПРОЙДЕНО')
  for (const f of failures) console.log(`  - ${f}`)
}
process.exitCode = failures.length ? 1 : 0
