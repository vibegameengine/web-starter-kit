import type { NetTransport } from '../transport'
import {
  EV_ENTITY,
  EV_ENTITY_REMOVE,
  mergeEntity,
  type NetEntity,
  type StateSource,
  type StateSourceHandlers,
} from './netState'

/**
 * A `StateSource` that replicates entities over any `NetTransport` (Photon or loopback).
 * Dumb on purpose: it only replicates entity blobs and tracks presence — all ownership,
 * migration, and simulation policy live in the game layer above. An owner's `publish`
 * broadcasts its entity to Others; receivers merge it (newest `rev` wins) into the shared
 * map. Membership changes (new/removed entity, peer join/leave) fire `onChange`.
 */
export class TransportStateSource implements StateSource {
  private readonly transport: NetTransport
  private readonly store = new Map<string, NetEntity>()
  private onChange?: () => void

  constructor(transport: NetTransport) {
    this.transport = transport
  }

  get localId(): string {
    return this.transport.localClientId
  }

  peers(): string[] {
    return this.transport.actors.map((a) => a.clientId)
  }

  entities(): Map<string, NetEntity> {
    return this.store
  }

  connect(handlers: StateSourceHandlers): void {
    this.onChange = handlers.onChange
    this.transport.connect({
      onEvent: (code, data) => {
        if (code === EV_ENTITY) {
          const incoming = data as NetEntity
          const cur = this.store.get(incoming.id)
          if (!cur) {
            this.store.set(incoming.id, incoming)
            this.onChange?.()
          } else if (incoming.rev >= cur.rev) {
            mergeEntity(cur, incoming)
          }
        } else if (code === EV_ENTITY_REMOVE) {
          const { id } = data as { id: string }
          if (this.store.delete(id)) this.onChange?.()
        }
      },
      onActorsChange: () => this.onChange?.(),
    })
  }

  disconnect(): void {
    this.transport.disconnect()
    this.store.clear()
  }

  publish(entity: NetEntity): void {
    const cur = this.store.get(entity.id)
    if (cur) {
      mergeEntity(cur, entity)
    } else {
      this.store.set(entity.id, entity)
      this.onChange?.() // a new entity we own just appeared — refresh the render list
    }
    this.transport.raiseEvent(EV_ENTITY, entity, 'others')
  }

  remove(id: string): void {
    if (this.store.delete(id)) {
      this.transport.raiseEvent(EV_ENTITY_REMOVE, { id }, 'others')
      this.onChange?.()
    }
  }
}
