import type { FootStanceWindows } from './stanceWindow'

export function wrapPhase(phase: number): number {
  return phase - Math.floor(phase)
}

/* @important Two clips blend cleanly only when the same foot is down at the
   same phase. GASP bakes a phase curve from the footstep notifies and lets the
   search align on it; we have the stance windows measured from the clips, so
   the left foot's plant start is our phase zero and every clip is offset onto
   it. */
export function phaseOffsetOf(clip: FootStanceWindows, reference: FootStanceWindows): number {
  return wrapPhase(clip.left[0] - reference.left[0])
}

export function alignedPhase(phase: number, offset: number): number {
  return wrapPhase(phase + offset)
}
