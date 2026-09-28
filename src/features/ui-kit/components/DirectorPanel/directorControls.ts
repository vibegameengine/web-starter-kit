import { CINE_CAMERAS } from '../../../../shared/lib/director/cineCamera'
import { OUTPUT_TRANSFORMS, type DirectorSection } from '../../../../shared/lib/director/directorSettings'

type ControlBase = {
  readonly key: string
  readonly label: string
  readonly section: DirectorSection
}

export type RangeControl = ControlBase & {
  readonly kind: 'range'
  readonly max: number
  readonly min: number
  readonly step: number
  readonly unit?: string
}

export type ColorControl = ControlBase & { readonly kind: 'color' }

export type ChoiceControl = ControlBase & {
  readonly kind: 'choice'
  readonly options: readonly { readonly label: string; readonly value: string }[]
}

export type DirectorControl = ChoiceControl | ColorControl | RangeControl

export type DirectorControlGroup = {
  readonly controls: readonly DirectorControl[]
  readonly id: string
  readonly title: string
}

const OUTPUT_LABELS: Record<string, string> = { aces: 'ACES filmic', agx: 'AgX', linear: 'Linear', neutral: 'Khronos neutral' }

const CAMERA_OPTIONS = [
  { label: 'Scene lens', value: 'scene' },
  ...Object.entries(CINE_CAMERAS).map(([value, camera]) => ({ label: camera.label, value })),
]

export const DIRECTOR_CONTROL_GROUPS: readonly DirectorControlGroup[] = [
  {
    id: 'camera',
    title: 'Cine camera',
    controls: [
      { kind: 'choice', section: 'camera', key: 'preset', label: 'Body · lens', options: CAMERA_OPTIONS },
      { kind: 'range', section: 'camera', key: 'focalMm', label: 'Focal length', min: 12, max: 135, step: 1, unit: 'mm' },
    ],
  },
  {
    id: 'look',
    title: 'Exposure · look',
    controls: [
      { kind: 'range', section: 'look', key: 'exposureEV', label: 'Exposure', min: -3, max: 3, step: 0.05, unit: 'EV' },
      { kind: 'range', section: 'look', key: 'contrast', label: 'Contrast', min: 0.8, max: 1.2, step: 0.01 },
      { kind: 'range', section: 'look', key: 'shadowLiftEV', label: 'Shadow lift', min: 0, max: 0.75, step: 0.01, unit: 'EV' },
      { kind: 'range', section: 'look', key: 'saturation', label: 'Saturation', min: 0, max: 1.25, step: 0.01 },
      { kind: 'range', section: 'look', key: 'balanceRedStops', label: 'Balance red', min: -0.15, max: 0.15, step: 0.005, unit: 'st' },
      { kind: 'range', section: 'look', key: 'balanceGreenStops', label: 'Balance green', min: -0.15, max: 0.15, step: 0.005, unit: 'st' },
      { kind: 'range', section: 'look', key: 'balanceBlueStops', label: 'Balance blue', min: -0.15, max: 0.15, step: 0.005, unit: 'st' },
      {
        kind: 'choice',
        section: 'look',
        key: 'output',
        label: 'Output transform',
        options: OUTPUT_TRANSFORMS.map((value) => ({ label: OUTPUT_LABELS[value], value })),
      },
      { kind: 'range', section: 'look', key: 'grain', label: 'Film grain', min: 0, max: 0.15, step: 0.005 },
    ],
  },
  {
    id: 'post',
    title: 'Glare · finish',
    controls: [
      { kind: 'range', section: 'post', key: 'glareIntensity', label: 'Glare', min: 0, max: 2, step: 0.01 },
      { kind: 'range', section: 'post', key: 'glareThreshold', label: 'Glare threshold', min: 0, max: 1.5, step: 0.01 },
      { kind: 'range', section: 'post', key: 'displayContrast', label: 'Display contrast', min: -0.2, max: 0.5, step: 0.01 },
      { kind: 'range', section: 'post', key: 'vignetteDarkness', label: 'Vignette', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'sun',
    title: 'Sun',
    controls: [
      { kind: 'range', section: 'sun', key: 'azimuthDeg', label: 'Azimuth', min: -180, max: 180, step: 0.5, unit: '°' },
      { kind: 'range', section: 'sun', key: 'elevationDeg', label: 'Elevation', min: 2, max: 89, step: 0.5, unit: '°' },
      { kind: 'range', section: 'sun', key: 'intensity', label: 'Intensity', min: 0, max: 8, step: 0.05 },
      { kind: 'color', section: 'sun', key: 'color', label: 'Colour' },
    ],
  },
  {
    id: 'ambient',
    title: 'Ambient · indirect',
    controls: [
      { kind: 'range', section: 'ambient', key: 'indirectEV', label: 'Indirect gain', min: -2, max: 2, step: 0.05, unit: 'EV' },
      { kind: 'range', section: 'ambient', key: 'indirectChroma', label: 'Indirect chroma', min: 0, max: 1, step: 0.01 },
      { kind: 'range', section: 'ambient', key: 'hemisphereIntensity', label: 'Sky dome', min: 0, max: 2, step: 0.01 },
      { kind: 'color', section: 'ambient', key: 'skyColor', label: 'Sky colour' },
      { kind: 'color', section: 'ambient', key: 'groundColor', label: 'Ground bounce' },
      { kind: 'range', section: 'ambient', key: 'fillIntensity', label: 'Shadow-side fill', min: 0, max: 2, step: 0.01 },
      { kind: 'color', section: 'ambient', key: 'fillColor', label: 'Fill colour' },
      { kind: 'range', section: 'ambient', key: 'environmentIntensity', label: 'Environment (IBL)', min: 0, max: 3, step: 0.01 },
      { kind: 'range', section: 'ambient', key: 'rimIntensity', label: 'Rim (demo scene)', min: 0, max: 3, step: 0.01 },
    ],
  },
]
