import { FloorplanRegistryMoveOverlay } from '../../editor-2d/floorplan-registry-move-overlay'
import type { FloorplanRenderContextValue } from '../../editor-2d/floorplan-render-context'
import { FloorplanRenderProvider } from '../../editor-2d/floorplan-render-context'
import { FloorplanRegistryLayer } from '../../editor-2d/renderers/floorplan-registry-layer'

type FloorplanRegistrySceneLayerProps = {
  hatchPatternId: string
  palette: FloorplanRenderContextValue['palette']
  unitsPerPixel: number
}

export function FloorplanRegistrySceneLayer({
  hatchPatternId,
  palette,
  unitsPerPixel,
}: FloorplanRegistrySceneLayerProps) {
  return (
    <>
      <FloorplanRenderProvider
        hatchPatternId={hatchPatternId}
        palette={palette}
        unitsPerPixel={unitsPerPixel}
      >
        <FloorplanRegistryLayer />
      </FloorplanRenderProvider>
      <FloorplanRegistryMoveOverlay />
    </>
  )
}
