import { describe, expect, it } from 'vitest'

import { horizontalFovDeg, CINE_CAMERAS, relativeStops } from './cineCamera'
import { DEFAULT_DIRECTOR_SETTINGS, sanitizeDirectorSettings } from './directorSettings'

describe('director settings', () => {
  it('falls back to the kit defaults for anything that is not an object', () => {
    expect(sanitizeDirectorSettings(null)).toEqual(DEFAULT_DIRECTOR_SETTINGS)
    expect(sanitizeDirectorSettings('broken')).toEqual(DEFAULT_DIRECTOR_SETTINGS)
  })

  it('keeps valid stored values and drops the wrong type, unknown keys and bad enums', () => {
    const settings = sanitizeDirectorSettings({
      camera: { preset: 'not-a-camera' },
      look: { exposureEV: 1.5, output: 'agx', saturation: 'loud', stray: 3 },
      sun: { azimuthDeg: Number.NaN },
    })
    expect(settings.look.exposureEV).toBe(1.5)
    expect(settings.look.output).toBe('agx')
    expect(settings.look.saturation).toBe(DEFAULT_DIRECTOR_SETTINGS.look.saturation)
    expect('stray' in settings.look).toBe(false)
    expect(settings.camera.preset).toBe('scene')
    expect(settings.sun.azimuthDeg).toBe(DEFAULT_DIRECTOR_SETTINGS.sun.azimuthDeg)
  })

  it('defaults to the kit sun at [40, 52, 34]', () => {
    const { azimuthDeg, elevationDeg } = DEFAULT_DIRECTOR_SETTINGS.sun
    expect(azimuthDeg).toBeCloseTo((Math.atan2(40, 34) * 180) / Math.PI, 9)
    expect(elevationDeg).toBeCloseTo((Math.asin(52 / Math.hypot(40, 52, 34)) * 180) / Math.PI, 9)
  })
})

describe('cine camera presets', () => {
  it('frames the anamorphic squeeze as a doubled horizontal sensor', () => {
    const camera = CINE_CAMERAS['anamorphic-2x-40']
    expect(horizontalFovDeg(camera)).toBeCloseTo((2 * Math.atan(63.36 / 80) * 180) / Math.PI, 9)
  })

  it('reports zero stops for the reference exposure triangle', () => {
    expect(relativeStops(CINE_CAMERAS['venice2-24'])).toBeCloseTo(Math.log2(172.8 / 180), 9)
  })
})
