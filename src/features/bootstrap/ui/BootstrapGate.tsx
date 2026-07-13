import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import styles from './BootstrapGate.module.css'

import type { BootstrapLocale } from '../localization/register'
import { getInitialBootstrapLocale, useBootstrapI18n } from '../localization/useBootstrapI18n'
import type { BootstrapStep } from '../systems/bootstrapSteps'
import { requestInitialRenderReady } from '../systems/initialRenderReady'
import { preloadBootstrapAssets } from '../systems/preloadBootstrapAssets'
import {
  shouldMountAppForBootstrapPhase,
  type BootstrapPhase,
} from '../systems/bootstrapPhase'
import {
  createBootstrapProgressPlan,
  getBootstrapProgress,
  getNextBootstrapProgress,
} from '../systems/bootstrapProgress'
import { BootstrapRenderRequestProvider } from './BootstrapRenderRequestProvider'
import { BootstrapPreloader } from './BootstrapPreloader'

export type BootstrapLabels = {
  progress?: string
  retry?: string
}

export type BootstrapOverlayState = {
  error: string | null
  onRetry: (() => void) | null
  phase: BootstrapPhase
  progress: number
  progressLabel: string
  retryLabel: string
}

export type BootstrapGateProps = {
  children: ReactNode
  /** Async stages that run before asset preload (platform SDK, locale, fonts…). */
  prepareSteps?: readonly BootstrapStep[]
  /** Async stages that run after asset preload (hydrate a saved profile…). */
  finalizeSteps?: readonly BootstrapStep[]
  /**
   * When true (default), the overlay stays up until the mounted app calls
   * `useReportInitialRenderReady()`, i.e. until the first real frame is painted.
   */
  waitForInitialRender?: boolean
  labels?: BootstrapLabels
  /** Called once, after the app is ready and the overlay has been dismissed. */
  onReady?: () => void
  /** Replace the default preloader overlay. */
  renderOverlay?: (state: BootstrapOverlayState) => ReactNode
}

type BootstrapViewModel = {
  detail: string | null
  error: string | null
  locale: BootstrapLocale
  phase: BootstrapPhase
  progress: number
  renderRequestId: number
  retryToken: number
}

const OVERLAY_FADE_MS = 420

export function BootstrapGate({
  children,
  prepareSteps,
  finalizeSteps,
  waitForInitialRender = true,
  labels,
  onReady,
  renderOverlay,
}: BootstrapGateProps) {
  const [isOverlayVisible, setIsOverlayVisible] = useState(true)
  const hasNotifiedReadyRef = useRef(false)
  const [viewModel, setViewModel] = useState<BootstrapViewModel>({
    detail: null,
    error: null,
    locale: getInitialBootstrapLocale(),
    phase: prepareSteps && prepareSteps.length > 0 ? 'prepare' : 'assets',
    progress: 0,
    renderRequestId: 0,
    retryToken: 0,
  })

  const { t } = useBootstrapI18n(viewModel.locale)
  const retryLabel = labels?.retry ?? t('retry')
  const resolvedProgressLabel = labels?.progress ?? t('progressLabel')

  const plan = useMemo(
    () =>
      createBootstrapProgressPlan({
        hasPrepareSteps: (prepareSteps?.length ?? 0) > 0,
        hasFinalizeSteps: (finalizeSteps?.length ?? 0) > 0,
      }),
    [prepareSteps, finalizeSteps],
  )

  // The pipeline runs off refs so a parent re-render never restarts bootstrap;
  // only an explicit retry (retryToken) does.
  const pipelineRef = useRef({ prepareSteps, finalizeSteps, waitForInitialRender, plan })
  pipelineRef.current = { prepareSteps, finalizeSteps, waitForInitialRender, plan }

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    async function runBootstrap() {
      const { prepareSteps: prepare, finalizeSteps: finalize, waitForInitialRender: gateRender, plan: progressPlan } =
        pipelineRef.current

      try {
        await runSteps(prepare, 'prepare', progressPlan, signal, setViewModel)
        if (signal.aborted) {
          return
        }

        setViewModel((current) => ({
          ...current,
          phase: 'assets',
          progress: getNextBootstrapProgress(current.progress, getBootstrapProgress('assets', 0, progressPlan)),
        }))

        await preloadBootstrapAssets((snapshot) => {
          if (signal.aborted) {
            return
          }

          const fraction = snapshot.totalWeight > 0 ? snapshot.completedWeight / snapshot.totalWeight : 1
          setViewModel((current) => ({
            ...current,
            detail: snapshot.currentAssetSource,
            phase: 'assets',
            progress: getNextBootstrapProgress(current.progress, getBootstrapProgress('assets', fraction, progressPlan)),
          }))
        })
        if (signal.aborted) {
          return
        }

        await runSteps(finalize, 'finalize', progressPlan, signal, setViewModel)
        if (signal.aborted) {
          return
        }

        if (gateRender) {
          const renderReadyRequest = requestInitialRenderReady()

          setViewModel((current) => ({
            ...current,
            detail: null,
            phase: 'render',
            progress: getNextBootstrapProgress(current.progress, getBootstrapProgress('render', 0, progressPlan)),
            renderRequestId: renderReadyRequest.requestId,
          }))

          await renderReadyRequest.promise
          if (signal.aborted) {
            return
          }
        }

        setViewModel((current) => ({
          ...current,
          detail: null,
          error: null,
          phase: 'ready',
          progress: 1,
        }))
      } catch (error) {
        if (signal.aborted) {
          return
        }

        setViewModel((current) => ({
          ...current,
          error: getErrorMessage(error),
          phase: 'failed',
        }))
      }
    }

    void runBootstrap()

    return () => {
      controller.abort()
    }
    // Only an explicit retry restarts the pipeline; live config is read from the ref.
  }, [viewModel.retryToken])

  useEffect(() => {
    if (viewModel.phase !== 'ready' || isOverlayVisible || hasNotifiedReadyRef.current) {
      return
    }

    hasNotifiedReadyRef.current = true
    onReady?.()
  }, [isOverlayVisible, viewModel.phase, onReady])

  useEffect(() => {
    if (viewModel.phase !== 'ready') {
      setIsOverlayVisible(true)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setIsOverlayVisible(false)
    }, OVERLAY_FADE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [viewModel.phase])

  const overlayState: BootstrapOverlayState = {
    error: viewModel.error,
    onRetry: viewModel.phase === 'failed' ? handleRetry : null,
    phase: viewModel.phase,
    progress: viewModel.progress,
    progressLabel: resolvedProgressLabel,
    retryLabel,
  }

  return (
    <div className={styles.shell}>
      <div className={`${styles.appLayer} ${viewModel.phase === 'ready' ? styles.appReady : ''}`}>
        {shouldMountAppForBootstrapPhase(viewModel.phase) ? (
          <BootstrapRenderRequestProvider requestId={viewModel.renderRequestId}>
            {children}
          </BootstrapRenderRequestProvider>
        ) : null}
      </div>

      <div
        aria-hidden={!isOverlayVisible}
        className={`${styles.overlay} ${viewModel.phase === 'ready' ? styles.overlayClosing : ''} ${
          isOverlayVisible ? '' : styles.overlayClosed
        }`}
      >
        {renderOverlay ? (
          renderOverlay(overlayState)
        ) : (
          <BootstrapPreloader
            error={overlayState.error}
            onRetry={overlayState.onRetry}
            progress={overlayState.progress}
            progressLabel={overlayState.progressLabel}
            retryLabel={overlayState.retryLabel}
          />
        )}
      </div>
    </div>
  )

  function handleRetry() {
    hasNotifiedReadyRef.current = false
    setIsOverlayVisible(true)
    const hasPrepareSteps = (pipelineRef.current.prepareSteps?.length ?? 0) > 0
    setViewModel((current) => ({
      detail: null,
      error: null,
      locale: current.locale,
      phase: hasPrepareSteps ? 'prepare' : 'assets',
      progress: 0,
      renderRequestId: 0,
      retryToken: current.retryToken + 1,
    }))
  }
}

async function runSteps(
  steps: readonly BootstrapStep[] | undefined,
  phase: 'prepare' | 'finalize',
  plan: ReturnType<typeof createBootstrapProgressPlan>,
  signal: AbortSignal,
  setViewModel: React.Dispatch<React.SetStateAction<BootstrapViewModel>>,
): Promise<void> {
  if (!steps || steps.length === 0) {
    return
  }

  setViewModel((current) => ({
    ...current,
    phase,
    progress: getNextBootstrapProgress(current.progress, getBootstrapProgress(phase, 0, plan)),
  }))

  for (let index = 0; index < steps.length; index += 1) {
    await steps[index].run(signal)
    if (signal.aborted) {
      return
    }

    const fraction = (index + 1) / steps.length
    setViewModel((current) => ({
      ...current,
      phase,
      progress: getNextBootstrapProgress(current.progress, getBootstrapProgress(phase, fraction, plan)),
    }))
  }
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return null
}
