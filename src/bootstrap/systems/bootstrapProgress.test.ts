import { describe, expect, it } from 'vitest'
import {
  createBootstrapProgressPlan,
  getBootstrapProgress,
  getNextBootstrapProgress,
} from './bootstrapProgress'

describe('createBootstrapProgressPlan', () => {
  it('starts assets at 0 when there are no prepare steps', () => {
    const plan = createBootstrapProgressPlan({ hasPrepareSteps: false, hasFinalizeSteps: false })
    expect(plan.assetsStart).toBe(0)
    expect(plan.assetsEnd).toBe(plan.finalizeEnd)
  })

  it('reserves a prepare band when prepare steps exist', () => {
    const plan = createBootstrapProgressPlan({ hasPrepareSteps: true, hasFinalizeSteps: false })
    expect(plan.assetsStart).toBeGreaterThan(0)
  })

  it('reserves a finalize band when finalize steps exist', () => {
    const plan = createBootstrapProgressPlan({ hasPrepareSteps: false, hasFinalizeSteps: true })
    expect(plan.finalizeEnd).toBeGreaterThan(plan.assetsEnd)
    expect(plan.finalizeEnd).toBeLessThan(plan.renderProgress)
  })
})

describe('getBootstrapProgress', () => {
  const plan = createBootstrapProgressPlan({ hasPrepareSteps: true, hasFinalizeSteps: true })

  it('interpolates within each phase band', () => {
    expect(getBootstrapProgress('prepare', 0, plan)).toBe(0)
    expect(getBootstrapProgress('prepare', 1, plan)).toBe(plan.assetsStart)
    expect(getBootstrapProgress('assets', 0, plan)).toBe(plan.assetsStart)
    expect(getBootstrapProgress('assets', 1, plan)).toBe(plan.assetsEnd)
    expect(getBootstrapProgress('finalize', 1, plan)).toBe(plan.finalizeEnd)
    expect(getBootstrapProgress('render', 0, plan)).toBe(plan.renderProgress)
  })

  it('produces a monotonic sequence across phases', () => {
    const prepare = getBootstrapProgress('prepare', 0.5, plan)
    const assets = getBootstrapProgress('assets', 0.5, plan)
    const finalize = getBootstrapProgress('finalize', 0.5, plan)
    const render = getBootstrapProgress('render', 0, plan)
    expect(prepare).toBeLessThan(assets)
    expect(assets).toBeLessThan(finalize)
    expect(finalize).toBeLessThan(render)
  })

  it('clamps out-of-range stage fractions', () => {
    expect(getBootstrapProgress('assets', -1, plan)).toBe(plan.assetsStart)
    expect(getBootstrapProgress('assets', 5, plan)).toBe(plan.assetsEnd)
  })
})

describe('getNextBootstrapProgress', () => {
  it('never moves the bar backwards', () => {
    expect(getNextBootstrapProgress(0.6, 0.4)).toBe(0.6)
    expect(getNextBootstrapProgress(0.4, 0.6)).toBe(0.6)
  })
})
