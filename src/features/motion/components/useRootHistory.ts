import { useMemo, useRef } from 'react'

export type RootSample = {
  readonly facingRadians: number
  readonly time: number
  readonly x: number
  readonly z: number
}

export type RootHistory = {
  readonly push: (sample: RootSample) => void
  readonly sampleAt: (seconds: number) => RootSample
  readonly size: () => number
}

export const ROOT_HISTORY_SECONDS = 0.5

export function useRootHistory(): RootHistory {
  const samples = useRef<RootSample[]>([])

  return useMemo(() => ({
    push: (sample) => {
      samples.current.push(sample)
      while (samples.current.length > 2 && sample.time - samples.current[0].time > ROOT_HISTORY_SECONDS) {
        samples.current.shift()
      }
    },
    sampleAt: (seconds) => {
      const held = samples.current
      if (held.length === 0) return { facingRadians: 0, time: seconds, x: 0, z: 0 }
      let closest = held[0]
      for (const candidate of held) {
        if (Math.abs(candidate.time - seconds) < Math.abs(closest.time - seconds)) closest = candidate
      }
      return closest
    },
    size: () => samples.current.length,
  }), [])
}
