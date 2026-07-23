import type { NetActor, NetHandlers, NetTransport, Receivers } from './transport'

/**
 * A `NetTransport` backed by the browser's BroadcastChannel — messages hop between
 * TABS OF THE SAME BROWSER (same origin). No server, no Photon, no network: it exists
 * so the multiplayer host-authoritative loop can be built and headed-tested with two
 * real, independent clients TODAY. Swap it for `PhotonTransport` (same interface) once
 * a Photon AppID + the vendored SDK are in place; nothing above this file changes.
 *
 * Presence & master election (approximating Photon):
 *  - each tab has a random `clientId` and a `joinTime` (ms),
 *  - the roster is every tab we've heard from within `PRUNE_MS`,
 *  - actors are ordered by (joinTime, clientId); index+1 is the `actorNr`,
 *  - the smallest — earliest joiner — is the MASTER. If it leaves, the next becomes
 *    master automatically (our host migration), exactly like Photon's rule.
 */

interface RosterEntry {
  clientId: string
  joinTime: number
}

type Wire =
  | { kind: 'hello'; clientId: string; joinTime: number }
  | { kind: 'welcome'; clientId: string; joinTime: number }
  | { kind: 'bye'; clientId: string }
  | { kind: 'heartbeat'; clientId: string; joinTime: number }
  | {
      kind: 'event'
      code: number
      data: unknown
      senderClientId: string
      receivers: Receivers
      /** For receivers = 'master': the master this was aimed at when sent. */
      targetClientId?: string
    }

const HEARTBEAT_MS = 1000
/** Drop tabs we haven't heard from in this long (covers hard-closed tabs). */
const PRUNE_MS = 3000

export class LoopbackTransport implements NetTransport {
  readonly localClientId: string

  private channel: BroadcastChannel | null = null
  private readonly roster = new Map<string, RosterEntry>()
  private readonly lastSeen = new Map<string, number>()
  private readonly joinTime = Date.now()
  private timer = 0
  private cachedActors: NetActor[] = []
  private readonly roomName: string
  private handlers: NetHandlers = {}

  constructor(roomName: string) {
    this.roomName = roomName
    // crypto.randomUUID is available in every browser we target; fall back defensively.
    this.localClientId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `c-${this.joinTime}-${Math.floor(Math.random() * 1e9)}`
  }

  get actors(): readonly NetActor[] {
    return this.cachedActors
  }

  get masterClientId(): string | null {
    return this.cachedActors[0]?.clientId ?? null
  }

  get isMaster(): boolean {
    return this.masterClientId === this.localClientId
  }

  connect(handlers: NetHandlers): void {
    if (this.channel || typeof BroadcastChannel === 'undefined') return
    this.handlers = handlers
    this.channel = new BroadcastChannel(`web-starter-kit:net:${this.roomName}`)
    this.channel.onmessage = (e: MessageEvent<Wire>) => this.receive(e.data)

    // Seed ourselves, announce, and start the presence heartbeat.
    this.see(this.localClientId, this.joinTime)
    this.post({ kind: 'hello', clientId: this.localClientId, joinTime: this.joinTime })
    this.recomputeActors()

    this.timer = window.setInterval(() => {
      this.post({ kind: 'heartbeat', clientId: this.localClientId, joinTime: this.joinTime })
      this.prune()
    }, HEARTBEAT_MS)

    // Best-effort clean departure so peers drop us instantly instead of by timeout.
    window.addEventListener('beforeunload', this.byeOnUnload)
  }

  disconnect(): void {
    if (!this.channel) return
    this.post({ kind: 'bye', clientId: this.localClientId })
    window.clearInterval(this.timer)
    window.removeEventListener('beforeunload', this.byeOnUnload)
    this.channel.close()
    this.channel = null
    this.roster.clear()
    this.lastSeen.clear()
    this.cachedActors = []
  }

  raiseEvent(code: number, data: unknown, receivers: Receivers): void {
    // Deliver to ourselves first when we're a receiver, so the master sees its own
    // authoritative snapshots on the same code path as everyone else.
    if (receivers === 'all' || (receivers === 'master' && this.isMaster)) {
      this.handlers.onEvent?.(code, data, this.localClientId)
    }
    this.post({
      kind: 'event',
      code,
      data,
      senderClientId: this.localClientId,
      receivers,
      targetClientId: receivers === 'master' ? this.masterClientId ?? undefined : undefined,
    })
  }

  private byeOnUnload = () => {
    this.post({ kind: 'bye', clientId: this.localClientId })
  }

  private post(msg: Wire): void {
    this.channel?.postMessage(msg)
  }

  private see(clientId: string, joinTime: number): void {
    if (!this.roster.has(clientId)) this.roster.set(clientId, { clientId, joinTime })
    this.lastSeen.set(clientId, Date.now())
  }

  private receive(msg: Wire): void {
    switch (msg.kind) {
      case 'hello':
        this.see(msg.clientId, msg.joinTime)
        // Tell the newcomer we exist so it can build a full roster.
        this.post({ kind: 'welcome', clientId: this.localClientId, joinTime: this.joinTime })
        this.recomputeActors()
        break
      case 'welcome':
      case 'heartbeat':
        this.see(msg.clientId, msg.joinTime)
        this.recomputeActors()
        break
      case 'bye':
        if (this.roster.delete(msg.clientId)) {
          this.lastSeen.delete(msg.clientId)
          this.recomputeActors()
        }
        break
      case 'event': {
        if (msg.senderClientId === this.localClientId) break // already self-delivered
        if (msg.receivers === 'others' || msg.receivers === 'all') {
          this.handlers.onEvent?.(msg.code, msg.data, msg.senderClientId)
        } else if (msg.receivers === 'master' && this.isMaster) {
          // Accept even if aimed at a previous master (mid-hand-off): we're master now.
          this.handlers.onEvent?.(msg.code, msg.data, msg.senderClientId)
        }
        break
      }
    }
  }

  private prune(): void {
    const now = Date.now()
    let changed = false
    for (const [clientId, seen] of this.lastSeen) {
      if (clientId === this.localClientId) continue
      if (now - seen > PRUNE_MS) {
        this.roster.delete(clientId)
        this.lastSeen.delete(clientId)
        changed = true
      }
    }
    if (changed) this.recomputeActors()
  }

  /** Rebuild the sorted actor list; fire `onActorsChange` only when it actually moves. */
  private recomputeActors(): void {
    const sorted = [...this.roster.values()].sort(
      (a, b) => a.joinTime - b.joinTime || a.clientId.localeCompare(b.clientId),
    )
    const next: NetActor[] = sorted.map((entry, i) => ({
      actorNr: i + 1,
      clientId: entry.clientId,
      isLocal: entry.clientId === this.localClientId,
    }))

    const same =
      next.length === this.cachedActors.length &&
      next.every((a, i) => a.clientId === this.cachedActors[i]?.clientId)
    if (same) return

    this.cachedActors = next
    this.handlers.onActorsChange?.(next)
  }
}
