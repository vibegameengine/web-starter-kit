import { bootstrapEn } from './en'
import { bootstrapRu } from './ru'

export const bootstrapTranslations = {
  en: bootstrapEn,
  ru: bootstrapRu,
} as const

export type BootstrapLocale = keyof typeof bootstrapTranslations
