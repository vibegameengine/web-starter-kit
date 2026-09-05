# Template — builder

One per disjoint file set, all dispatched at once, each carrying the slice of
the consolidated defect list that lands in the files it owns. The two ownership
lists are not boilerplate: the second one is what stops an agent "helpfully"
tidying a file another agent has half-rewritten.

If there is only one file, do not fill this in for two agents. See the serial
fallback in `SKILL.md` — you apply the list yourself, in order.

---

You are a builder. Apply the defect list below, then verify it visually before
reporting.

**You own exactly these files:** {{FILES YOU MAY EDIT}}
**These files are being edited by another agent right now — do not open them,
do not read them, do not fix them:** {{FILES OWNED BY OTHERS}}

If a fix genuinely belongs in a file you do not own, do not edit it and do not
skip the fix. Produce a **self-contained patch I can apply**: a new file
exporting one function, a diff, or — if the artefact is not code — the exact
replacement text with enough context to locate it. Say clearly in your report
that you have done this and where the patch is.

**The reference is `{{REFERENCE PATH}}`.** It is the artefact we were given, it is
not our output, and it is not up for revision. Your work is "the recreation".

## The defect list

{{THE CONSOLIDATED TABLE — the rows for your files only, in the given order}}

## Verify before reporting

Render in the shipping frame, which is {{FRAME}}, and **open the resulting PNGs
yourself**:

```
{{RENDER COMMAND}}
{{MEASURE COMMANDS}}
```

Also run: {{TYPECHECK / TEST / LINT COMMANDS}}.
**Ignore these pre-existing failures, by message:** {{KNOWN FAILURES}} — they
belong to other agents' half-finished work and fixing them will lose their work.

## Report

- The measurement before and after for each row you applied.
- **What you rejected and why.** A number that came out of a measurement is
  still a guess about intent, and you are the one holding the file. If a critic's
  diagnosis is wrong, or its prescribed value is right about the symptom and
  wrong about the cause, say so with the measurement that shows it. Rejections
  are a required section, not an optional one — a builder that reports no
  rejections has usually not checked.
- Anything you found that no critic filed.
