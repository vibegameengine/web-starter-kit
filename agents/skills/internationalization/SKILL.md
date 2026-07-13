---
name: internationalization
description: >-
  Localize this React game into Russian and English with feature-owned,
  type-safe dictionaries. Use whenever adding or translating UI copy, locale
  detection, a language selector, a `t(key)` call, `ru/en` files, or localized
  bootstrap/menu/HUD content. Enforces the project's FSD boundaries, matching
  dictionary keys, browser-locale fallback, and focused localization tests.
---

# Internationalization — feature-owned, typed ru/en copy

Follow the `cozy-solitaire` pattern already adopted here:
`src/features/bootstrap/localization`,
`src/features/ui-kit/localization/game-menu`, and the app-owned main-menu screen
at `src/app/ui/main-menu/localization` are canonical examples.

## Rules

1. Before adding files under `src/`, load `fsd-ecs-architecture`.
2. Keep copy with its owning feature in `features/<slice>/localization/`.
   Do not create one giant app dictionary and do not import another feature's
   translations.
3. Create exactly these files for a new localized feature:
   `en.ts`, `ru.ts`, `register.ts`, and `use<Feature>I18n.ts`.
4. Give `en.ts` and `ru.ts` the same keys. Type keys from the English
   dictionary so a missing or misspelled `t()` key is a TypeScript error.
5. Translate user-facing UI strings only. Do not translate IDs, routes, saved
   data, class identifiers, asset names, or simulation values.

## Standard implementation

```ts
// en.ts and ru.ts must share every key.
export const featureEn = {
  title: 'Settings',
  apply: 'Apply',
} as const

// register.ts
import { featureEn } from './en'
import { featureRu } from './ru'

export const featureTranslations = { en: featureEn, ru: featureRu } as const
export type FeatureLocale = keyof typeof featureTranslations

// useFeatureI18n.ts
import { useMemo } from 'react'
import { featureTranslations, type FeatureLocale } from './register'

type TranslationKey = keyof (typeof featureTranslations)['en']

export function useFeatureI18n(localeOverride?: FeatureLocale) {
  const locale = localeOverride ?? getInitialFeatureLocale()
  const dictionary = useMemo(() => featureTranslations[locale], [locale])

  function t(key: TranslationKey): string {
    return dictionary[key]
  }

  return { locale, t }
}

export function normalizeFeatureLocale(rawLocale: string | null | undefined): FeatureLocale {
  return rawLocale?.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

function getInitialFeatureLocale(): FeatureLocale {
  return typeof navigator === 'undefined' ? 'ru' : normalizeFeatureLocale(navigator.language)
}
```

Use it in UI code only:

```tsx
const { t } = useFeatureI18n()

return <button type="button">{t('apply')}</button>
```

## Locale ownership and propagation

- The bootstrap feature detects `navigator.language` itself because it renders
  before ordinary UI; use `getInitialBootstrapLocale()` there.
- A feature that owns a language setting may keep `locale` in state and expose
  `setLocale`; pass that locale to nested feature hooks as an override.
- Until such a setting exists, each screen may detect the browser locale with
  its own feature-local hook. Do not add a global store merely for two strings.
- When a parent owns the locale, pass it to child features explicitly rather
  than creating a cross-feature import.

## Bootstrap contract

`BootstrapGate` must derive its default labels from
`useBootstrapI18n(viewModel.locale)`. Leave its `labels` prop as an explicit
override for an embedding host; do not hard-code English labels in `main.tsx`.

## Verification

1. Add a focused hook test: locale normalization (`ru`, `ru-RU`, fallback) and
   a known `t(key)` from each requested language.
2. Run ESLint for the changed feature and `vitest` for the localization tests.
3. In a headed browser, verify Russian UI under a `ru-*` browser locale and
   English under another locale. Inspect overflow: translated copy often changes
   button width and line count.
4. Keep translations deterministic: no async fetch is allowed before the
   bootstrap first frame unless the user explicitly requests remote locales.
