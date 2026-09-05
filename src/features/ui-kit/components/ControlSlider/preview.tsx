import { useState } from 'react'

import { ControlPanel } from '../ControlPanel/ControlPanel'
import { ControlSlider } from './ControlSlider'
import type { UiKitPreview } from '../../systems/uiKitPreview'

function ControlSliderPreview() {
  const [master, setMaster] = useState(0.8)
  const [music, setMusic] = useState(0.35)
  const [sensitivity, setSensitivity] = useState(2.4)

  return (
    <ControlPanel maxWidth={280} title="Slider">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Every state the part supports, on one page: a normal fader, one at
            each end of its travel, a non-percentage format, and disabled. */}
        <ControlSlider label="Master" onChange={setMaster} value={master} data-testid="preview-master" />
        <ControlSlider label="Music" onChange={setMusic} value={music} data-testid="preview-music" />
        <ControlSlider label="Empty" onChange={() => {}} value={0} data-testid="preview-empty" />
        <ControlSlider label="Full" onChange={() => {}} value={1} data-testid="preview-full" />
        <ControlSlider
          data-testid="preview-sensitivity"
          format={(value) => value.toFixed(1)}
          label="Sensitivity"
          max={5}
          min={0.5}
          onChange={setSensitivity}
          step={0.1}
          value={sensitivity}
        />
        <ControlSlider
          data-testid="preview-disabled"
          disabled
          label="Locked"
          onChange={() => {}}
          value={0.5}
        />
      </div>
    </ControlPanel>
  )
}

export const uiKitPreview: UiKitPreview = {
  description:
    'Labelled fader with a lit track and a value readout: normal, at both ends of its travel, a custom format and disabled.',
  id: 'control-slider',
  render: () => <ControlSliderPreview />,
  title: 'Control slider',
}
