export type Patch9Insets = {
  readonly bottom: number
  readonly left: number
  readonly right: number
  readonly top: number
}

export type Patch9Config = {
  readonly border: Patch9Insets
  readonly disabledImage?: string
  readonly image: string
  readonly slice: Patch9Insets
  readonly textColor?: string
}
