import { createTransport } from '../createTransport'
import { LocalStateSource } from './localStateSource'
import { TransportStateSource } from './transportStateSource'
import type { StateSource } from './netState'

/**
 * Picks the replicated-state source from the URL — the single place the game's
 * networking is decided:
 *  - `?net=local` → `LocalStateSource` (single-player, no wire at all),
 *  - anything else → `TransportStateSource` over `createTransport()` (Photon or loopback).
 * Swapping to a future authoritative server means one more branch here; nothing above changes.
 */
export function createStateSource(): StateSource {
  const net = new URLSearchParams(window.location.search).get('net') ?? 'loopback'
  if (net === 'local') return new LocalStateSource()
  return new TransportStateSource(createTransport())
}
