import { LoopbackTransport } from './loopbackTransport'
import { PhotonTransport } from './photonTransport'
import type { NetTransport } from './transport'

/**
 * Picks the networking transport from the URL + env, so the same lab/game code runs
 * offline or on the real Photon cloud:
 *
 *  - `?net=photon` → real Photon Realtime (needs `VITE_PHOTON_APP_ID`). Region from
 *    `?region=` or `VITE_PHOTON_REGION` (default 'eu'). Falls back to loopback with a
 *    warning if no AppID is configured.
 *  - anything else → `LoopbackTransport` (BroadcastChannel; two tabs of one browser).
 *
 * Both share `?room=<name>` so players choose their session.
 */
export function createTransport(): NetTransport {
  const params = new URLSearchParams(window.location.search)
  const roomName = params.get('room') ?? 'lab'
  const net = params.get('net') ?? 'loopback'

  if (net === 'photon') {
    const appId = import.meta.env.VITE_PHOTON_APP_ID
    if (appId) {
      const region = params.get('region') ?? import.meta.env.VITE_PHOTON_REGION ?? 'eu'
      return new PhotonTransport({ appId, region, roomName, maxPlayers: 4 })
    }
    console.warn('[net] ?net=photon requested but VITE_PHOTON_APP_ID is unset — using loopback')
  }

  return new LoopbackTransport(roomName)
}
