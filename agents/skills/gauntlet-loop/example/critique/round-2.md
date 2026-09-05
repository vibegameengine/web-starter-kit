# Critique round 2 — separate act, written BEFORE any code is touched

Reference: `run/reference/stripe-standard-card.png`.
Recreation under review: `run/shots/pass2.png`.

## What round 1 actually moved (manager: separate fixed from outstanding)

| measure | reference | pass 1 | pass 2 |
|---|---|---|---|
| CTA button | `[42,232,122,33]` | `[42,190,122,33]` | `[42,232,130,33]` |
| body block | `[42.5,95.5,199,106.5]` | `[42.5,83.5,194,80]` (4 lines) | `[42.5,99.5,188,94.5]` (5 lines) |
| link ink, top panel | `[332.5,85.5,153,35.5]` | `[324,85.5,187.5,31.5]` | `[335,87.5,138,31.5]` |
| heading ink | `[42,51,106,19]` | `[43,41.5,100.5,17.5]` | `[43,57,100,18]` |
| rate ink, top | `[335.5,48,143,19]` | `[336,49.5,142.5,17.5]` | `[322,48.5,160,19.5]` |

Fixed: button y (42px error -> 0), body line count (4 -> 5), the link's line
break (after "Economic" -> after "European", matching), panel radius nesting,
card shadow, page ground.

## Critic A — composition & layout

1. **Overcorrected: the heading is now 6px too LOW.** Ref top y=51, ours 57.
   Round 1 set `padding-top: 41px` by arithmetic on the *ink* top, ignoring the
   25px line box's internal leading. Fix: `#left padding-top: 41px -> 35px`.
2. **The paragraph-to-button gap is 8px too large.** Ref: body ink ends y=202,
   button top y=232 => 30px. Ours: 194 -> 232 => 38px. Consequence of the
   paragraph being short (see B). Fixing B closes this; no separate change.
3. Button width regressed 122 -> 130 (+8px). Cause: the round-1 SVG chevron is
   12px wide with a 6px gap, where `&rsaquo;` was ~4px. Fix: reduce `#cta`
   padding-right 18px -> 14px.

## Critic B — typography

1. **The body copy is set too small AND too tight.** Ref line-1 ink width 199,
   ours 188 (ratio 1.058); ref block height 106.5 over 5 lines (pitch ~23.4),
   ours 94.5 (pitch ~20.6). Fix: `p { font-size: 15px; line-height: 1.56 }`.
   This will overflow the 194px content box, so `#left width: 258 -> 268` must go
   back — with 15px type the 204px measure still breaks after "payments".
   *This reverses a round-1 change. Round 1 fixed the line count with the wrong
   variable: the wrap was wrong because the type was too small, not because the
   column was too wide.*
2. **The `for ...` caption is a point too small.** Ref ink `153x35.5`, ours
   `138x31.5`, ratio 1.11. Fix: `.for { font-size: 15px }`.
3. **The rate figure is now the right height but 17px too wide** (160 vs 143 at
   the same 19px ink height). This is the typeface, not the size: Söhne is
   narrower than the system stack at equal cap height. Partial fix:
   `.rate { letter-spacing: -1px }` recovers ~13 of the 17px. I do not recommend
   chasing the remainder — see my round-1 note.
4. Heading ink width still 100 vs 106 at the correct height. Fix:
   `h2 { font-size: 26px; letter-spacing: 0 }` (round 1's -0.2px tracking was
   pulling in the wrong direction once the size was raised).

## Critic C — colour & surface

Nothing outstanding. Page ground, panel fill, all four text colours and the
shadow now match. I have no defect to report and I am not going to invent one.

## Critic D — component detail

1. The chevron is the right shape and weight now, but it is optically centred on
   the text baseline rather than the cap height, sitting ~1px low. Fix:
   `#cta svg { position:relative; top:-.5px }`.
2. Hover and focus states exist and are correct. No change.

## Critic E — UNLENSED

Squinting: the two images are now the same object. The three shapes, their sizes,
their radii and their weights read the same, and the attention ranking is finally
right — the eye lands on "1.5% + €0.25", then the purple pill, then "Standard",
which is the reference's order. Round 1's ranking fix worked.

What still falls between the lenses:

1. **Our paragraph is a paler, looser grey mass than the reference's.** Every
   individual colour matches (C is right) and the block is in the right place
   (A is right), yet the reference's paragraph has visibly more *ink* in the same
   footprint. It is set larger with more leading — B has the numbers — and the
   net effect at squint distance is that the reference's left column carries
   weight and ours looks like a placeholder. This is the last thing that makes
   the recreation read as a copy rather than the thing.
2. **The four panel cells in the reference are not equally dense; ours are.** In
   the reference the top cell is busy (two lines of link) and the bottom cell is
   sparse ("for UK cards"), and the bottom cell's content sits noticeably *below*
   its optical centre, giving the stack a downward drift the eye follows to the
   card's bottom edge. Ours centres both cells perfectly. Perfect centring is the
   more "correct" choice and the less faithful one. **I am flagging this and NOT
   recommending a fix** — the reference's drift is an artefact of its real
   content lengths, not an intention, and copying it would be cargo-culting.
3. Nothing else. If round 3 lands B's type changes, I would stop.

One sentence of praise: the round-1 rejection log was right — refusing to take
heading and rate to the same size is why the attention ranking came out correct.

## Consolidated list for pass 3

| # | change | value |
|---|--------|-------|
| 1 | `#left` | `width: 258 -> 268px`, `padding-top: 41 -> 35px` |
| 2 | `p` | `font-size: 14 -> 15px`, `line-height: 1.5 -> 1.56` |
| 3 | `.for` | `font-size: 14 -> 15px` |
| 4 | `h2` | `font-size: 25 -> 26px`, `letter-spacing: -.2px -> 0` |
| 5 | `.rate` | `letter-spacing: -1px` |
| 6 | `#cta` | `padding-right: 18 -> 14px`; svg `top:-.5px` |

## Rejections

- **Rejected E2.** Reproducing the reference's vertical drift would be copying a
  content accident. Recorded, not applied.
- **Rejected chasing B3 past -1px tracking.** The residual is the typeface. A
  critic that keeps filing the same defect after the cause is identified as
  unfixable is noise.
- **Reversed round 1's item 3** (`#left width 268 -> 258`). It produced the right
  line count from the wrong cause and blocked the real fix.
