import { renderHook } from '@testing-library/react'

import { normalizeBootstrapLocale, useBootstrapI18n } from './useBootstrapI18n'

describe('bootstrap localization', () => {
  it('normalizes russian platform locales and falls back to english', () => {
    expect(normalizeBootstrapLocale('ru')).toBe('ru')
    expect(normalizeBootstrapLocale('ru-RU')).toBe('ru')
    expect(normalizeBootstrapLocale('en-US')).toBe('en')
    expect(normalizeBootstrapLocale(undefined)).toBe('en')
  })

  it('returns the requested dictionary', () => {
    const { result } = renderHook(() => useBootstrapI18n('ru'))

    expect(result.current.t('retry')).toBe('Повторить')
  })
})
