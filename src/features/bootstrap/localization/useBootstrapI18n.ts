import { useMemo } from 'react'

import { bootstrapTranslations, type BootstrapLocale } from './register'

type TranslationKey = keyof (typeof bootstrapTranslations)['en']

export function useBootstrapI18n(localeOverride?: BootstrapLocale) {
  const locale = localeOverride ?? getInitialBootstrapLocale()
  const dictionary = useMemo(() => bootstrapTranslations[locale], [locale])

  function t(key: TranslationKey): string {
    return dictionary[key]
  }

  return { locale, t }
}

export function getInitialBootstrapLocale(): BootstrapLocale {
  if (typeof navigator === 'undefined') {
    return 'ru'
  }

  return normalizeBootstrapLocale(navigator.language)
}

export function normalizeBootstrapLocale(rawLocale: string | null | undefined): BootstrapLocale {
  return rawLocale?.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}
