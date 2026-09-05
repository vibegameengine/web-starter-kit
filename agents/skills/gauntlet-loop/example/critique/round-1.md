# Critique round 1 — separate act, written BEFORE any code is touched

Reference: `run/reference/stripe-standard-card.png` (given artefact, external).
Recreation under review: `run/shots/pass1.png` from `run/attempt/pass1.html`.
All numbers in CSS px inside the shared 550x300 clip frame.

Five critics, run sequentially because I cannot fan out. Each is written as if it
had only its own lens and had been told not to comment on the others'.

---

## Critic A — composition & layout (lens: geometry, spacing, alignment only)

Harsh, ranked, worst first.

1. **The left column has a hole in the bottom third.** The CTA button's bottom
   edge is at y=223; the card's bottom edge is at y=296. That is 73px of dead
   white. In the reference the button bottom is at y=265, leaving 31px. The
   recreation's left column is top-heavy and the card reads as unbalanced against
   a right-hand stack that fills its full height.
   Fix: `#left` padding-top 26px -> 41px, and force the body copy to five lines
   (below), which pushes the button down. Target button bbox `[42,232,122,33]`;
   currently `[42,190,122,33]`.
2. **The body copy wraps to four lines instead of five.** Reference body block
   bbox `[42.5,95.5,199,106.5]` (5 lines). Recreation `[42.5,83.5,194,80]`
   (4 lines). The measure is too generous. Fix: `#left` width 268 -> 258, or
   body font-size 14 -> 15px. Either forces the line 3 break after "No setup".
3. **The body copy starts 12px too high.** Ref first-line top y=95.5, ours 83.5.
   Same root cause as (1): insufficient top padding.
4. **The top-right panel's text measure is too wide.** Reference link ink
   `[332.5,85.5,153,35.5]`, ours `[324,85.5,187.5,31.5]` — 34px wider, so the
   line breaks after "Economic" instead of after "European". Fix: `.panel`
   padding 12px -> 12px 34px, capping the measure at ~155px.

Nothing else in my lens is off: card rect, panel rects, the 4px gutter and the
4px inset all match to the pixel. The frame geometry is genuinely good.

## Critic B — typography (lens: type only, no layout comment)

1. **Heading is one to two px too small.** Reference "Standard" ink bbox
   `[42,51,106,19]`, ours `[43,41.5,100.5,17.5]`. Cap-height ratio 19/17.5 =
   1.086. Fix: `h2 font-size: 24px -> 26px`.
2. **Both rate figures are the same amount too small.** Ref ink height 19px in
   both panels; ours 17.5px in both. Fix: `.rate font-size: 24px -> 26px`.
3. **The heading is set at the browser's default `h2` weight (700).** The
   reference's heading is a semibold, not a black bold, and its stems are visibly
   lighter relative to its size. Fix: `h2 { font-weight: 600 }`.
4. **Letter-spacing is untouched.** At 26px the reference's heading spans 106px
   for eight characters; a system-font 26px semibold "Standard" measures ~109px.
   Fix: `letter-spacing: -0.2px` on the heading to land on 106.
5. Line-height on the body is `1.6` (22.4px). The reference's five lines span
   106.5px ink, implying a ~21.5px pitch. Fix: `line-height: 1.5`.

I cannot verify the typeface: the reference is set in Stripe's licensed
"sohne-var". No substitution will be exact, and chasing it further than the ink
metrics above is wasted effort. Say so rather than pretending.

## Critic C — colour & surface (lens: colour, contrast, shadow only)

1. **The page background behind the card is wrong.** Sampled at the same point,
   the reference is `rgb(244,247,251)` near the card's top-left; ours is
   `rgb(234,238,243)`. Ours is 10 units darker across all channels, which makes
   our card's edge read harder than the reference's.
   Fix: `body { background: #f6f9fc }`.
2. **The card shadow is too tight and too dark.** Ours is
   `0 4px 12px rgba(0,0,0,.08)` — a UI-kit default. The reference's card lifts
   off a very pale ground with a wide, low-opacity spread; at the card's left
   edge the reference's falloff is still visible ~10px out, ours dies at ~4px.
   Fix: `0 15px 35px rgba(50,50,93,.1), 0 5px 15px rgba(0,0,0,.07)`.
3. Text colours are exact: `#0A2540` heading, `#425466` body, `#635BFF` accent,
   `#F6F9FC` panel. Panel bg matched to within tolerance 2 across 267k pixels.
   No change.

## Critic D — component detail (lens: the button and interactive affordances only)

1. **The chevron is the wrong glyph and the wrong weight.** Ours is `&rsaquo;`
   (a single-angle quote) at the text's own weight. The reference's is a chunky
   chevron roughly 60% of the cap height with a visible stroke, set apart by a
   wider gap.
   Fix: replace with an inline SVG chevron, `stroke-width:2.5`, 12x12, and a 6px
   left margin.
2. **The button's corner radius is over-specified but right by luck.** 17px on a
   33px-tall button is a pill; the reference is also a pill. No change, but state
   it as `border-radius: 999px` so it survives a height change.
3. Button ink box is `[42,190,122,33]` vs reference `[42,232,122,33]`: the size
   is exactly right, only the position is wrong. Whatever is moving it is not in
   my lens.
4. The button has no hover, focus or active state at all. The reference is a live
   control. Fix: add `:hover{background:#7a73ff}` and a visible `:focus-visible`
   ring. (Not visible in a still, but it is the component's job.)

## Critic E — UNLENSED (told: squint at both; name the three biggest shapes in
## each; say what the reference is doing to the viewer that we are not; things
## that fall between the other categories are your job)

Squinting, both images resolve to the same three shapes: a white slab, a pale
two-cell stack on the right, a purple pill low-left. The shapes are in the right
places and at the right sizes. So on the terms the four lensed critics used, this
is close to done.

What none of them is looking at:

1. **The recreation is not the same OBJECT.** In the reference, the pale stack is
   an inset *inside* the white card — the white card is the container and you can
   see white on all four sides of the stack. In ours, the pale stack is flush to
   the card's right edge for its whole height, so at squint distance the card
   reads as two side-by-side panels, not one card with a table dropped into it.
   Check the right edge: the reference has 4px of white to the right of the pale
   stack at every y; ours has 4px at the top and bottom but the panel's own
   rounded corners are the only thing separating it from the card's rounded
   corners, and the radii do not nest — an 8px panel radius sitting 4px inside a
   16px card radius should read as a 12px offset curve, and ours reads as two
   different curves fighting. *This is the "wrong shape" defect, and it belongs to
   no lens: A called the rects pixel-perfect, C called the colours exact, and both
   were right.*
   Fix: panel radius 8 -> 12, so it nests concentrically with the card's 16 at a
   4px inset.
2. **The reference's left column is a paragraph with a call to action under it.
   Ours is a paragraph with a call to action floating after it.** The reference
   distributes: heading, gap, copy, a distinctly LARGER gap, button, small bottom
   margin. The proportion of that larger gap to the others is what makes it read
   as "and now do this". Ours has an even rhythm and then a void. Critic A
   measured the void; what A did not say is that closing it by adding padding
   would be wrong — the gap above the button should stay large, and the *bottom*
   margin should shrink to 31px.
3. **What the reference does to the viewer that we do not:** it puts the price
   where the eye lands. In the reference the largest, highest-contrast ink in the
   frame is "1.5% + €0.25". In ours, the heading "Standard" and the rate are the
   same 24px, so the eye lands top-left on a word that sells nothing. Ranking
   objects by attention taken: reference = rate, button, heading. Ours = heading,
   rate, button. Fix: this is fixed by Critic B's two font-size bumps only if the
   rate goes up more than the heading. Take the rate to 27px and the heading to
   25px, not both to 26px.

One sentence of praise, as briefed: the geometry work is genuinely good — the
card, panel and gutter rects match the reference to the pixel, which is the part
most recreations get wrong.

---

## Consolidated defect list (manager)

Order chosen: form first (E1), then position (A1/A2/E2), then type (B/E3), then
surface (C), then component (D).

| # | from | change | file/symbol | value |
|---|------|--------|-------------|-------|
| 1 | E1 | nest the panel radius | `.panel` | `border-radius: 8px -> 12px` |
| 2 | A1,E2 | left column top padding | `#left` | `padding: 26px 32px -> 41px 32px 31px` |
| 3 | A2 | force 5-line wrap | `#left` | `width: 268px -> 258px` |
| 4 | A4 | cap panel measure | `.panel` | `padding: 12px -> 12px 34px` |
| 5 | E3,B1 | heading size, weight, tracking | `h2` | `25px / 600 / -0.2px` |
| 6 | E3,B2 | rate size | `.rate` | `24px -> 27px` |
| 7 | B5 | body leading | `p` | `line-height 1.6 -> 1.5` |
| 8 | C1 | page ground | `body` | `#eaeef3 -> #f6f9fc` |
| 9 | C2 | card shadow | `#card` | `0 15px 35px rgba(50,50,93,.1), 0 5px 15px rgba(0,0,0,.07)` |
| 10 | D1 | real chevron | `#cta` | inline SVG, stroke 2.5, 12x12, 6px gap |
| 11 | D4 | states | `#cta` | hover + focus-visible |

## Builder's rejections (required by the skill: report what you overruled)

- **Rejected B1's 26px heading in favour of 25px.** B measured a cap-height ratio
  of 1.086 and multiplied. E3 is right that the ranking matters more than the
  ratio: taking the heading to 26 and the rate to 26 preserves the wrong reading
  order. 25/27 satisfies E3 and lands the heading ink within 2px of the
  reference's 106px width, which is inside the error of a substituted typeface.
- **Rejected A1's "padding-top 26 -> 41" as a complete fix.** Padding alone moves
  the button to y=205, not 232. The five-line wrap (A2) is load-bearing; both are
  needed. A treated them as independent.
- **Rejected D2 entirely.** Restating a working 17px radius as `999px` is not a
  defect, it is a preference, and it costs a diff.
