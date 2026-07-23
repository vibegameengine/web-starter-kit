/**
 * Framework-free networking transport contract (ECS "system" layer, shared infra).
 *
 * This interface is intentionally shaped like Photon Realtime's `LoadBalancingClient`
 * so a real `PhotonTransport` can drop in later without touching gameplay code:
 *  - actors carry a server-assigned `actorNr`; the lowest is the MASTER (our host),
 *  - `raiseEvent(code, data, receivers)` is the only message primitive,
 *  - everything above the transport (protocol, host sim, interpolation) is transport-
 *    agnostic and lives in `features/multiplayer`.
 *
 * The first shipped implementation is `LoopbackTransport` (BroadcastChannel), which
 * gives us TWO genuinely independent clients across two browser tabs — enough to
 * headed-test the host-authoritative loop today, with no Photon AppID or SDK yet.
 */

/** A participant in the room. Mirrors a Photon "actor". */
export interface NetActor {
  /** Ordering number; the actor with the smallest `actorNr` is the master/host. */
  actorNr: number
  /** Stable per-connection id — gameplay keys players by this, never by `actorNr`. */
  clientId: string
  /** True for this tab's own actor. */
  isLocal: boolean
}

/** Who a raised event is delivered to. Mirrors Photon's ReceiverGroup. */
export type Receivers =
  /** Everyone else in the room (not the sender). */
  | 'others'
  /** Everyone including the sender (the sender gets it via `onEvent` too). */
  | 'all'
  /** Only the current master/host. */
  | 'master'

/** Callbacks registered when joining a room. */
export interface NetHandlers {
  /** A game event arrived (including our own when receivers = 'all'/'master'). */
  onEvent?: (code: number, data: unknown, senderClientId: string) => void
  /** The roster or master changed (join, leave, or master hand-off). */
  onActorsChange?: (actors: readonly NetActor[]) => void
}

export interface NetTransport {
  /** This tab's stable client id. */
  readonly localClientId: string
  /** Current roster, sorted by `actorNr` ascending (master first). */
  readonly actors: readonly NetActor[]
  /** True while this tab is the master/host. */
  readonly isMaster: boolean
  /** Client id of the current master, or null before the roster settles. */
  readonly masterClientId: string | null

  /** Join the room, register handlers, and start exchanging presence + events. */
  connect(handlers: NetHandlers): void
  /** Announce departure and tear everything down. */
  disconnect(): void
  /** Send a game event. `code` is an app-defined 1..199 opcode. */
  raiseEvent(code: number, data: unknown, receivers: Receivers): void
}
