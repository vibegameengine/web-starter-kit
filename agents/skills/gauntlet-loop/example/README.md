# A worked example, end to end

The process in [`../SKILL.md`](../SKILL.md) describes a good critique in one
sentence. This directory is one, in full, with everything around it: the bar
written before starting, the reference, the blockout, three passes, five critic
prompts, two rounds of real critic output, both consolidated defect lists, both
rejection logs, and the commands that produced every number quoted in any of
them.

It exists because the document used to be unrunnable. An agent given only the
repository, with no other context, ran the process on a target it chose itself —
and had to invent four measurement tools before a single critic could satisfy a
brief that says "demand numbers". Its verdict was that the *judgement* in the
document transferred and the *mechanics* did not. This is the run it did. The
four tools it invented are now [`../harness/`](../harness/), shipped.

**The target:** rebuild the "Standard" pricing card from stripe.com as one
self-contained HTML file, matched against a screenshot of the real page. Nothing
about the domain matters — it was picked because it is small, has a hard external
reference, and can be measured in pixels.

## What happened

| pass | mean abs pixel diff from the reference | pixels >24/255 off |
| --- | --- | --- |
| blockout (flat grey boxes, no type, no colour) | 22.83 | 17.93% |
| pass 1 (first real attempt) | 17.09 | 14.49% |
| pass 2 (after round 1) | 12.73 | 10.50% |
| pass 3 (after round 2) | **9.98** | 8.99% |

```
node harness/diff.js example/reference/stripe-standard-card.png example/shots/*.png
```

Feature by feature, over round 1: the CTA button's 42 px vertical error closed to
0, the body copy went from four lines to five and from 26.5 px short to 1.5 px
short, and the top panel's link stopped breaking after the wrong word. The
per-feature deltas anyone can regenerate:

```
node harness/bbox.js example/reference/stripe-standard-card.png \
                     example/shots/pass1.png example/shots/pass3.png \
                     --queries example/queries.json --dsf 2
```

## Read it in this order

| file | which part of the process produced it |
| --- | --- |
| [`BAR.md`](BAR.md) | **Stopping**, done first. The reference path, the budget, the stop condition, the round cap, and a table of measurements taken from the reference *before* anything was built. |
| [`frame.json`](frame.json) | **"Verify in the shipping aspect and size."** One file, read by the harness, so every render and every quoted number is comparable. |
| [`attempt/blockout.html`](attempt/blockout.html) → [`shots/blockout.png`](shots/blockout.png) | **Rule 2, blockout before assets.** Flat grey rectangles at measured positions. It caught a structural error before any styling existed. |
| [`attempt/pass1.html`](attempt/pass1.html) → [`shots/pass1.png`](shots/pass1.png) | The first real attempt — the thing the critics were set on. |
| [`prompts/`](prompts/) | **The five critic briefs and the builder brief, as sent.** Reconstructed — see [`prompts/README.md`](prompts/README.md). |
| [`critique/round-1.md`](critique/round-1.md) | **The critique as a separate act, written before any code was touched.** Five critics, then the consolidated defect list, then the builder's rejections. |
| [`attempt/pass2.html`](attempt/pass2.html) → [`shots/pass2.png`](shots/pass2.png) | Round 1 applied. |
| [`critique/round-2.md`](critique/round-2.md) | Round 2 — including the round-1 change it **reversed**. |
| [`attempt/pass3.html`](attempt/pass3.html) → [`shots/pass3.png`](shots/pass3.png) | Round 2 applied. Final. |
| [`queries.json`](queries.json) | The feature list `bbox.js` measures. This is a real part of the bar: it is the written-down claim about *which* features have to match. |

## The four moments worth reading it for

**The blockout caught a structural bug.** `blockout.html`'s comment —
"all coords below are CARD-relative (stage measurement minus the card's 10,10)" —
is a correction that had to be made while there was nothing on screen but grey
rectangles. Every measurement taken later would have carried that offset.

**The unlensed critic found what no lensed critic could.** Round 1, Critic E,
item 1: the nested corner radius is geometrically wrong, so at squint distance the
card reads as two panels side by side rather than one card with a table dropped
into it. The layout critic had just declared the rectangles pixel-perfect and the
colour critic had declared the fills exact — **and both of them were right.** The
defect lived on the seam between two lenses, where by construction neither of
them was looking.

**Writing the critique down forced a measurement, and the measurement changed
the fix.** Not "the button looks a bit high": exactly 42 px high, and the cause is
the four-line wrap rather than the padding. The obvious fix — add padding —
lands the button at y=205 instead of 232. The builder's rejection log at the foot
of round 1 says so explicitly. Prose would have shipped the wrong fix.

**Letting the builder overrule the critic caught the loop's own
overcorrection.** Round 2, Critic B item 1 reverses round 1's item 3: the line
count had been fixed with the wrong variable — the wrap was wrong because the
type was too small, not because the column was too wide — so the column width
goes back and the type size goes up. Without an explicit rejection log, round 2
would have stacked another fix on top of a wrong one.

## Honest notes on this example

- **The prompts are reconstructed, not logged.** The run was executed by one
  agent playing every part in sequence, because it could not fan out; the five
  critics in `round-1.md` are written as if each had only its own lens and had
  been told not to comment on the others'. This is the **serial fallback**
  described in `SKILL.md`, and it is the right shape for a single-file artefact —
  but it means the critics were less independent than a real fan-out's would be,
  and the example is weaker for it in exactly that one respect.
- **There is no round-3 critique.** `BAR.md` capped the run at three rounds and it
  hit the cap. That is the cap working, not an omission — but it does mean pass 3
  was never itself reviewed, and its measurements above are the only judgement
  passed on it.
- **The typeface can never be matched.** The reference is set in Stripe's licensed
  "sohne-var". Round 1's Critic B says so and closes it; round 2 refuses to chase
  the residual past `letter-spacing: -1px`. That closed defect is most of the
  remaining 9.98 — a mean absolute diff of zero was never reachable and the bar
  never asked for one. This is the **unfixable-defect rule** in `SKILL.md`, and it
  is the difference between a loop that terminates and one that does not.
- **`queries.json`'s "right panel fill" query also catches page background**
  outside the card, because that background is very nearly the same colour. The
  query list is a claim you have to review like any other — a badly-scoped region
  produces a confident, wrong number, and a critic quoting it will not know.
- **The reference images are screenshots of a third-party website**, kept here
  under fair use as the subject of criticism. `stripe-pricing.png` is the full
  capture, `stripe-standard-card.png` is the 550x300 CSS px crop that is the
  reference of record. Nothing in this repository is affiliated with Stripe.

## Reproduce it

```
cd harness && npm install && npx playwright install chromium && cd ..
node harness/shot.js example/attempt/pass3.html /tmp/pass3.png
node harness/diff.js example/reference/stripe-standard-card.png /tmp/pass3.png
```

Expect a mean absolute diff of 9.98, give or take a few hundredths of browser
version. If you get a size mismatch, `frame.json` was not found — that is the
harness telling you the render was not in the shipping frame, which is the whole
point of it being a file.
