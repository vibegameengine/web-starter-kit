import { useState } from 'react'

import { ControlButton } from '../ControlButton/ControlButton'
import { ControlChoice } from '../ControlChoice/ControlChoice'
import { ControlPanel } from './ControlPanel'
import type { UiKitPreview } from '../../systems/uiKitPreview'

const GRAVITY = [
  { id: 'earth', label: 'Earth' },
  { id: 'moon', label: 'Moon' },
  { id: 'zero', label: 'Zero' },
]

function ControlPanelPreview() {
  const [gravity, setGravity] = useState('earth')
  const [wireframe, setWireframe] = useState(false)

  return (
    <ControlPanel maxWidth={260} readout={gravity} title="World">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <ControlChoice
          activeId={gravity}
          label="Gravity"
          onSelect={setGravity}
          options={GRAVITY}
          testIdPrefix="preview-gravity"
        />
        <div style={{ display: 'flex', gap: 4 }}>
          <ControlButton active={wireframe} onClick={() => setWireframe((value) => !value)}>
            Colliders
          </ControlButton>
          <ControlButton variant="accent">Reset</ControlButton>
        </div>
      </div>
    </ControlPanel>
  )
}

export const uiKitPreview: UiKitPreview = {
  description: 'Glass control surface with a heading, a readout, a choice group and actions.',
  id: 'control-panel',
  render: () => <ControlPanelPreview />,
  title: 'Control panel',
}
