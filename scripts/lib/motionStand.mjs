/* @important The bench renders on demand: a step click only invalidates the
   canvas, and the frame that poses the rig arrives on a later animation frame.
   A check that reads the pose straight after the click reads the frame before
   it about one time in seven — measured: 9 of 60 frames repeated, and two runs
   of the same course 24.7 cm apart — which a jerk check reports as a pop and
   every other check averages into noise. Waiting two animation frames puts the
   read after the render the step asked for. */
export async function stepStand(page, testId = 'motion-stand-step-1') {
  await page.getByTestId(testId).click()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

/* @important A reset remounts the subject, so it lands a few frames after the
   click: the new body is known by its clock, which starts again from its first
   step. */
export async function resetStand(page) {
  await page.getByTestId('motion-stand-reset').click()
  await page.waitForFunction(() => {
    const body = window.__motionBody?.()
    return Boolean(body && body.elapsedSeconds > 0 && body.elapsedSeconds < 0.02 && window.__motionFeet)
  }, null, { timeout: 30000 })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
