import type { PointerEvent as ReactPointerEvent } from 'react'
import { EDITOR_CURSOR } from './constants'

type ViewBoxRect = {
  minX: number
  minY: number
  width: number
  height: number
}

type FloorplanMarqueeInteractionLayerProps = {
  isActive: boolean
  onPointerCancel: (event: ReactPointerEvent<SVGRectElement>) => void
  onPointerDown: (event: ReactPointerEvent<SVGRectElement>) => void
  onPointerMove: (event: ReactPointerEvent<SVGRectElement>) => void
  onPointerUp: (event: ReactPointerEvent<SVGRectElement>) => void
  viewBox: ViewBoxRect
}

export function FloorplanMarqueeInteractionLayer({
  isActive,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  viewBox,
}: FloorplanMarqueeInteractionLayerProps) {
  if (!isActive) {
    return null
  }

  return (
    <rect
      fill="transparent"
      height={viewBox.height}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ cursor: EDITOR_CURSOR }}
      width={viewBox.width}
      x={viewBox.minX}
      y={viewBox.minY}
    />
  )
}
