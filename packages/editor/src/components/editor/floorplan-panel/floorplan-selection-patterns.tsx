type FloorplanSelectionPatternsProps = {
  selectedStroke: string
  slabHatchId: string
  slabStrokeWidth: number
  spacing: number
  wallHatchId: string
  wallStrokeWidth: number
}

export function FloorplanSelectionPatterns({
  selectedStroke,
  slabHatchId,
  slabStrokeWidth,
  spacing,
  wallHatchId,
  wallStrokeWidth,
}: FloorplanSelectionPatternsProps) {
  return (
    <defs>
      <pattern height={spacing} id={wallHatchId} patternUnits="userSpaceOnUse" width={spacing}>
        <line
          stroke={selectedStroke}
          strokeOpacity={1}
          strokeWidth={wallStrokeWidth}
          x1="0"
          x2={spacing}
          y1="0"
          y2={spacing}
        />
      </pattern>
      <pattern height={spacing} id={slabHatchId} patternUnits="userSpaceOnUse" width={spacing}>
        <line
          stroke={selectedStroke}
          strokeOpacity={0.78}
          strokeWidth={slabStrokeWidth}
          x1="0"
          x2={spacing}
          y1="0"
          y2={spacing}
        />
      </pattern>
    </defs>
  )
}
