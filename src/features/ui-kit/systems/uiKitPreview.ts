import type { ReactNode } from 'react'

export interface UiKitPreview {
  readonly description: string
  readonly id: string
  readonly render: () => ReactNode
  readonly title: string
}

export interface UiKitPreviewModule {
  readonly uiKitPreview: UiKitPreview
}
