import { useState } from 'react'

import { AudioSettingsControls } from './AudioSettingsControls'
import { ControlPanel } from '../ControlPanel/ControlPanel'
import type { AudioSettingsValues } from './AudioSettingsControls'
import type { UiKitPreview } from '../../systems/uiKitPreview'

function AudioSettingsControlsPreview() {
  const [values, setValues] = useState<AudioSettingsValues>({
    master: 0.85,
    music: 0.6,
    muted: false,
    sfx: 1,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ControlPanel maxWidth={300} readout={values.muted ? 'muted' : 'live'} title="Sound">
        <AudioSettingsControls
          data-testid="preview-audio-settings"
          onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          values={values}
        />
      </ControlPanel>
      {/* The muted state is a real state of this part, so it gets shown rather
          than left for someone to discover by clicking. */}
      <ControlPanel maxWidth={300} readout="muted" title="Sound · muted">
        <AudioSettingsControls
          data-testid="preview-audio-settings-muted"
          onChange={() => {}}
          values={{ master: 0.85, music: 0.6, muted: true, sfx: 1 }}
        />
      </ControlPanel>
    </div>
  )
}

export const uiKitPreview: UiKitPreview = {
  description: 'Master / music / effects faders with a mute toggle, live and in its muted state.',
  id: 'audio-settings-controls',
  render: () => <AudioSettingsControlsPreview />,
  title: 'Audio settings',
}
