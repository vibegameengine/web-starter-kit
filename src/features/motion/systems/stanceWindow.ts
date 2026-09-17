import { clampNumber } from './angles'

export type StanceWindow = readonly [number, number]

export type FootStanceWindows = {
  readonly left: StanceWindow
  readonly right: StanceWindow
}

export const STANDING_BLEND_SHARE = 0.15

export const RUN_BLEND_SHARE = 0.45

export function wrappedPhase(phase: number): number {
  const wrapped = phase % 1
  return wrapped < 0 ? wrapped + 1 : wrapped
}

export function isInWindow(phase: number, [from, to]: StanceWindow): boolean {
  const at = wrappedPhase(phase)
  if (from <= to) return at >= from && at <= to
  return at >= from || at <= to
}

function blendEdge(from: number, to: number, share: number): number {
  const direct = to - from
  const shortest = direct > 0.5 ? direct - 1 : direct < -0.5 ? direct + 1 : direct
  return wrappedPhase(from + shortest * share)
}

export function blendWindows(walk: StanceWindow, run: StanceWindow, share: number): StanceWindow {
  const eased = clampNumber(share, 0, 1)
  return [blendEdge(walk[0], run[0], eased), blendEdge(walk[1], run[1], eased)]
}

export type StanceLookup = {
  readonly blendShare: number
  readonly grounded: boolean
  readonly phase: number
  readonly runWindows: FootStanceWindows
  readonly walkWindows: FootStanceWindows
}

export function footStance(lookup: StanceLookup): { readonly left: boolean; readonly right: boolean } {
  if (!lookup.grounded) return { left: false, right: false }
  if (Math.abs(lookup.blendShare) < STANDING_BLEND_SHARE) return { left: true, right: true }

  const share = (Math.abs(lookup.blendShare) - RUN_BLEND_SHARE) / (1 - RUN_BLEND_SHARE)
  const windows = Math.abs(lookup.blendShare) < RUN_BLEND_SHARE
    ? lookup.walkWindows
    : {
        left: blendWindows(lookup.walkWindows.left, lookup.runWindows.left, share),
        right: blendWindows(lookup.walkWindows.right, lookup.runWindows.right, share),
      }

  return {
    left: isInWindow(lookup.phase, windows.left),
    right: isInWindow(lookup.phase, windows.right),
  }
}
