import { Patch9Button, Patch9Surface } from './Patch9Button'
import danceButtonFrameUrl from '../DanceControl/assets/dance-button-frame.generated.png'
import type { UiKitPreview } from '../../systems/uiKitPreview'

const patch9 = {
  border: { bottom: 22, left: 26, right: 26, top: 22 },
  image: danceButtonFrameUrl,
  slice: { bottom: 34, left: 34, right: 34, top: 34 },
  textColor: '#fff2cc',
} as const

export const uiKitPreview: UiKitPreview = {
  description: 'Canvas-rendered nine-slice surfaces that keep their frame intact at any size.',
  id: 'patch9',
  render: () => <div style={{ display: 'grid', gap: 18, placeItems: 'center', minWidth: 360 }}><Patch9Surface patch9={patch9} style={{ padding: '22px 36px' }}>A resizable surface</Patch9Surface><Patch9Button patch9={patch9} style={{ padding: '22px 36px' }}>Patch9 button</Patch9Button></div>,
  title: 'Patch9 primitives',
}
