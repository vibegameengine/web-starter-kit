import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

import { triggerHaptic } from '../../../../shared/lib/input/haptics'
import styles from './VirtualStick.module.css'

export type VirtualStickVector = { x: number; y: number }

type VirtualStickProps = {
  readonly className?: string
  readonly fullMagnitude?: boolean
  readonly label: string
  readonly onChange: (vector: VirtualStickVector) => void
  readonly onEnd?: () => void
  readonly style?: CSSProperties
}

/** Generic floating analog stick. It owns pointer safety; the caller owns intent. */
export function VirtualStick({ className, fullMagnitude = false, label, onChange, onEnd, style }: VirtualStickProps) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const nubRef = useRef<HTMLDivElement>(null)
  const pointerId = useRef<number | null>(null)
  const origin = useRef({ x: 0, y: 0 })
  const onChangeRef = useRef(onChange)
  const onEndRef = useRef(onEnd)

  useLayoutEffect(() => { onChangeRef.current = onChange; onEndRef.current = onEnd }, [onChange, onEnd])

  const reset = useCallback((expectedPointerId?: number) => {
    if (pointerId.current === null || (expectedPointerId !== undefined && pointerId.current !== expectedPointerId)) return
    pointerId.current = null
    if (nubRef.current) nubRef.current.style.transform = 'translate(-50%, -50%)'
    onChangeRef.current({ x: 0, y: 0 })
    onEndRef.current?.()
  }, [])

  useEffect(() => {
    const end = (event: PointerEvent) => reset(event.pointerId)
    const cancel = () => reset()
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
    window.addEventListener('blur', cancel)
    window.addEventListener('pagehide', cancel)
    return () => {
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('pagehide', cancel)
      cancel()
    }
  }, [reset])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== null) return
    pointerId.current = event.pointerId
    origin.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    triggerHaptic()
    event.preventDefault()
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId) return
    const dx = event.clientX - origin.current.x
    const dy = event.clientY - origin.current.y
    const distance = Math.hypot(dx, dy)
    const visual = Math.min(distance, 34)
    const x = distance > 0 ? dx / distance : 0
    const y = distance > 0 ? -dy / distance : 0
    if (nubRef.current) nubRef.current.style.transform = `translate(calc(-50% + ${x * visual}px), calc(-50% + ${-y * visual}px))`
    onChange({ x: fullMagnitude && distance > 8 ? x : Math.max(-1, Math.min(1, dx / 60)), y: fullMagnitude && distance > 8 ? y : Math.max(-1, Math.min(1, -dy / 60)) })
  }

  return <div ref={zoneRef} aria-label={label} className={[styles.zone, className].filter(Boolean).join(' ')} role="application" style={style} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={(event) => reset(event.pointerId)} onPointerCancel={(event) => reset(event.pointerId)} onLostPointerCapture={(event) => reset(event.pointerId)}><div className={styles.base}><div ref={nubRef} className={styles.nub} /></div></div>
}
