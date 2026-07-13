import { describe, expect, test } from 'bun:test'
import {
  getActivePolygonDraftPoints,
  getConfirmedPolygonDraftPoints,
  getPolygonDraftClosingSegment,
  getPolygonDraftPointAction,
  getPolygonDraftPolygonPoints,
  getPolygonDraftPolylinePoints,
} from './polygon-draft'

describe('floorplan polygon draft helpers', () => {
  test('ignores duplicate consecutive points', () => {
    const points = [
      [0, 0],
      [1, 0],
    ] as [number, number][]

    expect(getPolygonDraftPointAction([...points], [1, 0])).toEqual({
      type: 'ignore',
      points: [...points],
    })
  })

  test('completes when clicking near the first point after three points', () => {
    const points = [
      [0, 0],
      [4, 0],
      [4, 4],
    ] as [number, number][]

    expect(getPolygonDraftPointAction(points, [0.1, 0.1])).toEqual({
      type: 'complete',
      points,
    })
  })

  test('appends non-closing points and confirms optional cursor point', () => {
    const points = [
      [0, 0],
      [4, 0],
    ] as [number, number][]

    expect(getPolygonDraftPointAction(points, [4, 4])).toEqual({
      type: 'append',
      points: [
        [0, 0],
        [4, 0],
        [4, 4],
      ],
    })
    expect(getConfirmedPolygonDraftPoints(points, [4, 4])).toEqual([
      [0, 0],
      [4, 0],
      [4, 4],
    ])
  })

  test('requires at least three points to confirm', () => {
    expect(
      getConfirmedPolygonDraftPoints(
        [
          [0, 0],
          [4, 0],
        ],
        undefined,
      ),
    ).toBeNull()
  })

  test('selects active draft points by build mode', () => {
    const ceiling = [[1, 1]] as [number, number][]
    const slab = [[2, 2]] as [number, number][]
    const zone = [[3, 3]] as [number, number][]

    expect(
      getActivePolygonDraftPoints({
        ceilingDraftPoints: ceiling,
        isCeilingBuildActive: false,
        isSlabBuildActive: false,
        isZoneBuildActive: true,
        slabDraftPoints: slab,
        zoneDraftPoints: zone,
      }),
    ).toBe(zone)
  })

  test('formats draft polyline, polygon, and closing segment', () => {
    const draftPoints = [
      [0, 0],
      [4, 0],
    ] as [number, number][]
    const cursorPoint = [4, 4] as [number, number]

    expect(
      getPolygonDraftPolylinePoints({
        cursorPoint,
        draftPoints,
        isPolygonDraftBuildActive: true,
      }),
    ).toBe('0,0 4,0 4,4')
    expect(
      getPolygonDraftPolygonPoints({
        cursorPoint,
        draftPoints,
        isPolygonDraftBuildActive: true,
      }),
    ).toBe('0,0 4,0 4,4')
    expect(
      getPolygonDraftClosingSegment({
        cursorPoint,
        draftPoints,
        isPolygonDraftBuildActive: true,
      }),
    ).toEqual({ x1: 4, y1: 4, x2: 0, y2: 0 })
  })
})
