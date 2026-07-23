import { Perf } from '@vibegameengine/r3f-perf'
import { useEffect, useState } from 'react'

/**
 * In-canvas performance overlay (r3f-perf): FPS / CPU / GPU / draw calls /
 * memory with live graphs — the classic three.js stats panel, upgraded.
 * Visible by default in dev; toggle any time with the "P" key.
 */
export function Debug() {
  const [show, setShow] = useState(import.meta.env.DEV)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'p' || event.key === 'P') {
        setShow((current) => !current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!show) {
    return null
  }

  return <Perf position="top-left" />
}
