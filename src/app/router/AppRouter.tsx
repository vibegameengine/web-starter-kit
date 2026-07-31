import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { GameScreen } from '../../features/world'

// The two inspection surfaces — the DEV lab index and the UI-kit gallery — ship
// together or not at all, behind `__SHOWCASE_SURFACES__` (declared in
// `vite-env.d.ts`, baked by the Vite config from `VITE_ENABLE_SHOWCASE`). Each is
// ONE dynamic import, so a single guard drops the whole surface, its screens and
// every asset it reaches: the lab previews, the bench mannequin, the gallery
// fixtures.
//
// The flag is used RAW here, not through a helper constant, and that is the
// point: only a literal at the branch lets the bundler evaluate it and drop the
// import. Behind a `const` in another module the same value stays opaque and the
// surface ships anyway — 7.9 MB against 3.4 MB, measured both ways.
//
// What the flag does NOT license: production code importing from a lab. That
// stays banned whether or not these routes ship.
const DevLabRouter = __SHOWCASE_SURFACES__ ? lazy(async () => import('../labs/DevLabRouter')) : null

const UiKitGallery = __SHOWCASE_SURFACES__
  ? lazy(async () => {
    const module = await import('../../features/ui-kit')
    return { default: module.UiKitGallery }
  })
  : null

const PAGES_REDIRECT_KEY = 'web-starter-kit:pages-redirect'
const configuredBaseName = import.meta.env.BASE_URL.replace(/\/$/, '')
const APP_BASE_NAME = configuredBaseName && configuredBaseName !== '.' ? configuredBaseName : undefined

function restoreGitHubPagesRoute() {
  const redirect = window.sessionStorage.getItem(PAGES_REDIRECT_KEY)
  if (!redirect || !APP_BASE_NAME || !redirect.startsWith(`${APP_BASE_NAME}/`)) return

  window.sessionStorage.removeItem(PAGES_REDIRECT_KEY)
  window.history.replaceState(null, '', redirect)
}

export function AppRouter() {
  restoreGitHubPagesRoute()

  return (
    <BrowserRouter basename={APP_BASE_NAME}>
      <Suspense fallback={null}>
        <Routes>
          {/* Main scene — the 3D starter/demo world. */}
          <Route path="/" element={<GameScreen />} />

          {UiKitGallery ? <Route path="/ui-kit/*" element={<UiKitGallery />} /> : null}

          {DevLabRouter ? <Route path="/labs/*" element={<DevLabRouter />} /> : null}

          {/* Where the character lab used to live. Kept so notes, probe scripts
              and bookmarks pointing at the old path keep working. */}
          {DevLabRouter ? (
            <Route path="/character-debug" element={<Navigate replace to="/labs/character-debug-lab" />} />
          ) : null}

          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
