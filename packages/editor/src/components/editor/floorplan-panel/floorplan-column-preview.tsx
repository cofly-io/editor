import type { FloorplanColumnEntry } from './types'

type FloorplanColumnPreviewProps = {
  entry: FloorplanColumnEntry | null
  unitsPerPixel: number
}

export function FloorplanColumnPreview({ entry, unitsPerPixel }: FloorplanColumnPreviewProps) {
  if (!entry) {
    return null
  }

  return (
    <polygon
      fill="rgba(167, 139, 250, 0.24)"
      pointerEvents="none"
      points={entry.points}
      stroke="rgba(124, 58, 237, 0.8)"
      strokeDasharray={`${Math.max(unitsPerPixel * 4, 0.08)} ${Math.max(unitsPerPixel * 3, 0.06)}`}
      strokeWidth={Math.max(unitsPerPixel * 1.6, 0.04)}
    />
  )
}
