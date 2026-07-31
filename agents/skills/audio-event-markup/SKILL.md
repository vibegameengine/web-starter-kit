---
name: audio-event-markup
description: >-
  Turn a raw multi-hit sound recording into a set of isolated one-shots, and
  drive them from the exact frame an animation event happens instead of a timer.
  Two linked techniques: (1) SLICE a continuous recording (footsteps, gunfire
  bursts, impacts, dialogue takes) into individually triggerable clips by ONSET,
  measuring each cut and proving it visually; (2) MARK an animation clip with the
  phase at which a contact/emit event occurs (foot plant, hand hit, muzzle) so
  playback stays in sync through retiming and any frame rate. Use whenever asked
  to "разметить"/"segment"/"split"/"cut up" an audio file, isolate sounds from a
  recording, build a footstep/impact variant pool, or fire a sound/VFX/event on
  an animation beat. Trigger on: "разметь звук", "isolate sounds", "split this
  recording", "one-shots from a take", "footstep sounds", "sound on the animation
  step", "fire on the frame the foot lands", "audio markup", "animation event
  markup", "contact timing".
---

# Audio event markup — isolate sounds, fire them on animation events

Two techniques that usually ship together: cut a recording into isolated
one-shots, then trigger those one-shots from the frame an animation event
actually occurs. Each is useful alone; together they turn "a wav of someone
walking" into "boots that land exactly when the rig's heel does."

Everything below is a **measure-then-prove** loop. You never trust a threshold
or a timing — you render it and look at it.

---

## Part A — slice a recording into isolated one-shots

**Goal:** N discrete, individually playable clips from one continuous take, each
starting a hair before its attack and ending after its tail, with no click.

### 1. Characterize the whole file first

Load at native sample rate, keep channels. Print duration, sample rate, channel
count, RMS floor, peak. Detect events and read the cadence before cutting
anything — it tells you how many one-shots to expect and whether the material is
clean or reverberant.

### 2. Segment by ONSET, not by an energy gate

The trap: a simple "amplitude above floor → in a segment" gate **merges adjacent
events** whenever one event's tail (reverb, ring-out, decay) has not fallen below
the gate before the next event's attack. Recorded footfalls, gunshots in a room,
and any wet/reverberant source all overlap this way. An energy gate will report
half the events, each a fused double.

Instead detect **onsets** (attack transients) and let each onset own the span up
to the next:

- Find onset frames with an onset-strength / spectral-flux detector.
- For each onset, **refine the true attack**: walk to the loudest sample within a
  short window (a few tens of ms) after the detected frame — the detector fires a
  little early.
- **Start** = attack minus a small pre-roll (~10 ms) so the transient is intact.
- **End** = walk forward to where this event's own energy has decayed to a fixed
  level **below its own peak** (≈ −42 dB), capped just before the next onset.
  Measuring the tail relative to *this event's* peak, not a global floor, is what
  keeps a loud event's reverb from bleeding into the next clip.

### 3. Cut clean

- Apply a short fade-in (~4 ms) and a longer fade-out (~40 ms, slightly curved).
  Hard cuts on non-zero samples click; these fades are inaudible and remove it.
- Encode each clip to the delivery format. Verify the encoder did not prepend
  silence/padding that would delay the trigger — decode a few clips back and
  confirm the attack sits in the first few ms.

### 4. Prove it — ALWAYS render an image, never eyeball numbers

Numbers lie about overlap and mis-cuts. Produce, and actually look at:

- A **full-file overlay**: waveform + spectrogram with every segment's start
  (green) / end (red) drawn on top. One glance shows a merged pair or a missed
  event.
- A **contact sheet**: each cut clip's waveform in its own tile, labelled with
  duration and peak. This exposes a clip that starts late, ends early, or is a
  fused double.
- Zoom the head and tail of the file to confirm the first attack and last decay
  are inside a clip, and that any junk before the first real event is excluded.

### 5. Characterize every clip and write a manifest

For each clip record: source offset, duration, peak dB, RMS, spectral centroid,
time-to-peak. This is what lets you **curate a variant pool** — pick the cleanest
6–8, drop outliers. Watch two things:

- **Loudness spread.** If the quietest and loudest chosen variants differ by
  double-digit dB, a random pool will audibly "drop" steps. Either normalize
  peaks toward a common level (keeping ±2 dB of natural variation) or exclude the
  outliers.
- **Double-hits.** A clip whose peak lands tens of ms after its start (not at the
  attack) is a compound event (heel-then-toe, etc.). Keep it only on purpose.

Emit a small markup file (JSON) next to the clips: source name, sample rate, the
per-clip stats, and a note on anything excluded. Never silently drop material —
record what you cut and why.

---

## Part B — mark an animation clip with event phases

**Goal:** know the exact moment in a locomotion/action clip when the event fires
(foot plant, weapon contact, emit point), expressed so it survives re-export and
playback-rate changes.

### 1. Store a PHASE (0..1 of the clip), never a time in seconds

A second-based mark drifts the instant the clip is retimed (`timeScale`) or
re-exported at a different frame rate. A phase — fraction of the clip duration —
is invariant to both. Convert to time only at the moment you compare against the
live playhead.

### 2. Measure the event offline from the rig, don't guess

Play the clip through a **real animation mixer** and sample the driving bone's
**world-space** position across the cycle (hundreds of samples). For a footstep,
the event is a heel/toe contact:

- Contact = the bone enters the **bottom band of its own vertical travel** (e.g.
  lowest 5%), taking the frame it *enters* the band — not the midpoint of the
  descent, which fires early.
- A locomotion cycle usually starts mid-stance, so the contact search must
  **wrap around the loop**; expect one plant per foot per cycle and assert it.

Do this in a small offline script (convert the source rig the same way the
runtime does, so bone names and scale match) and **paste the measured phases into
a pure data module**. Re-run and re-paste whenever the source clip is replaced.

### 3. Fire once per crossing, from the clip's own playhead

At runtime, read the active action's phase each frame (`action.time / duration`,
mod 1) and compare against last frame's phase. Emit every marked event whose
phase lies in the **half-open interval `(previous, current]`** — half-open so an
event fires exactly once no matter how a frame lands on it. Handle the two hard
cases explicitly, and unit-test them:

- **Loop wrap** (`current < previous`): the window spans the seam; an event just
  past the end still fires.
- **Stutter/long frame** that swallows more than a full cycle: report each event
  **once**, not a machine-gun burst of the whole stride.
- **Take switch / reset**: when the action is reset or swapped, **resync** the
  stored phase (set it to "unknown") so you don't replay every event between the
  old take's playhead and the new one.

Keep this crossing logic a **pure function** (contacts, previousPhase,
currentPhase) → events. It is trivially testable and the only subtle part.

---

## Wiring: the rig reports, the caller decides the sound

Separation that keeps this reusable:

- The **rig/animation layer emits the event** (`onFootstep(contact)`), carrying
  only *what happened* (which foot, which contact) — no audio knowledge.
- The **caller maps event → sound**: picks the variant, sets the per-gait volume
  (a sneak is near-silent, a sprint is loud), applies detune. One repeated
  one-shot reads as a machine, so **never replay the previous variant back-to-back
  and detune each play a few percent**.
- Put the audio one-shots and the trigger **next to the entity that makes the
  sound**, so anything using that rig (player, NPC) triggers it the same way.

## Verify end-to-end by counting REAL playbacks

Don't trust that your event fired — count the audio the browser actually played.
In a headed run, patch the audio graph's play primitive (e.g. wrap
`AudioBufferSourceNode.prototype.start`) to log a timestamp per real voice, then
drive each gait for a fixed time and check:

- **Idle → zero** playbacks.
- **Walk cadence** ≈ half the cycle time (two plants per cycle), steady gap.
- **Sprint** faster; an asymmetric gap pattern is usually the *animation's* own
  stance timing, not a bug — confirm it against the measured phases before
  "fixing" it.

If a gait reports zero, the character may simply be blocked against geometry —
alternate directions before concluding the markup is wrong.

## Tooling reality

- Prefer libraries already present for offline DSP (onset detection, RMS,
  spectral features) and image output; a bundled ffmpeg binary from an existing
  dependency covers decode/encode when a system ffmpeg is absent.
- Convert animation source the **same way the runtime does** (same FBX→glTF path)
  so sampled bone names, hierarchy, and scale match what plays in-engine.
- Keep the offline markup script in the repo's scripts area with a header saying
  how to re-run it and where to paste the numbers — the phases are only as good
  as the last time someone re-measured them against the current source clip.
