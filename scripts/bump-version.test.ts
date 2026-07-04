import { describe, expect, it } from 'vitest'
import { bumpVersion, parseReleaseType } from './bump-version.ts'

describe('parseReleaseType', () => {
  it('accepts supported release types', () => {
    expect(parseReleaseType('major')).toBe('major')
    expect(parseReleaseType('minor')).toBe('minor')
    expect(parseReleaseType('patch')).toBe('patch')
  })

  it('rejects unknown release types', () => {
    expect(() => parseReleaseType('foo')).toThrow(/major, minor, patch/)
  })
})

describe('bumpVersion', () => {
  it('bumps patch version', () => {
    expect(bumpVersion('0.1.0', 'patch')).toBe('0.1.1')
  })

  it('bumps minor version and resets patch', () => {
    expect(bumpVersion('0.1.9', 'minor')).toBe('0.2.0')
  })

  it('bumps major version and resets minor and patch', () => {
    expect(bumpVersion('2.7.9', 'major')).toBe('3.0.0')
  })

  it('rejects non-semver values', () => {
    expect(() => bumpVersion('1.2', 'patch')).toThrow(/semver x.y.z/)
  })
})
