// Re-encoded by audioAssetOptimizerPlugin at build time (128 kbps -> mono 64 kbps).
import chimeUrl from './assets/audio/chime.mp3'
// @ts-expect-error vite-imagetools query import resolves at build time.
import mascotUrl from './assets/mascot.png?w=192&format=webp'
import styles from './DemoScreen.module.css'

import { APP_VERSION } from '../config/appVersion'
import {
  getBlockingBootstrapAssets,
  useReportInitialRenderReady,
} from '../bootstrap'

const PIPELINE_FEATURES = [
  'Auto-collected asset preloader (virtual:bootstrap-assets)',
  'Two-stage readiness gate (overlay → hidden mount → first-frame reveal)',
  'Build-time MP3 optimizer with clip-safe normalization',
  'Image transforms (vite-imagetools) + lossy optimization',
  'Imagetools dev-cache middleware',
  'React Compiler via Babel preset',
  'Version constant injected from package.json',
]

export function DemoScreen() {
  // Dismisses the bootstrap overlay once this screen paints its first frame.
  useReportInitialRenderReady()

  const bootstrapAssets = getBlockingBootstrapAssets()

  return (
    <main className={styles.screen}>
      <section className={styles.card}>
        <header className={styles.header}>
          <img
            alt=""
            className={styles.logo}
            decoding="async"
            draggable="false"
            src={mascotUrl}
          />
          <div>
            <h1 className={styles.title}>Web Starter Kit</h1>
            <p className={styles.version}>v{APP_VERSION}</p>
          </div>
        </header>

        <p className={styles.lede}>
          A working slice of the Vite pipeline. Everything below the fold was
          preloaded through the readiness gate before this screen was revealed.
        </p>

        <button className={styles.soundButton} onClick={playChime} type="button">
          ▶ Play optimized chime
        </button>

        <ul className={styles.features}>
          {PIPELINE_FEATURES.map((feature) => (
            <li key={feature} className={styles.feature}>
              {feature}
            </li>
          ))}
        </ul>

        <section>
          <h2 className={styles.subhead}>
            Blocking assets collected at build time ({bootstrapAssets.length})
          </h2>
          <ul className={styles.assets}>
            {bootstrapAssets.map((asset) => (
              <li key={asset.id} className={styles.asset}>
                <span className={styles.assetKind}>{asset.kind}</span>
                <span className={styles.assetSource}>{asset.source}</span>
                <span className={styles.assetSize}>{formatBytes(asset.size)}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  )
}

function playChime() {
  void new Audio(chimeUrl).play().catch(() => {
    // Ignore autoplay/user-gesture rejections; playback is a demo affordance.
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kib = bytes / 1024
  if (kib < 1024) {
    return `${kib.toFixed(1)} KB`
  }

  return `${(kib / 1024).toFixed(1)} MB`
}
