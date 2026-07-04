import styles from './BootstrapPreloader.module.css'

type BootstrapPreloaderProps = {
  error: string | null
  onRetry: (() => void) | null
  progress: number
  progressLabel: string
  retryLabel: string
}

/**
 * Dependency-free default overlay: a CSS-only logo mark plus a progress bar and
 * an optional error + retry affordance. Swap it for your own via
 * `BootstrapGate`'s `renderOverlay` prop.
 */
export function BootstrapPreloader({
  error,
  onRetry,
  progress,
  progressLabel,
  retryLabel,
}: BootstrapPreloaderProps) {
  const progressPercent = Math.max(0, Math.min(100, Math.round(progress * 100)))

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-live="polite">
        <div className={styles.markHalo} aria-hidden="true">
          <div className={styles.mark} />
        </div>

        <div
          aria-label={progressLabel}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progressPercent}
          className={styles.progressTrack}
          role="progressbar"
        >
          <div
            className={styles.progressFill}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {error && onRetry ? (
          <div className={styles.actions}>
            <p className={styles.error}>{error}</p>
            <button className={styles.retryButton} onClick={onRetry} type="button">
              {retryLabel}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
