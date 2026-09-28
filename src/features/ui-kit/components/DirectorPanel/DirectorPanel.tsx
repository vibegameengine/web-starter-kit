import { CINE_CAMERAS, horizontalFovDeg, isCineCameraKey, relativeStops } from '../../../../shared/lib/director/cineCamera'
import {
  patchDirector,
  resetDirector,
  useDirectorSettings,
  type DirectorSettings,
} from '../../../../shared/lib/director/directorSettings'
import { DIRECTOR_CONTROL_GROUPS, type DirectorControl, type RangeControl } from './directorControls'
import styles from './DirectorPanel.module.css'

function readValue(settings: DirectorSettings, control: DirectorControl): number | string {
  return (settings[control.section] as Record<string, number | string>)[control.key]
}

function writeValue(control: DirectorControl, value: number | string): void {
  if (control.section === 'camera' && control.key === 'preset' && typeof value === 'string' && isCineCameraKey(value)) {
    patchDirector('camera', { focalMm: CINE_CAMERAS[value].focalMm, preset: value })
    return
  }
  patchDirector(control.section, { [control.key]: value })
}

function formatRange(control: RangeControl, value: number): string {
  const digits = control.step >= 1 ? 0 : control.step >= 0.1 ? 1 : 2
  return `${value.toFixed(digits)}${control.unit ? ` ${control.unit}` : ''}`
}

function ControlRow({ control, settings }: { readonly control: DirectorControl; readonly settings: DirectorSettings }) {
  const value = readValue(settings, control)
  const testId = `director-${control.section}-${control.key}`

  return (
    <label className={styles.row}>
      <span className={styles.label}>{control.label}</span>
      {control.kind === 'range' ? (
        <>
          <input
            data-testid={testId}
            max={control.max}
            min={control.min}
            onChange={(event) => writeValue(control, Number(event.currentTarget.value))}
            step={control.step}
            type="range"
            value={Number(value)}
          />
          <output className={styles.value}>{formatRange(control, Number(value))}</output>
        </>
      ) : null}
      {control.kind === 'color' ? (
        <input data-testid={testId} onChange={(event) => writeValue(control, event.currentTarget.value)} type="color" value={String(value)} />
      ) : null}
      {control.kind === 'choice' ? (
        <select data-testid={testId} onChange={(event) => writeValue(control, event.currentTarget.value)} value={String(value)}>
          {control.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : null}
    </label>
  )
}

function CameraReadout({ camera }: { readonly camera: DirectorSettings['camera'] }) {
  if (camera.preset === 'scene') return <p className={styles.readout} data-testid="director-camera-readout">Scene lens, untouched</p>
  const cine = CINE_CAMERAS[camera.preset]
  const stops = relativeStops(cine)
  return (
    <p className={styles.readout} data-testid="director-camera-readout">
      {`${horizontalFovDeg(cine, camera.focalMm).toFixed(1)}° horizontal · ${stops >= 0 ? '+' : ''}${stops.toFixed(2)} st vs ISO 800 T2.8 180° · ${cine.note}`}
    </p>
  )
}

export function DirectorPanel() {
  const settings = useDirectorSettings()

  return (
    <details className={styles.root} data-testid="director-panel">
      <summary className={styles.toggle} data-testid="director-panel-toggle">DIRECTOR</summary>
      <div className={styles.body}>
        {DIRECTOR_CONTROL_GROUPS.map((group) => (
          <details key={group.id} className={styles.group} data-testid={`director-group-${group.id}`} open={group.id === 'look'}>
            <summary className={styles.groupTitle}>{group.title}</summary>
            {group.controls.map((control) => <ControlRow key={`${control.section}.${control.key}`} control={control} settings={settings} />)}
            {group.id === 'camera' ? <CameraReadout camera={settings.camera} /> : null}
          </details>
        ))}
        <button className={styles.reset} data-testid="director-reset" onClick={resetDirector} type="button">RESET TO KIT LOOK</button>
      </div>
    </details>
  )
}
