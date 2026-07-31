/**
 * How often DEV drops the user-timing buffer. Ten seconds keeps it at a few
 * thousand entries — small enough to be free, long enough that a Performance
 * recording taken by hand still has something in it.
 */
const TRIM_INTERVAL_MS = 10_000

/**
 * Keep a long DEV session from running the tab out of memory.
 *
 * React's DEVELOPMENT build writes a `performance.measure` for every component
 * render, each carrying a `detail` object of nested arrays, and the browser
 * NEVER evicts user-timing entries — there is no buffer limit to raise. A
 * realtime app renders continuously, so the buffer only ever grows and no
 * garbage collector may reclaim it.
 *
 * Rendering less cannot bound the total: any non-zero rate still reaches
 * out-of-memory given a long enough session. Nothing here reads the buffer
 * back, so DEV simply drops it on an interval.
 *
 * The production React build emits no measures at all, which is why this is
 * DEV-only rather than a shipped behaviour.
 */
export function trimUserTimingInDev(): void {
  if (!import.meta.env.DEV) return
  if (typeof performance === 'undefined' || typeof performance.clearMeasures !== 'function') return
  // Measures only, deliberately. A measure taken BETWEEN two named marks fails
  // if those marks are cleared out from under it, and marks carry no `detail`
  // payload — they are a fraction of the cost.
  window.setInterval(() => performance.clearMeasures(), TRIM_INTERVAL_MS)
}
