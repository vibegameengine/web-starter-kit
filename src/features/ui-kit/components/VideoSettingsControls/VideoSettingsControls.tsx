import type { ReactNode } from 'react'

import { ControlChoice } from '../ControlChoice/ControlChoice'
import styles from './VideoSettingsControls.module.css'

/**
 * A visible caption beside a choice group.
 *
 * `ControlChoice` carries its label in `aria-label` only, which is right where
 * the surrounding panel already says what the row is — the demo scene's render
 * switches. Three unlabelled rows stacked in a settings screen are three rows of
 * anonymous buttons, so the caption is added HERE rather than by changing a
 * shared control that other surfaces rely on looking the way it does.
 */
function LabelledRow({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.control}>{children}</div>
    </div>
  )
}

export type VideoSettingsValues = {
  /** Render tier id, as the app's graphics store spells it. */
  readonly quality: string
  /** Frame cap in Hz; `0` means uncapped. */
  readonly frameCap: number
  readonly shadows: string
}

export type VideoSettingsOption = {
  readonly id: string
  readonly label: string
}

type VideoSettingsControlsProps = {
  readonly 'data-testid'?: string
  readonly frameCaps: readonly number[]
  readonly onChange: (patch: Partial<VideoSettingsValues>) => void
  readonly qualities: readonly VideoSettingsOption[]
  readonly shadowModes: readonly VideoSettingsOption[]
  readonly values: VideoSettingsValues
}

/**
 * The picture settings, as a presentation-only part.
 *
 * Like its sound counterpart: values in, one patch out, no store and no
 * knowledge of what a tier means. The OPTIONS are passed in rather than listed
 * here, because the app's graphics config owns which tiers exist and a kit
 * component that hard-coded them would silently go stale the day one is added.
 */
export function VideoSettingsControls({
  'data-testid': testId,
  frameCaps,
  onChange,
  qualities,
  shadowModes,
  values,
}: VideoSettingsControlsProps) {
  return (
    <div className={styles.group} data-testid={testId}>
      <LabelledRow label="Quality">
        <ControlChoice
          activeId={values.quality}
          label="Quality"
          onSelect={(quality) => onChange({ quality })}
          options={[...qualities]}
          testIdPrefix="video-quality"
        />
      </LabelledRow>
      <LabelledRow label="Shadows">
        <ControlChoice
          activeId={values.shadows}
          label="Shadows"
          onSelect={(shadows) => onChange({ shadows })}
          options={[...shadowModes]}
          testIdPrefix="video-shadows"
        />
      </LabelledRow>
      <LabelledRow label="Frame cap">
        <ControlChoice
          activeId={String(values.frameCap)}
          label="Frame cap"
          onSelect={(id) => onChange({ frameCap: Number(id) })}
          // 0 is "uncapped" everywhere in the app; spelling it as a number here
          // would put a bare "0" in front of the player as if it were a rate.
          options={frameCaps.map((cap) => ({ id: String(cap), label: cap === 0 ? 'Off' : String(cap) }))}
          testIdPrefix="video-framecap"
        />
      </LabelledRow>
    </div>
  )
}
