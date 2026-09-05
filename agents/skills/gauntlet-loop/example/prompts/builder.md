You are a builder. Apply the defect list below, then verify visually before
reporting.

**You own exactly these files:** `example/attempt/pass2.html` (copy it from
`pass1.html` first; leave `pass1.html` untouched — it is the evidence for round
1's numbers).
**Do not open or edit:** `example/critique/*`, `example/BAR.md`,
`example/queries.json`, `example/frame.json`, `harness/*`.

**The reference is `example/reference/stripe-standard-card.png`.** It is the
artefact we were given, it is not our output, and it is not up for revision. Your
work is "the recreation".

## The defect list (consolidated from five critics, ordered cause before consequence)

| # | from | file/symbol | change | value |
|---|------|-------------|--------|-------|
| 1 | E1 | `.panel` | nest the panel radius concentrically inside the card's 16px at a 4px inset | `border-radius: 8px -> 12px` |
| 2 | A1,E2 | `#left` | move the button down by padding, keeping the pre-button gap large and shrinking the bottom margin | `padding: 26px 32px -> 41px 32px 31px` |
| 3 | A2 | `#left` | force the body copy to five lines | `width: 268px -> 258px` |
| 4 | A4 | `.panel` | cap the measure so the link breaks after "European" | `padding: 12px -> 12px 34px` |
| 5 | E3,B1 | `h2` | size, weight, tracking | `25px / 600 / -0.2px` |
| 6 | E3,B2 | `.rate` | size — larger than the heading, so the eye lands on the price | `24px -> 27px` |
| 7 | B5 | `p` | leading | `line-height: 1.6 -> 1.5` |
| 8 | C1 | `body` | page ground | `#eaeef3 -> #f6f9fc` |
| 9 | C2 | `#card` | shadow: wider, lower opacity, visible ~10px out | `0 15px 35px rgba(50,50,93,.1), 0 5px 15px rgba(0,0,0,.07)` |
| 10 | D1 | `#cta` | replace `&rsaquo;` with a real chevron | inline SVG, stroke 2.5, 12x12, 6px gap |
| 11 | D4 | `#cta` | interactive states | `:hover` + `:focus-visible` |

Two notes on the list, because they change how you should read it. **Row 6 is
deliberately not what Critic B asked for** — B measured a cap-height ratio and
prescribed 26px for both the heading and the rate; the unlensed critic pointed
out that equal sizes preserve the wrong reading order. **Rows 2 and 3 are one
fix, not two** — padding alone lands the button at y=205, not 232; the five-line
wrap is load-bearing.

## Verify before reporting

Render in the shipping frame — viewport 1280x900, dsf 2, clipped to 550x300 CSS,
which is what `example/frame.json` encodes — and **open the PNG yourself**:

```
node harness/shot.js example/attempt/pass2.html example/shots/pass2.png
node harness/bbox.js example/reference/stripe-standard-card.png \
                     example/shots/pass1.png example/shots/pass2.png \
                     --queries example/queries.json --dsf 2
node harness/diff.js example/reference/stripe-standard-card.png \
                     example/shots/pass1.png example/shots/pass2.png
```

`shot.js` exits non-zero on a console error or a failed request. The bar requires
zero of both, and ≤ 12 KB for the file.

## Report

- The measurement before and after for every row you applied.
- **What you rejected and why**, with the measurement that shows it. This is a
  required section. A number that came out of a measurement is still a guess
  about intent, and you are the one holding the file.
- Anything you found that no critic filed.
