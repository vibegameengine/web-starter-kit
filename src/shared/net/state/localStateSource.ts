import { mergeEntity, type NetEntity, type StateSource, type StateSourceHandlers } from './netState'

/**
 * A `StateSource` with NO network — single-player. `publish` just writes into the local
 * map; `peers()` is only us. The read API is identical to `TransportStateSource`, so the
 * exact same game code runs offline: the owner of every entity is simply this client.
 * This is the "источник состояния — либо транспорт, либо локальная сессия" split.
 */
export class LocalStateSource implements StateSource {
  readonly localId = 'local'
  private readonly store = new Map<string, NetEntity>()
  private onChange?: () => void

  peers(): string[] {
    return [this.localId]
  }

  entities(): Map<string, NetEntity> {
    return this.store
  }

  connect(handlers: StateSourceHandlers): void {
    this.onChange = handlers.onChange
  }

  disconnect(): void {
    this.store.clear()
  }

  publish(entity: NetEntity): void {
    const cur = this.store.get(entity.id)
    if (cur) {
      mergeEntity(cur, entity)
    } else {
      this.store.set(entity.id, entity)
      this.onChange?.()
    }
  }

  remove(id: string): void {
    if (this.store.delete(id)) this.onChange?.()
  }
}
