import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { GameScreen } from '../../features/world'

// DEV-only debug routes. In a production build they're tree-shaken away, and the
// dead-code screens they host (the pipeline demo) never ship.
const ENABLE_DEBUG_ROUTES = import.meta.env.DEV

const CharacterDebugScreen = ENABLE_DEBUG_ROUTES
  ? lazy(async () => {
      const module = await import('../../features/character/ui/CharacterDebugScreen')
      return { default: module.CharacterDebugScreen }
    })
  : null

const DemoScreen = ENABLE_DEBUG_ROUTES
  ? lazy(async () => {
      const module = await import('../../features/pipeline-demo/ui/DemoScreen')
      return { default: module.DemoScreen }
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
          {DemoScreen ? <Route path="/pipeline-demo" element={<DemoScreen />} /> : null}

          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
