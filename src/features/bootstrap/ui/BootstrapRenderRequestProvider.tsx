import type { ReactNode } from 'react'
import { BootstrapRenderRequestContext } from './BootstrapRenderContext'

type BootstrapRenderRequestProviderProps = {
  children: ReactNode
  requestId: number
}

export function BootstrapRenderRequestProvider({
  children,
  requestId,
}: BootstrapRenderRequestProviderProps) {
  return (
    <BootstrapRenderRequestContext.Provider value={requestId}>
      {children}
    </BootstrapRenderRequestContext.Provider>
  )
}
