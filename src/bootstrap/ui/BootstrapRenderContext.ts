import { createContext } from 'react'

/** The active initial-render request id, or 0 when render gating is disabled. */
export const BootstrapRenderRequestContext = createContext(0)
