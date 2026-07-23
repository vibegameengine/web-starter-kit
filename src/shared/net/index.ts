export type { NetActor, NetHandlers, NetTransport, Receivers } from './transport'
export { LoopbackTransport } from './loopbackTransport'
export { PhotonTransport } from './photonTransport'
export { createTransport } from './createTransport'

// Replicated state layer (the "one map everyone reads"; source = transport OR local).
export type { NetEntity, StateSource, StateSourceHandlers } from './state/netState'
export { TransportStateSource } from './state/transportStateSource'
export { LocalStateSource } from './state/localStateSource'
export { createStateSource } from './state/createStateSource'
