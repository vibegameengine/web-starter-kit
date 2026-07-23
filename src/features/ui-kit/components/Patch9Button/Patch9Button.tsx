import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactNode,
  RefObject,
} from 'react'

import './Patch9Button.css'
import type { Patch9Config } from '../../../../shared/lib/patch9/Patch9.types'
import {
  releasePatch9Image,
  retainPatch9Image,
  type Patch9ImageSource,
} from '../../../../shared/lib/patch9/patch9ImageRenderer'

type Props = {
  readonly children: ReactNode
  readonly patch9: Patch9Config
} & ButtonHTMLAttributes<HTMLButtonElement>

type SurfaceProps = {
  readonly children: ReactNode
  readonly patch9: Patch9Config
} & HTMLAttributes<HTMLSpanElement>

type Patch9ImageState = {
  readonly elementRef: RefObject<HTMLElement | null>
  readonly renderedImage: string | null
}

type Patch9RenderedImage = {
  readonly cacheKey: string
  readonly url: string | null
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function usePatch9Image(patch9: Patch9Config): Patch9ImageState {
  const elementRef = useRef<HTMLElement | null>(null)
  const renderedImageRef = useRef<Patch9RenderedImage | null>(null)
  const [source, setSource] = useState<Patch9ImageSource | null>(null)
  const [elementSize, setElementSize] = useState<{ height: number; width: number } | null>(null)
  const [renderedImage, setRenderedImage] = useState<string | null>(null)

  useIsomorphicLayoutEffect(() => {
    const image = new Image()
    image.src = patch9.image

    const handleLoad = () => {
      setSource({ image, height: image.naturalHeight, width: image.naturalWidth })
    }

    if (image.complete) {
      handleLoad()
      return
    }

    image.addEventListener('load', handleLoad)
    return () => image.removeEventListener('load', handleLoad)
  }, [patch9.image])

  useIsomorphicLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return

    const updateElementSize = () => {
      setElementSizeIfChanged({
        height: Math.max(1, Math.round(element.offsetHeight)),
        width: Math.max(1, Math.round(element.offsetWidth)),
      })
    }

    updateElementSize()

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return

      const borderBoxSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize
      setElementSizeIfChanged({
        height: Math.max(1, Math.round(borderBoxSize?.blockSize ?? element.offsetHeight)),
        width: Math.max(1, Math.round(borderBoxSize?.inlineSize ?? element.offsetWidth)),
      })
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useIsomorphicLayoutEffect(() => {
    if (!source || !elementSize) return

    const retainedImage = retainPatch9Image({ elementSize, patch9, source })
    let isCurrentRender = true

    void retainedImage.promise.then((nextImageUrl) => {
      if (!isCurrentRender) {
        releasePatch9Image(retainedImage.cacheKey)
        return
      }

      setRenderedImage((currentImageUrl) => {
        const currentRenderedImage = renderedImageRef.current
        if (currentRenderedImage?.cacheKey === retainedImage.cacheKey) {
          releasePatch9Image(retainedImage.cacheKey)
          return currentImageUrl
        }

        releasePatch9Image(currentRenderedImage?.cacheKey ?? null)
        renderedImageRef.current = { cacheKey: retainedImage.cacheKey, url: nextImageUrl }
        return nextImageUrl
      })
    })

    return () => {
      isCurrentRender = false
    }
  }, [elementSize, patch9, source])

  useEffect(() => {
    return () => {
      releasePatch9Image(renderedImageRef.current?.cacheKey ?? null)
      renderedImageRef.current = null
    }
  }, [])

  return { elementRef, renderedImage }

  function setElementSizeIfChanged(nextElementSize: { height: number; width: number }): void {
    setElementSize((currentElementSize) => {
      if (
        currentElementSize?.height === nextElementSize.height &&
        currentElementSize.width === nextElementSize.width
      ) {
        return currentElementSize
      }

      return nextElementSize
    })
  }
}

export function Patch9Button({ children, className, patch9, style, type = 'button', ...props }: Props) {
  const isDisabledTextureActive = Boolean(props.disabled && patch9.disabledImage)
  const activePatch9 = useMemo(
    () => isDisabledTextureActive && patch9.disabledImage ? { ...patch9, image: patch9.disabledImage } : patch9,
    [isDisabledTextureActive, patch9],
  )
  const { elementRef, renderedImage } = usePatch9Image(activePatch9)
  const classes = ['uiKitPatch9Button', className].filter(Boolean).join(' ')
  const patchStyle = {
    '--patch9-rendered-image': renderedImage ? `url('${renderedImage}')` : 'none',
    '--patch9-text-color': activePatch9.textColor,
    ...style,
  } as CSSProperties

  return (
    <button
      {...props}
      ref={elementRef as RefObject<HTMLButtonElement | null>}
      type={type}
      className={classes}
      data-disabled-texture={isDisabledTextureActive ? 'true' : undefined}
      style={patchStyle}
    >
      {children}
    </button>
  )
}

export function Patch9Surface({ children, className, patch9, style, ...props }: SurfaceProps) {
  const { elementRef, renderedImage } = usePatch9Image(patch9)
  const classes = ['uiKitPatch9Surface', className].filter(Boolean).join(' ')
  const patchStyle = {
    '--patch9-rendered-image': renderedImage ? `url('${renderedImage}')` : 'none',
    '--patch9-text-color': patch9.textColor,
    ...style,
  } as CSSProperties

  return (
    <span
      {...props}
      ref={elementRef as RefObject<HTMLSpanElement | null>}
      className={classes}
      style={patchStyle}
    >
      {children}
    </span>
  )
}
