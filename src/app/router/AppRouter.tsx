import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { GameScreen } from '../../features/world'

// Every DEV lab lives under /labs and is routed by the registry, not by a block
// per lab copied into this file. One dynamic import is the whole DEV surface, so
// labs — and the preview images the index carries — are tree-shaken from
// production builds by a single guard instead of one per lab.
const ENABLE_DEBUG_ROUTES = import.meta.env.DEV

const DevLabRouter = ENABLE_DEBUG_ROUTES ? lazy(async () => import('../labs/DevLabRouter')) : null

// The gallery is part of the public starter-kit walkthrough: the scene links
// here so users can inspect the reusable controls in isolation.
const UiKitGallery = lazy(async () => {
  const module = await import('../../features/ui-kit')
  return { default: module.UiKitGallery }
})

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

          <Route path="/ui-kit/*" element={<UiKitGallery />} />

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
