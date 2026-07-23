import { useLayoutEffect } from 'react'

import { waitForPatch9ImagesReady } from '../../../shared/lib/patch9/patch9ImageRenderer'
import { reportInitialRenderReady } from '../systems/initialRenderReady'
import { useBootstrapRenderRequestId } from './useBootstrapRenderRequestId'

/**
 * Call from the app's first meaningful screen. It waits for two animation
 * frames, then for every pending Patch9 image render before telling the gate
 * the app is visually ready.
 *
 * If render gating is disabled (request id 0) this is a no-op.
 */
export function useReportInitialRenderReady(): void {
  const requestId = useBootstrapRenderRequestId()

  useLayoutEffect(() => {
    if (requestId === 0) {
      return
    }

    let isCancelled = false
    let firstFrame = 0
    let secondFrame = 0

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        void waitForPatch9ImagesReady().then(() => {
          if (!isCancelled) {
            reportInitialRenderReady(requestId)
          }
        })
      })
    })

    return () => {
      isCancelled = true
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [requestId])
}
