import { useState } from 'react'

import { ControlButton } from './ControlButton'
import { ControlPanel } from '../ControlPanel/ControlPanel'
import type { UiKitPreview } from '../../systems/uiKitPreview'

function ControlButtonPreview() {
  const [active, setActive] = useState(true)

  return (
    <ControlPanel maxWidth={300} title="Button">
      {/* Every state the part supports. It is a visible part of the pause menu
          and of the audio settings, and the kit's gate says a visible part is
          inspected on its own page before the composite that uses it. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <ControlButton>Default</ControlButton>
        <ControlButton active={active} onClick={() => setActive((value) => !value)}>
          {active ? 'Pressed' : 'Toggle me'}
        </ControlButton>
        <ControlButton disabled>Disabled</ControlButton>
        <ControlButton variant="accent">Accent</ControlButton>
        <ControlButton disabled variant="accent">
          Accent off
        </ControlButton>
      </div>
    </ControlPanel>
  )
}

export const uiKitPreview: UiKitPreview = {
  description: 'The kit small button: default, pressed, disabled, and the accent action in both states.',
  id: 'control-button',
  render: () => <ControlButtonPreview />,
  title: 'Control button',
}
