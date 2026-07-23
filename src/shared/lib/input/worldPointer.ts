/**
 * ONE global guard against "click-through UI", installed once for the whole app.
 *
 * The problem: every world-input hook (move / attack / cast) listens for pointer
 * presses on `window`. HTML UI overlays are drawn on top of the WebGL canvas, so
 * a click on a button or panel ALSO reaches those world listeners and fires a
 * phantom move/attack on the ground underneath — the whole app, every scene.
 *
 * The fix, in a single place: register one `pointerdown` listener on `window` at
 * module load (before React mounts anything, so it runs FIRST among window
 * listeners). When a press did not land on the 3D canvas it hit a UI element —
 * every HUD root is `pointer-events: none` and only interactive bits opt back in
 * with `pointer-events: auto`, so the event target is the WebGL `<canvas>` for a
 * world click and a DOM element for a UI click. On a UI press we call
 * `stopImmediatePropagation()`: the UI element already handled the event in the
 * target phase, and stopping here only prevents the *remaining* window listeners
 * — the world hooks — from ever seeing it. No hook, scene, or panel needs to know.
 *
 * Only presses are guarded; `pointerup`/blur stay untouched so a button held over
 * the world and released over the UI (or vice-versa) always clears cleanly.
 */
export function installWorldInputGuard(): void {
  window.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof HTMLCanvasElement)) {
      event.stopImmediatePropagation()
    }
  })
}
