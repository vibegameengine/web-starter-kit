import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'

import {
  orbitFromMouse,
  zoomedDistance,
  type OrbitState,
} from '../systems/cameraOrbit'

export type MouseLook = {
  readonly orbit: MutableRefObject<OrbitState>
  readonly yaw: MutableRefObject<number>
}

export const DEFAULT_ORBIT: OrbitState = { distance: 3.4, pitchRadians: 0.22, yawRadians: 0 }

const WHEEL_PIXELS_PER_NOTCH = 100

/* @important Two ways in on purpose. Pointer lock is the one that lets the
   mouse turn the camera for ever without the cursor leaving the canvas, but a
   browser may refuse it — it needs a gesture, it fails outright in an embedded
   document, and automation cannot have it at all — so holding the button and
   dragging turns the camera too. Without either, the aim yaw stayed at zero for
   the life of the lab: the camera never turned, and WASD pushed the body along
   the world axes. */
export function useMouseLook(): MouseLook {
  const canvas = useThree((state) => state.gl.domElement)
  const orbit = useRef<OrbitState>(DEFAULT_ORBIT)
  const yaw = useRef(DEFAULT_ORBIT.yawRadians)
  const dragging = useRef(false)

  useEffect(() => {
    const capture = () => {
      dragging.current = true
      if (document.pointerLockElement !== canvas) {
        const request = canvas.requestPointerLock() as unknown as Promise<void> | undefined
        if (request && typeof request.catch === 'function') request.catch(() => undefined)
      }
    }
    const release = () => {
      dragging.current = false
    }
    const look = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas && !dragging.current) return
      orbit.current = orbitFromMouse(orbit.current, event.movementX, event.movementY)
      yaw.current = orbit.current.yawRadians
    }
    const zoom = (event: WheelEvent) => {
      event.preventDefault()
      orbit.current = {
        ...orbit.current,
        distance: zoomedDistance(orbit.current.distance, event.deltaY / WHEEL_PIXELS_PER_NOTCH),
      }
    }

    canvas.addEventListener('mousedown', capture)
    window.addEventListener('mouseup', release)
    window.addEventListener('mousemove', look)
    canvas.addEventListener('wheel', zoom, { passive: false })
    if (import.meta.env.DEV) {
      const target = window as Window & { __motionLook?: () => OrbitState }
      target.__motionLook = () => orbit.current
    }
    return () => {
      canvas.removeEventListener('mousedown', capture)
      window.removeEventListener('mouseup', release)
      window.removeEventListener('mousemove', look)
      canvas.removeEventListener('wheel', zoom)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
    }
  }, [canvas])

  return useMemo(() => ({ orbit, yaw }), [])
}
