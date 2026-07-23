import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { GameScreen } from '../../features/world'

// DEV-only character lab. It is tree-shaken from production builds.
const ENABLE_DEBUG_ROUTES = import.meta.env.DEV

const CharacterDebugScreen = ENABLE_DEBUG_ROUTES
  ? lazy(async () => {
      const module = await import('../../features/character/ui/CharacterDebugScreen')
      return { default: module.CharacterDebugScreen }
    })
  : null

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

          {CharacterDebugScreen ? (
            <Route path="/character-debug" element={<CharacterDebugScreen />} />
          ) : null}

          <Route path="/ui-kit/*" element={<UiKitGallery />} />

          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
