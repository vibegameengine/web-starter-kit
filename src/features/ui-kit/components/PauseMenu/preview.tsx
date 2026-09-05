import { useState } from 'react'

import { AudioSettingsControls } from '../AudioSettingsControls/AudioSettingsControls'
import { ControlButton } from '../ControlButton/ControlButton'
import { PauseMenu } from './PauseMenu'
import type { AudioSettingsValues } from '../AudioSettingsControls/AudioSettingsControls'
import type { PauseMenuEntry } from './PauseMenu'
import type { UiKitPreview } from '../../systems/uiKitPreview'

const ENTRIES: readonly PauseMenuEntry[] = [
  { id: 'settings', label: 'Sound settings' },
  { id: 'restart', label: 'Restart level' },
]

const STAGE = {
  position: 'relative',
  overflow: 'hidden',
  width: 460,
  height: 340,
  borderRadius: 10,
  background: 'repeating-linear-gradient(45deg, #16242f 0 14px, #101b24 14px 28px)',
  // Keeps the menu's fixed backdrop inside this card instead of over the
  // gallery's own chrome, so both views can be shown side by side.
  contain: 'paint',
} as const

function Stage({ children, label }: { readonly children: React.ReactNode; readonly label: string }) {
  return (
    <div style={STAGE}>
      {/* The menu's backdrop is `position: fixed; z-index: 40` and covers the
          whole stage, so this caption has to sit above 40 or it is read through
          a blurred 62% scrim. */}
      <div style={{ position: 'relative', zIndex: 41, padding: 12, color: '#cfe6f5', font: "800 11px/1 'Trebuchet MS', sans-serif", letterSpacing: '0.1em' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function PauseMenuPreview() {
  const [view, setView] = useState<string | null>(null)
  const [values, setValues] = useState<AudioSettingsValues>({ master: 0.9, music: 0.55, muted: false, sfx: 1 })

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
      {/* Both levels, side by side, because the whole point of this part is that
          there ARE two: a list you can walk, and the screen one entry opens. */}
      <Stage label="LIVE — CLICK THROUGH IT">
        <PauseMenu
          activeEntryId={view}
          data-testid="preview-pause-menu"
          entries={ENTRIES}
          hint="Escape closes this menu"
          onBack={() => setView(null)}
          onResume={() => setView(null)}
          onSelect={(id) => setView(id === 'restart' ? null : id)}
        >
          <AudioSettingsControls
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
            values={values}
          />
        </PauseMenu>
      </Stage>
      <Stage label="THE SETTINGS SCREEN, PINNED OPEN">
        <PauseMenu
          activeEntryId="settings"
          entries={ENTRIES}
          onBack={() => {}}
          onResume={() => {}}
          onSelect={() => {}}
        >
          <AudioSettingsControls onChange={() => {}} values={values} />
        </PauseMenu>
      </Stage>
      {/* Full width under both stages, on a dark strip of its own. At 460 px
          each the stages already fill a row, so a third flex child lands beside
          them on the gallery's light grid — where this control, which is drawn
          light-on-dark, is invisible. */}
      <div style={{ flexBasis: '100%', padding: 10, borderRadius: 10, background: '#101b24' }}>
        <ControlButton onClick={() => setView(null)}>Reset the live one</ControlButton>
      </div>
    </div>
  )
}

export const uiKitPreview: UiKitPreview = {
  description: 'Game menu over a stand-in game: the entry list, and the sound screen one entry opens.',
  id: 'pause-menu',
  render: () => <PauseMenuPreview />,
  title: 'Pause menu',
}

