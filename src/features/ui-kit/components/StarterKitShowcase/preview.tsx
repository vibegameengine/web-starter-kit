import { StarterKitShowcase } from './StarterKitShowcase'
import type { UiKitPreview } from '../../systems/uiKitPreview'

export const uiKitPreview: UiKitPreview = {
  description: 'The reusable capability index used on the starter screen.',
  id: 'starter-showcase',
  render: () => <StarterKitShowcase uiKitHref="/ui-kit/starter-showcase" />,
  title: 'Starter showcase',
}
