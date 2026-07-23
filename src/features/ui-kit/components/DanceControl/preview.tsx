import { useState } from 'react'

import { DanceControl } from './DanceControl'
import type { UiKitPreview } from '../../systems/uiKitPreview'

function DanceControlPreview() {
  const [isDancing, setIsDancing] = useState(false)
  return <DanceControl isDancing={isDancing} onToggle={() => setIsDancing((value) => !value)} startAriaLabel="Start dance" startLabel="Dance" stopAriaLabel="Stop dance" stopLabel="Stop dance" />
}

export const uiKitPreview: UiKitPreview = {
  description: 'Interactive Patch9 action control with caller-owned state.',
  id: 'dance-control',
  render: () => <DanceControlPreview />,
  title: 'Dance control',
}
