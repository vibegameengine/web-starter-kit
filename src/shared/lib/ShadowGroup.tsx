import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Group } from 'three'

import { tagShadowKind, type ShadowKind } from './shadowLayers'

/**
 * Wraps a subtree and tags every object in it as a static or dynamic shadow
 * caster (see shadowLayers.ts). This is what ShadowCompositor reads to bake the
 * world's shadows once and redraw only the movers, so the tag is load-bearing:
 * a building left out of the static group is re-rendered every frame.
 *
 *   <ShadowGroup kind="static">…world geometry…</ShadowGroup>
 *   <ShadowGroup kind="dynamic">…players / monsters…</ShadowGroup>
 *
 * Tagging runs once on mount (and if `kind` changes). Objects spawned into the
 * scene later should live inside their own ShadowGroup, or be tagged imperatively
 * with `tagShadowKind` on spawn; anything left untagged is treated as dynamic,
 * which costs a redraw but never loses a shadow.
 */
export function ShadowGroup({
  kind,
  children,
}: {
  kind: ShadowKind
  children: ReactNode
}) {
  const ref = useRef<Group>(null)

  useLayoutEffect(() => {
    if (ref.current) {
      tagShadowKind(ref.current, kind)
    }
  }, [kind])

  return <group ref={ref}>{children}</group>
}
