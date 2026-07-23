/**
 * Minimal ambient types for the `photon-realtime` package (the official Photon JS SDK
 * ships no `.d.ts`). Only the surface `PhotonTransport` uses is declared. See the SDK's
 * `LoadBalancing.LoadBalancingClient` for the full API.
 */
declare module 'photon-realtime' {
  namespace Photon {
    /** Transport protocol; browsers use Wss. */
    enum ConnectionProtocol {
      Ws = 0,
      Wss = 1,
    }

    /** Low-level peer; exposes the swappable WebSocket implementation. */
    class PhotonPeer {
      static setWebSocketImpl(impl: unknown): void
    }

    namespace LoadBalancing {
      namespace Constants {
        /** Who a raised event reaches. */
        enum ReceiverGroup {
          Others = 0,
          All = 1,
          MasterClient = 2,
        }
      }

      /** A room participant. */
      class Actor {
        name: string
        actorNr: number
        isLocal: boolean
      }

      /** Options accepted by `raiseEvent`. */
      interface RaiseEventOptions {
        receivers?: number
        targetActors?: number[]
        interestGroup?: number
        cache?: number
      }

      class LoadBalancingClient {
        constructor(protocol: number, appId: string, appVersion: string)

        /** Lifecycle state (see `LoadBalancingClient.State`). */
        state(): number
        myActor(): Actor
        myRoomActorsArray(): Actor[]
        myRoomActorCount(): number
        myRoomMasterActorNr(): number
        isJoinedToRoom(): boolean

        connectToRegionMaster(region: string): boolean
        joinRoom(name: string, joinOptions?: unknown, createOptions?: unknown): boolean
        raiseEvent(code: number, data: unknown, options?: RaiseEventOptions): void
        disconnect(): void
        setLogLevel(level: number): void

        // Overridable callbacks.
        onStateChange: (state: number) => void
        onEvent: (code: number, content: unknown, actorNr: number) => void
        onActorJoin: (actor: Actor) => void
        onActorLeave: (actor: Actor, cleanup: boolean) => void
        onJoinRoom: (createdByMe: boolean) => void
        onError: (errorCode: number, errorMsg: string) => void
      }

      namespace LoadBalancingClient {
        /** State enum values by name. */
        const State: {
          Error: number
          Uninitialized: number
          ConnectedToMaster: number
          JoinedLobby: number
          Joined: number
          Disconnected: number
          [key: string]: number
        }
      }
    }
  }

  export default Photon
}
