import { useContext } from 'react'

import { BootstrapRenderRequestContext } from './BootstrapRenderContext'

export function useBootstrapRenderRequestId(): number {
  return useContext(BootstrapRenderRequestContext)
}
