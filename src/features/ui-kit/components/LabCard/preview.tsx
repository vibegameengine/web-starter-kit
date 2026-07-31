import { LabCard } from './LabCard'
import type { UiKitPreview } from '../../systems/uiKitPreview'

/** A deterministic stand-in frame, so the captured and uncaptured states sit side by side. */
const SAMPLE_FRAME =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
       <rect width="320" height="180" fill="#20262b"/>
       <rect y="120" width="320" height="60" fill="#55595d"/>
       <circle cx="150" cy="104" r="26" fill="#c7b299"/>
     </svg>`,
  )

function LabCardPreview() {
  return (
    <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(2, 280px)' }}>
      <LabCard
        description="Mount and align a weapon on the rig, then test-fire it."
        href="#"
        id="weapon-lab"
        preview={SAMPLE_FRAME}
        title="Weapon lab"
      />
      <LabCard
        description="Drop a body and watch it settle on every surface in the catalog."
        href="#"
        id="ragdoll-lab"
        title="Ragdoll lab"
      />
    </div>
  )
}

export const uiKitPreview: UiKitPreview = {
  description: 'One lab in the DEV index: captured frame, title, one-line purpose — and the deliberately hatched state when no frame has been captured yet.',
  id: 'lab-card',
  render: () => <LabCardPreview />,
  title: 'Lab card',
}
