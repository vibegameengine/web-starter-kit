import { afterEach, describe, expect, it } from 'vitest'
import {
  reportInitialRenderReady,
  requestInitialRenderReady,
  resetInitialRenderReadyForTests,
} from './initialRenderReady'

afterEach(() => {
  resetInitialRenderReadyForTests()
})

describe('initialRenderReady', () => {
  it('resolves the current request when reported', async () => {
    const request = requestInitialRenderReady()
    let resolved = false
    void request.promise.then(() => {
      resolved = true
    })

    reportInitialRenderReady(request.requestId)
    await request.promise
    expect(resolved).toBe(true)
  })

  it('ignores a report for a stale request id', async () => {
    const first = requestInitialRenderReady()
    const second = requestInitialRenderReady()

    let firstResolved = false
    void first.promise.then(() => {
      firstResolved = true
    })

    // Reporting the superseded request must not resolve anything.
    reportInitialRenderReady(first.requestId)
    await Promise.resolve()
    expect(firstResolved).toBe(false)

    reportInitialRenderReady(second.requestId)
    await second.promise
  })

  it('is idempotent for repeated reports of the same request', async () => {
    const request = requestInitialRenderReady()
    reportInitialRenderReady(request.requestId)
    reportInitialRenderReady(request.requestId)
    await request.promise
  })
})
