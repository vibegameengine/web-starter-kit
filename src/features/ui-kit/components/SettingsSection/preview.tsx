import { useState } from 'react'

import { ControlPanel } from '../ControlPanel/ControlPanel'
import { ControlSlider } from '../ControlSlider/ControlSlider'
import { SettingsSection } from './SettingsSection'
import type { UiKitPreview } from '../../systems/uiKitPreview'

function SettingsSectionPreview() {
  const [value, setValue] = useState(0.7)

  return (
    <ControlPanel maxWidth={320} title="Settings">
      {/* Two of them, because the part only earns its existence when there is
          more than one: the divider and the spacing between sections are what
          this component actually contributes. */}
      <SettingsSection data-testid="preview-section-first" title="Sound">
        <ControlSlider label="Master" onChange={setValue} value={value} />
      </SettingsSection>
      <SettingsSection
        data-testid="preview-section-second"
        note="Applies when the scene next loads"
        title="Video"
      >
        <ControlSlider label="Gamma" onChange={() => {}} value={0.5} />
      </SettingsSection>
    </ControlPanel>
  )
}

export const uiKitPreview: UiKitPreview = {
  description: 'A labelled block inside a settings screen, shown twice so its divider and note are visible.',
  id: 'settings-section',
  render: () => <SettingsSectionPreview />,
  title: 'Settings section',
}

