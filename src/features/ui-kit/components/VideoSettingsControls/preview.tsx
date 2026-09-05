import { useState } from 'react'

import { ControlPanel } from '../ControlPanel/ControlPanel'
import { VideoSettingsControls } from './VideoSettingsControls'
import type { VideoSettingsValues } from './VideoSettingsControls'
import type { UiKitPreview } from '../../systems/uiKitPreview'

const QUALITIES = [
  { id: 'performance', label: 'Performance' },
  { id: 'economy', label: 'Economy' },
]
const SHADOWS = [
  { id: 'cached', label: 'Cached' },
  { id: 'legacy', label: 'Legacy' },
]
const CAPS = [0, 120, 60, 45, 30]

function VideoSettingsControlsPreview() {
  const [values, setValues] = useState<VideoSettingsValues>({
    frameCap: 60,
    quality: 'performance',
    shadows: 'cached',
  })

  return (
    <ControlPanel maxWidth={320} readout={values.quality} title="Video">
      <VideoSettingsControls
        data-testid="preview-video-settings"
        frameCaps={CAPS}
        onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
        qualities={QUALITIES}
        shadowModes={SHADOWS}
        values={values}
      />
    </ControlPanel>
  )
}

export const uiKitPreview: UiKitPreview = {
  description: 'Quality, shadow mode and frame cap as choice groups; every option is clickable.',
  id: 'video-settings-controls',
  render: () => <VideoSettingsControlsPreview />,
  title: 'Video settings',
}

