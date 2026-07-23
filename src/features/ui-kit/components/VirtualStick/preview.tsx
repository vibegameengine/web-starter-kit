import { useState } from 'react'

import { VirtualStick } from './VirtualStick'
import type { UiKitPreview } from '../../systems/uiKitPreview'

function VirtualStickPreview() { const [vector, setVector] = useState({ x: 0, y: 0 }); return <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}><VirtualStick label="Movement stick" onChange={setVector} /><output>{vector.x.toFixed(2)}, {vector.y.toFixed(2)}</output></div> }

export const uiKitPreview: UiKitPreview = { description: 'Floating pointer-captured analog input with neutral visual slots.', id: 'virtual-stick', render: () => <VirtualStickPreview />, title: 'Virtual stick' }
