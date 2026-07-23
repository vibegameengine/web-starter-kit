import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

import type { Patch9Config } from './Patch9.types'
import {
  releasePatch9Image,
  retainPatch9Image,
  type Patch9ImageSource,
} from './patch9ImageRenderer'

type RenderedImage = {
  readonly cacheKey: string
  readonly url: string | null
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Canvas Patch9 output for a semantic DOM control. This is not a UI component. */
export function usePatch9Background(patch9: Patch9Config): {
  readonly elementRef: RefObject<HTMLElement | null>
  readonly style: CSSProperties
} {
  const elementRef = useRef<HTMLElement | null>(null)
  const renderedImageRef = useRef<RenderedImage | null>(null)
  const [source, setSource] = useState<Patch9ImageSource | null>(null)
  const [elementSize, setElementSize] = useState<{ height: number; width: number } | null>(null)
  const [renderedImage, setRenderedImage] = useState<string | null>(null)

  useIsomorphicLayoutEffect(() => {
    const image = new Image()
    image.src = patch9.image
    const onLoad = () => setSource({ image, height: image.naturalHeight, width: image.naturalWidth })

    if (image.complete) onLoad()
    else image.addEventListener('load', onLoad)

    return () => image.removeEventListener('load', onLoad)
  }, [patch9.image])

  useIsomorphicLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return

    const updateSize = () => {
      const next = { height: Math.max(1, Math.round(element.offsetHeight)), width: Math.max(1, Math.round(element.offsetWidth)) }
      setElementSize((current) => current?.width === next.width && current.height === next.height ? current : next)
    }
    const observer = new ResizeObserver(updateSize)
    updateSize()
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useIsomorphicLayoutEffect(() => {
    if (!source || !elementSize) return
    const retained = retainPatch9Image({ elementSize, patch9, source })
    let current = true

    void retained.promise.then((url) => {
      if (!current) {
        releasePatch9Image(retained.cacheKey)
        return
      }
      setRenderedImage((previous) => {
        const previousRender = renderedImageRef.current
        if (previousRender?.cacheKey === retained.cacheKey) {
          releasePatch9Image(retained.cacheKey)
          return previous
        }
        releasePatch9Image(previousRender?.cacheKey ?? null)
        renderedImageRef.current = { cacheKey: retained.cacheKey, url }
        return url
      })
    })

    return () => { current = false }
  }, [elementSize, patch9, source])

  useEffect(() => () => {
    releasePatch9Image(renderedImageRef.current?.cacheKey ?? null)
    renderedImageRef.current = null
  }, [])

  return {
    elementRef,
    style: {
      backgroundImage: renderedImage ? `url('${renderedImage}')` : 'none',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: '100% 100%',
      color: patch9.textColor,
    },
  }
}
