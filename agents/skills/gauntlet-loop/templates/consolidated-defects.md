# Template — the consolidated defect list

The manager writes this, once per round, after every critic has reported and
before any builder is dispatched. It is the only thing builders are given; raw
critiques are not forwarded. Filled-in instances are at the bottom of
[`../example/critique/round-1.md`](../example/critique/round-1.md) and
[`round-2.md`](../example/critique/round-2.md).

The rules for producing it — dedup, ordering, and what to do when two critics
prescribe different values for the same symbol — are in `SKILL.md` under
**Consolidation**.

---

## Round {{N}} — what changed since the last render

| measure | reference | round N-1 | round N |
| --- | --- | --- | --- |
| {{feature}} | {{value}} | {{value}} | {{value}} |

Overall: `{{diff command}}` → mean abs diff {{was}} → {{now}}.

*(Omit for round 1. This table is how you separate "already fixed while the
critic was thinking" from "still outstanding", and it is the only thing that
tells you a round overcorrected.)*

## Defect list

| # | from | file / symbol | change | value |
|---|------|---------------|--------|-------|
| 1 | {{E1}} | {{`.panel`}} | {{nest the radius inside the card's}} | {{`border-radius: 8px -> 12px`}} |

Ordered **cause before consequence**: the change that moves other measurements
goes first, so nobody measures against a value that is about to move. In
practice that is usually form, then position, then type, then surface, then
detail.

## Rejections

- **Rejected {{critic + item}}**, because {{the measurement that shows the
  diagnosis is wrong, or the critic whose claim on the cause is better}}.
- **Reversed {{round N-1 item}}**, because {{it produced the right symptom from
  the wrong variable and is blocking the real fix}}.

## Closed — do not file again

- {{Defect}}: cause is {{unfixable thing}}. Residual measured at {{value}}.
  Accepted into the bar. Any critic re-filing this is producing noise.
