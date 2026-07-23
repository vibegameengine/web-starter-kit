import { useState } from 'react'

import { TouchActionButton } from './TouchActionButton'
import type { UiKitPreview } from '../../systems/uiKitPreview'

function TouchActionButtonPreview() { const [uses, setUses] = useState(0); return <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}><TouchActionButton label="Preview action" onPress={() => setUses((value) => value + 1)} cooldownFraction={uses % 2 ? 0.55 : 0}>✦</TouchActionButton><output>Presses: {uses}</output></div> }

export const uiKitPreview: UiKitPreview = { description: 'Low-latency touch action with haptic feedback and a cooldown presentation layer.', id: 'touch-action-button', render: () => <TouchActionButtonPreview />, title: 'Touch action' }
