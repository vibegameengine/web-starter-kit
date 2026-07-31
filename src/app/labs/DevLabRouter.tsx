import { Suspense, lazy, useMemo } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { LabsScreen } from '../ui/labs/LabsScreen'
import { DEV_LABS } from './labRegistry'

/**
 * The DEV lab router — one route tree for every lab, built from the registry.
 *
 * The whole subtree hangs off a single dynamic import in the app router, which
 * is what keeps labs (and the preview images they carry) out of the production
 * bundle: one guard in one place instead of a guard per lab that someone will
 * eventually forget.
 *
 * Nothing here is hand-written per lab. Adding a lab is adding its manifest.
 */
export default function DevLabRouter() {
  // `lazy()` identities must be stable across renders or React remounts the
  // screen — and a remounted lab loses its whole tuning session.
  const screens = useMemo(
    () => DEV_LABS.map((lab) => ({ Screen: lazy(lab.load), id: lab.id })),
    [],
  )

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route index element={<LabsScreen />} />
        {screens.map(({ Screen, id }) => (
          <Route element={<Screen />} key={id} path={id} />
        ))}
        {/* An unknown lab id lands on the index, which is the only place that
            can tell you which ids exist. */}
        <Route element={<Navigate replace to="/labs" />} path="*" />
      </Routes>
    </Suspense>
  )
}
