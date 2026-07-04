import { describe, expect, it } from 'vitest'
import { shouldMountAppForBootstrapPhase, type BootstrapPhase } from './bootstrapPhase'

describe('shouldMountAppForBootstrapPhase', () => {
  it('mounts the app once the render gate is reached', () => {
    expect(shouldMountAppForBootstrapPhase('render')).toBe(true)
    expect(shouldMountAppForBootstrapPhase('ready')).toBe(true)
  })

  it('keeps the app unmounted during earlier phases and on failure', () => {
    const earlyPhases: BootstrapPhase[] = ['prepare', 'assets', 'finalize', 'failed']
    for (const phase of earlyPhases) {
      expect(shouldMountAppForBootstrapPhase(phase)).toBe(false)
    }
  })
})
