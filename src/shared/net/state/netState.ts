/**
 * The replicated state layer (framework-free shared infra) — the "one Map everyone
 * sees" that the game reads. It sits ABOVE the transport so gameplay never touches the
 * wire: you attach an entity with an owner, its owner publishes state, and every client
 * reads the same `entities()` map. Two interchangeable sources fill it — a networked one
 * (over any `NetTransport`) and a local one (single-player) — with an identical read API,
 * so the same game runs online or offline by swapping the source.
 *
 * Everything networked is one shape: a `NetEntity` with an `owner`. Players and NPCs are
 * the same mechanism — only the owner differs (your client, a peer, or a server later).
 */

/** A replicated game object. `state` is an opaque per-type data blob. */
export interface NetEntity<S = unknown> {
  id: string
  /** Drives which simulation/render a client applies ('player' | 'enemy' | …). */
  type: string
  /** Client id of the authority that produces this entity's state. */
  owner: string
  /** Monotonic revision; bumped on each owner update (ordering + staleness). */
  rev: number
  state: S
}

export interface StateSourceHandlers {
  /** Fired when the entity SET or peer roster changes (not on per-field updates). */
  onChange?: () => void
}

/**
 * The pluggable source of replicated state. The game reads `entities()`; the owner of an
 * entity calls `publish`/`remove`. Whether that travels over the network or stays local
 * is the source's business, not the game's.
 */
export interface StateSource {
  /** This client's id ('local' for the offline source). */
  readonly localId: string
  /** Live client ids (including self). */
  peers(): string[]
  /** The merged view everyone reads; mutated in place so render refs stay stable. */
  entities(): Map<string, NetEntity>

  connect(handlers: StateSourceHandlers): void
  disconnect(): void

  /** Upsert + replicate an entity you own. */
  publish(entity: NetEntity): void
  /** Despawn + replicate the removal. */
  remove(id: string): void
}

/** Opcodes carried over a `NetTransport` by `TransportStateSource`. */
export const EV_ENTITY = 1
export const EV_ENTITY_REMOVE = 2

/** Apply an incoming entity onto an existing one IN PLACE — both the wrapper AND its
 * `state` object keep their identity (fields copied), so render refs stay valid. */
export function mergeEntity(target: NetEntity, incoming: NetEntity): void {
  target.owner = incoming.owner
  target.rev = incoming.rev
  Object.assign(target.state as object, incoming.state as object)
}
