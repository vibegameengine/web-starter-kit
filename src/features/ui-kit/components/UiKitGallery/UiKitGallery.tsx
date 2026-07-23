import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { reportInitialRenderReady, useBootstrapRenderRequestId } from '../../../bootstrap'
import type { UiKitPreviewModule } from '../../systems/uiKitPreview'
import styles from './UiKitGallery.module.css'

const previewModules = import.meta.glob<UiKitPreviewModule>('../**/preview.tsx', { eager: true })
const previews = Object.values(previewModules)
  .map((module) => module.uiKitPreview)
  .sort((left, right) => left.title.localeCompare(right.title))

const MIN_SCALE = 0.25
const MAX_SCALE = 8
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** DEV gallery for visually validating every public UI-kit component in isolation. */
export function UiKitGallery() {
  const requestId = useBootstrapRenderRequestId()

  // This route has no WebGL warmup. Report after its first layout pass so the
  // bootstrap gate does not wait for a canvas-only readiness signal.
  useLayoutEffect(() => {
    if (requestId !== 0) reportInitialRenderReady(requestId)
  }, [requestId])

  const location = useLocation()
  const navigate = useNavigate()
  const requestedId = decodeURIComponent(location.pathname.replace(/^\/ui-kit\/?/, ''))
  const selectedPreview = previews.find((preview) => preview.id === requestedId) ?? previews[0]

  useEffect(() => {
    if (!selectedPreview || requestedId === selectedPreview.id) return
    navigate(`/ui-kit/${selectedPreview.id}`, { replace: true })
  }, [navigate, requestedId, selectedPreview])

  // --- Zoom & pan of the preview viewport --------------------------------
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  // Pan only while Space is held so dragging never conflicts with clicking the
  // preview's own controls (Figma-style).
  const [spaceHeld, setSpaceHeld] = useState(false)
  const spaceRef = useRef(false)
  const dragging = useRef(false)
  const moved = useRef(false)
  const last = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isTyping(event.target)) return
      event.preventDefault()
      spaceRef.current = true
      setSpaceHeld(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      spaceRef.current = false
      setSpaceHeld(false)
      dragging.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), [])
  // Reset the transform whenever a different component is selected.
  useEffect(() => reset(), [reset, selectedPreview?.id])

  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    setView((current) => {
      const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE)
      const k = scale / current.scale
      const px = cx ?? 0
      const py = cy ?? 0
      // Keep the point under the cursor (or origin) stationary while scaling.
      return { scale, x: px - (px - current.x) * k, y: py - (py - current.y) * k }
    })
  }, [])

  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    // Cursor relative to the viewport centre (transform-origin is centre).
    zoomBy(Math.exp(-event.deltaY * 0.0016), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2)
  }, [zoomBy])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!spaceRef.current) return // pan only while Space is held
    dragging.current = true
    moved.current = false
    last.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const dx = event.clientX - last.current.x
    const dy = event.clientY - last.current.y
    if (!moved.current && Math.hypot(dx, dy) < 4) return
    moved.current = true
    last.current = { x: event.clientX, y: event.clientY }
    setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
  }, [])

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  // Suppress the click that follows a real drag so panning never triggers a
  // preview control (nodes stay clickable when the pointer did not move).
  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (moved.current) { event.preventDefault(); event.stopPropagation() }
  }, [])

  if (!selectedPreview) {
    return <main className={styles.empty}>No UI-kit component previews are registered.</main>
  }

  return (
    <main className={styles.root}>
      <aside className={styles.sidebar}>
        <p className={styles.eyebrow}>UI-KIT</p>
        <h1 className={styles.title}>Components</h1>
        <Link className={styles.sceneLink} to="/">Open 3D scene ↗</Link>
        <nav className={styles.componentList} aria-label="UI kit components">
          {previews.map((preview) => (
            <button
              key={preview.id}
              type="button"
              aria-current={preview.id === selectedPreview.id ? 'page' : undefined}
              className={preview.id === selectedPreview.id ? styles.componentSelected : styles.component}
              onClick={() => navigate(`/ui-kit/${preview.id}`)}
            >
              {preview.title}
            </button>
          ))}
        </nav>
      </aside>
      <section className={styles.workspace} aria-label={`${selectedPreview.title} preview`}>
        <header className={styles.workspaceHeader}>
          <div>
            <p className={styles.eyebrow}>ISOLATED VISUAL CHECK</p>
            <h2>{selectedPreview.title}</h2>
            <p>{selectedPreview.description}</p>
          </div>
          <div id="ui-kit-inspector-controls" className={styles.headerControls} />
        </header>
        <div className={styles.canvas}>
          <div
            className={`${styles.viewport} ${spaceHeld ? styles.viewportPan : ''}`}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClickCapture={onClickCapture}
          >
            {/* Grid + preview share one transform, so the whole canvas pans and zooms together. */}
            <div className={styles.viewportContent} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
              <div className={styles.grid} aria-hidden="true" />
              <div className={styles.previewLayer}>{selectedPreview.render()}</div>
            </div>
          </div>
          <div className={styles.zoomControls} aria-label="Zoom controls">
            <span className={styles.zoomHint}>Hold Space to pan</span>
            <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
            <span className={styles.zoomValue}>{Math.round(view.scale * 100)}%</span>
            <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
            <button type="button" onClick={reset} aria-label="Reset view">Reset</button>
          </div>
        </div>
      </section>
    </main>
  )
}
