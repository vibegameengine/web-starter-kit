export type IndexedPose = {
  readonly clipId: string
  readonly features: readonly number[]
  readonly time: number
}

export type PoseDatabase = {
  readonly dimensions: number
  readonly poses: readonly IndexedPose[]
  readonly sampleHz: number
  readonly trajectoryOffsets: readonly number[]
  readonly weights: readonly number[]
}

export type PoseMatch = {
  readonly clipId: string
  readonly cost: number
  readonly index: number
  readonly time: number
}

export type PoseSearchOptions = {
  readonly continuing?: PoseMatch | null
  readonly switchPenalty?: number
}

export const DEFAULT_SWITCH_PENALTY = 0.35

export function poseCost(query: readonly number[], pose: readonly number[], weights: readonly number[]): number {
  if (query.length !== pose.length || query.length !== weights.length) {
    throw new Error(`pose cost needs matching lengths, got ${query.length}, ${pose.length}, ${weights.length}`)
  }
  let total = 0
  for (let index = 0; index < query.length; index += 1) {
    const difference = query[index] - pose[index]
    total += difference * difference * weights[index]
  }
  return Math.sqrt(total)
}

function continuationIndex(database: PoseDatabase, continuing: PoseMatch): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < database.poses.length; index += 1) {
    const pose = database.poses[index]
    if (pose.clipId !== continuing.clipId) continue
    const distance = Math.abs(pose.time - continuing.time)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }
  return best
}

export function findBestPose(
  database: PoseDatabase,
  query: readonly number[],
  { continuing = null, switchPenalty = DEFAULT_SWITCH_PENALTY }: PoseSearchOptions = {},
): PoseMatch {
  if (database.poses.length === 0) throw new Error('pose database is empty')

  const held = continuing ? continuationIndex(database, continuing) : -1
  let best: PoseMatch | null = null

  for (let index = 0; index < database.poses.length; index += 1) {
    const pose = database.poses[index]
    const raw = poseCost(query, pose.features, database.weights)
    const cost = index === held ? raw : raw + switchPenalty
    if (!best || cost < best.cost) best = { clipId: pose.clipId, cost, index, time: pose.time }
  }

  return best as PoseMatch
}

export function poseAfter(database: PoseDatabase, match: PoseMatch, seconds: number): PoseMatch {
  const pose = database.poses[match.index]
  const samplesAhead = Math.round(seconds * database.sampleHz)
  let index = match.index
  for (let step = 0; step < samplesAhead; step += 1) {
    const next = database.poses[index + 1]
    if (!next || next.clipId !== pose.clipId) break
    index += 1
  }
  const landed = database.poses[index]
  return { clipId: landed.clipId, cost: match.cost, index, time: landed.time }
}
