# The bar (defined before starting, per SKILL.md "Stopping")

- **Reference (the artefact I was given, never my own output):**
  `run/reference/stripe-standard-card.png` — a 550x300 CSS-px clip of
  https://stripe.com/pricing captured at 1280x900, dsf 2.
- **The recreation (my own work, never called "the reference"):**
  `run/attempt/*.html`, rendered to `run/shots/*.png`.
- **Measurable budget:**
  - single self-contained HTML file, no network requests at render time
  - ≤ 12 KB
  - rendered at the SHIPPING frame: viewport 1280x900, dsf 2, clipped to the
    same 550x300 CSS rect as the reference
  - zero console errors, zero failed requests
- **Stop condition:** two consecutive critique rounds in which no critic (four
  lensed + one unlensed) reports a defect that would be visible side-by-side at
  100% to a designer. Capped at 3 rounds regardless — I am one agent, not a
  fan-out.

## Measured facts from the reference (device px in a 1100x600 PNG; /2 = CSS)

| thing | measurement |
| --- | --- |
| card rect | x 20..1080, y 20..593 dev -> 10,10 530x286 CSS |
| left column white | rgb(255,255,255), x 20..554 dev (10..277 CSS) |
| right panel bg | rgb(246,249,252) = #F6F9FC, starts x 556 dev (278 CSS) |
| gap between the two right panels | 302..309 dev = 4 CSS px, white |
| right panel 1 | y 28..301 dev (14..150 CSS) |
| right panel 2 | y 310..585 dev (155..292 CSS) |
| heading colour | rgb(10,37,64) = #0A2540 |
| body colour | rgb(66,84,102) = #425466 |
| accent / button / link | rgb(99,91,255) = #635BFF |
| button rect | x 84..327, y 464..529 dev -> 42,232 122x33 CSS |
| page bg behind card | ~rgb(234,238,243) |
