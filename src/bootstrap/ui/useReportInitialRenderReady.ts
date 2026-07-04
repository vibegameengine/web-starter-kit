import { useEffect } from 'react'

import { reportInitialRenderReady } from '../systems/initialRenderReady'
import { useBootstrapRenderRequestId } from './useBootstrapRenderRequestId'

/**
 * Call from the app's first meaningful screen. It waits for two animation
 * frames — long enough for the browser to actually paint the first frame — and
 * then tells the gate the app is visually ready, which dismisses the overlay.
 *
 * If render gating is disabled (request id 0) this is a no-op.
 */
export function useReportInitialRenderReady(): void {
  const requestId = useBootstrapRenderRequestId()

  useEffect(() => {
    if (requestId === 0) {
      return
    }

    let firstFrame = 0
    let secondFrame = 0

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        reportInitialRenderReady(requestId)
      })
    })

    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [requestId])
}
