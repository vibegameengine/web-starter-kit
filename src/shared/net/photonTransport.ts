import Photon from 'photon-realtime'

import type { NetActor, NetHandlers, NetTransport, Receivers } from './transport'

/**
 * A `NetTransport` backed by the real Photon Realtime cloud (the official
 * `photon-realtime` SDK). Implements the exact same interface as `LoopbackTransport`,
 * so the state layer and everything above it are unchanged — only the wire underneath
 * differs: BroadcastChannel (same-browser tabs) → Photon (real players over WSS).
 *
 * Mapping to Photon concepts:
 *  - a client id is the Photon `actorNr` (server-assigned, stable for the session),
 *  - the MASTER is `myRoomMasterActorNr()` — the same "lowest actor is host" rule the
 *    loopback approximates, so host migration is Photon's job,
 *  - receiver groups mirror the loopback semantics WITHOUT relying on Photon's
 *    self-echo: 'all' delivers locally + sends to Others; 'master' delivers locally
 *    when we are the master, else targets only the master actor.
 *
 * Connect flow: connectToRegionMaster → (ConnectedToMaster) → joinRoom(create-if-absent).
 */

// The `photon-realtime` npm build targets Node and force-sets `setWebSocketImpl` to a
// wrapper around the Node `ws` package. In the browser that wrapper throws — so restore
// the native `WebSocket` (the alias in vite.config keeps `ws` from breaking the bundle).
if (typeof WebSocket !== 'undefined') {
  Photon.PhotonPeer.setWebSocketImpl(WebSocket)
}

const Protocol = Photon.ConnectionProtocol
const ReceiverGroup = Photon.LoadBalancing.Constants.ReceiverGroup
const State = Photon.LoadBalancing.LoadBalancingClient.State

/** All clients that share a room MUST use the same app version to see each other. */
const APP_VERSION = '1.0'

export interface PhotonConfig {
  appId: string
  /** Best-region token: 'eu' | 'us' | 'asia' | … */
  region: string
  /** Room name; everyone using the same name lands in the same session. */
  roomName: string
  /** Max players in the room (coop 2-4). */
  maxPlayers?: number
}

export class PhotonTransport implements NetTransport {
  private readonly client: Photon.LoadBalancing.LoadBalancingClient
  private readonly config: PhotonConfig
  private handlers: NetHandlers = {}
  private cachedActors: NetActor[] = []
  private joinRequested = false

  constructor(config: PhotonConfig) {
    this.config = config
    this.client = new Photon.LoadBalancing.LoadBalancingClient(Protocol.Wss, config.appId, APP_VERSION)
    this.client.setLogLevel(2 /* WARN */)
  }

  get localClientId(): string {
    // Assigned only once we've joined a room; empty beforehand.
    const nr = this.client.isJoinedToRoom() ? this.client.myActor().actorNr : -1
    return nr > 0 ? String(nr) : ''
  }

  get actors(): readonly NetActor[] {
    return this.cachedActors
  }

  get masterClientId(): string | null {
    return this.client.isJoinedToRoom() ? String(this.client.myRoomMasterActorNr()) : null
  }

  get isMaster(): boolean {
    return this.client.isJoinedToRoom() && this.client.myActor().actorNr === this.client.myRoomMasterActorNr()
  }

  connect(handlers: NetHandlers): void {
    this.handlers = handlers
    const c = this.client

    c.onStateChange = (state) => {
      // Join (or create) the fixed room as soon as the master server is reachable.
      if (state === State.ConnectedToMaster && !this.joinRequested) {
        this.joinRequested = true
        c.joinRoom(
          this.config.roomName,
          { createIfNotExists: true },
          { maxPlayers: this.config.maxPlayers ?? 4 },
        )
      }
    }

    c.onJoinRoom = () => this.refreshActors()
    c.onActorJoin = () => this.refreshActors()
    c.onActorLeave = () => this.refreshActors()
    c.onEvent = (code, content, actorNr) => {
      this.handlers.onEvent?.(code, content, String(actorNr))
    }
    c.onError = (errorCode, errorMsg) => {
      console.warn(`[photon] error ${errorCode}: ${errorMsg}`)
    }

    c.connectToRegionMaster(this.config.region)
  }

  disconnect(): void {
    this.client.disconnect()
    this.cachedActors = []
  }

  raiseEvent(code: number, data: unknown, receivers: Receivers): void {
    // Mirror the loopback semantics exactly; do not depend on Photon's self-echo.
    if (receivers === 'all') {
      this.handlers.onEvent?.(code, data, this.localClientId)
      this.client.raiseEvent(code, data, { receivers: ReceiverGroup.Others })
      return
    }
    if (receivers === 'others') {
      this.client.raiseEvent(code, data, { receivers: ReceiverGroup.Others })
      return
    }
    // 'master'
    if (this.isMaster) {
      this.handlers.onEvent?.(code, data, this.localClientId)
    } else if (this.client.isJoinedToRoom()) {
      this.client.raiseEvent(code, data, { targetActors: [this.client.myRoomMasterActorNr()] })
    }
  }

  /** Rebuild the actor list from the room; fire `onActorsChange` on a real change. */
  private refreshActors(): void {
    if (!this.client.isJoinedToRoom()) return
    const master = this.client.myRoomMasterActorNr()
    const next: NetActor[] = this.client
      .myRoomActorsArray()
      .map((a) => ({ actorNr: a.actorNr, clientId: String(a.actorNr), isLocal: a.isLocal }))
      .sort((a, b) => a.actorNr - b.actorNr)

    const same =
      next.length === this.cachedActors.length &&
      next.every((a, i) => a.clientId === this.cachedActors[i]?.clientId) &&
      String(master) === this.masterClientId
    if (same) return

    this.cachedActors = next
    this.handlers.onActorsChange?.(next)
  }
}
