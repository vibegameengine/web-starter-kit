import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'

import { triggerHaptic } from '../../../../shared/lib/input/haptics'
import styles from './TouchActionButton.module.css'

type TouchActionButtonProps = {
  readonly accent?: string
  readonly children?: ReactNode
  readonly className?: string
  readonly cooldownFraction?: number
  readonly disabled?: boolean
  readonly label: string
  readonly onPress: () => void
  readonly style?: CSSProperties
}

/** Low-latency mobile action control with pointer capture and a cooldown wipe. */
export function TouchActionButton({ accent = '#6faed8', children, className, cooldownFraction = 0, disabled = false, label, onPress, style }: TouchActionButtonProps) {
  const [pressed, setPressed] = useState(false)
  const pointerId = useRef<number | null>(null)
  const reset = () => { pointerId.current = null; setPressed(false) }
  const end = (event: ReactPointerEvent<HTMLButtonElement>) => { if (pointerId.current === event.pointerId) reset() }

  return <button aria-label={label} className={[styles.button, pressed ? styles.pressed : '', className].filter(Boolean).join(' ')} disabled={disabled} style={{ '--accent': accent, '--cooldown': `${Math.min(1, Math.max(0, cooldownFraction)) * 360}deg`, ...style } as CSSProperties} type="button" onPointerDown={(event) => { if (disabled || pointerId.current !== null) return; pointerId.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); setPressed(true); triggerHaptic(10); onPress(); event.preventDefault() }} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}><span className={styles.content}>{children}</span>{cooldownFraction > 0 ? <span aria-hidden className={styles.cooldown} /> : null}</button>
}
