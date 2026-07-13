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

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {/* Main scene — the 3D starter/demo world. */}
          <Route path="/" element={<GameScreen />} />

          {CharacterDebugScreen ? (
            <Route path="/character-debug" element={<CharacterDebugScreen />} />
          ) : null}

          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
