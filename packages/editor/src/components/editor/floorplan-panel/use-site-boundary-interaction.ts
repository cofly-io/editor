'use client'

import type { AnyNodeId, SiteNode } from '@pascal-app/core'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { snapToHalf } from '../../tools/item/placement-math'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import {
  formatPolygonPoints,
  pointsEqual,
  polygonsEqual,
  toPoint2D,
  toWallPlanPoint,
} from './geometry'
import type { SiteBoundaryDraft, SitePolygonEntry, SiteVertexDragState } from './types'

export function useSiteBoundaryInteraction({
  getFloorplanUnitsPerPixel,
  getPlanPointFromClientPoint,
  isSiteEditActive,
  onCursorPointChange,
  site,
  sitePolygonEntry,
  updateNode,
  vertexHitRadiusPx,
}: {
  getFloorplanUnitsPerPixel: () => number
  getPlanPointFromClientPoint: (clientX: number, clientY: number) => WallPlanPoint | null
  isSiteEditActive: boolean
  onCursorPointChange: (point: WallPlanPoint | null) => void
  site: SiteNode | null
  sitePolygonEntry: SitePolygonEntry | null
  updateNode: (nodeId: AnyNodeId, updates: Partial<SiteNode>) => void
  vertexHitRadiusPx: number
}) {
  const siteBoundaryDraftRef = useRef<SiteBoundaryDraft | null>(null)
  const [siteBoundaryDraft, setSiteBoundaryDraft] = useState<SiteBoundaryDraft | null>(null)
  const [siteVertexDragState, setSiteVertexDragState] = useState<SiteVertexDragState | null>(null)
  const [hoveredSiteHandleId, setHoveredSiteHandleId] = useState<string | null>(null)

  useEffect(() => {
    siteBoundaryDraftRef.current = siteBoundaryDraft
  }, [siteBoundaryDraft])

  const displaySitePolygon = useMemo(() => {
    if (!sitePolygonEntry) {
      return null
    }

    if (!(siteBoundaryDraft && siteBoundaryDraft.siteId === sitePolygonEntry.site.id)) {
      return sitePolygonEntry
    }

    const polygon = siteBoundaryDraft.polygon.map(toPoint2D)

    return {
      ...sitePolygonEntry,
      polygon,
      points: formatPolygonPoints(polygon),
    }
  }, [siteBoundaryDraft, sitePolygonEntry])

  const shouldShowSiteBoundaryHandles = isSiteEditActive && displaySitePolygon !== null

  const clearSiteBoundaryInteraction = useCallback(() => {
    setSiteVertexDragState(null)
    setSiteBoundaryDraft(null)
    setHoveredSiteHandleId(null)
    onCursorPointChange(null)
  }, [onCursorPointChange])

  useEffect(() => {
    if (shouldShowSiteBoundaryHandles) {
      return
    }

    clearSiteBoundaryInteraction()
  }, [clearSiteBoundaryInteraction, shouldShowSiteBoundaryHandles])

  useEffect(() => {
    const dragState = siteVertexDragState
    if (!dragState) {
      return
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint: WallPlanPoint = [snapToHalf(planPoint[0]), snapToHalf(planPoint[1])]
      onCursorPointChange(snappedPoint)

      setSiteBoundaryDraft((currentDraft) => {
        if (!currentDraft || currentDraft.siteId !== dragState.siteId) {
          return currentDraft
        }

        const currentPoint = currentDraft.polygon[dragState.vertexIndex]
        if (currentPoint && pointsEqual(currentPoint, snappedPoint)) {
          return currentDraft
        }

        sfxEmitter.emit('sfx:grid-snap')

        const nextPolygon = [...currentDraft.polygon]
        nextPolygon[dragState.vertexIndex] = snappedPoint

        return {
          ...currentDraft,
          polygon: nextPolygon,
        }
      })
    }

    const commitSiteVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      const draft = siteBoundaryDraftRef.current
      if (
        draft &&
        site &&
        draft.siteId === site.id &&
        !polygonsEqual(draft.polygon, site.polygon?.points ?? [])
      ) {
        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopImmediatePropagation()
          clickEvent.preventDefault()
          window.removeEventListener('click', suppressClick, true)
        }
        window.addEventListener('click', suppressClick, true)
        requestAnimationFrame(() => {
          window.removeEventListener('click', suppressClick, true)
        })

        updateNode(draft.siteId as AnyNodeId, {
          polygon: {
            type: 'polygon',
            points: draft.polygon,
          },
        })
        sfxEmitter.emit('sfx:structure-build')
      }

      clearSiteBoundaryInteraction()
    }

    const cancelSiteVertexDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return
      }

      clearSiteBoundaryInteraction()
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', commitSiteVertexDrag)
    window.addEventListener('pointercancel', cancelSiteVertexDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', commitSiteVertexDrag)
      window.removeEventListener('pointercancel', cancelSiteVertexDrag)
    }
  }, [
    clearSiteBoundaryInteraction,
    getPlanPointFromClientPoint,
    onCursorPointChange,
    site,
    siteVertexDragState,
    updateNode,
  ])

  const siteVertexHandles = useMemo(() => {
    if (!(shouldShowSiteBoundaryHandles && displaySitePolygon)) {
      return []
    }

    return displaySitePolygon.polygon.map((point, vertexIndex) => ({
      nodeId: displaySitePolygon.site.id,
      vertexIndex,
      point: toWallPlanPoint(point),
      isActive:
        siteVertexDragState?.siteId === displaySitePolygon.site.id &&
        siteVertexDragState.vertexIndex === vertexIndex,
    }))
  }, [displaySitePolygon, shouldShowSiteBoundaryHandles, siteVertexDragState])

  const siteMidpointHandles = useMemo(() => {
    if (!(shouldShowSiteBoundaryHandles && displaySitePolygon && !siteVertexDragState)) {
      return []
    }

    return displaySitePolygon.polygon.map((point, edgeIndex, polygon) => {
      const nextPoint = polygon[(edgeIndex + 1) % polygon.length]
      return {
        nodeId: displaySitePolygon.site.id,
        edgeIndex,
        point: [
          (point.x + (nextPoint?.x ?? point.x)) / 2,
          (point.y + (nextPoint?.y ?? point.y)) / 2,
        ] as WallPlanPoint,
      }
    })
  }, [displaySitePolygon, shouldShowSiteBoundaryHandles, siteVertexDragState])

  const siteEdgeHandles = useMemo(() => {
    if (!(shouldShowSiteBoundaryHandles && displaySitePolygon && !siteVertexDragState)) {
      return []
    }

    return displaySitePolygon.polygon.map((point, edgeIndex, polygon) => {
      const nextPoint = polygon[(edgeIndex + 1) % polygon.length] ?? point
      return {
        nodeId: displaySitePolygon.site.id,
        edgeIndex,
        start: toWallPlanPoint(point),
        end: toWallPlanPoint(nextPoint),
      }
    })
  }, [displaySitePolygon, shouldShowSiteBoundaryHandles, siteVertexDragState])

  const handleSiteVertexPointerDown = useCallback(
    (siteId: SiteNode['id'], vertexIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredSiteHandleId(null)

      if (!(displaySitePolygon && displaySitePolygon.site.id === siteId)) {
        return
      }

      const vertexPoint = displaySitePolygon.polygon[vertexIndex]
      if (!vertexPoint) {
        return
      }

      setSiteBoundaryDraft({
        siteId,
        polygon: displaySitePolygon.polygon.map(toWallPlanPoint),
      })
      setSiteVertexDragState({
        pointerId: event.pointerId,
        siteId,
        vertexIndex,
      })
      onCursorPointChange(toWallPlanPoint(vertexPoint))
    },
    [displaySitePolygon, onCursorPointChange],
  )

  const handleSiteVertexDoubleClick = useCallback(
    (siteId: SiteNode['id'], vertexIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const currentSite = site && site.id === siteId ? site : null
      const currentPoints = currentSite?.polygon?.points ?? []
      if (!currentSite || currentPoints.length <= 3) {
        return
      }

      const nextPoints = currentPoints.filter((_, index) => index !== vertexIndex)
      updateNode(siteId as AnyNodeId, {
        polygon: {
          type: 'polygon',
          points: nextPoints,
        },
      })
      siteBoundaryDraftRef.current = null
      clearSiteBoundaryInteraction()
      sfxEmitter.emit('sfx:structure-delete')
    },
    [clearSiteBoundaryInteraction, site, updateNode],
  )

  const handleSiteMidpointPointerDown = useCallback(
    (siteId: SiteNode['id'], edgeIndex: number, event: ReactPointerEvent<SVGCircleElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredSiteHandleId(null)

      if (!(displaySitePolygon && displaySitePolygon.site.id === siteId)) {
        return
      }

      const basePolygon = displaySitePolygon.polygon.map(toWallPlanPoint)
      const startPoint = basePolygon[edgeIndex]
      const endPoint = basePolygon[(edgeIndex + 1) % basePolygon.length]
      if (!(startPoint && endPoint)) {
        return
      }

      const insertedPoint: WallPlanPoint = [
        (startPoint[0] + endPoint[0]) / 2,
        (startPoint[1] + endPoint[1]) / 2,
      ]
      const insertIndex = edgeIndex + 1
      const nextPolygon = [
        ...basePolygon.slice(0, insertIndex),
        insertedPoint,
        ...basePolygon.slice(insertIndex),
      ]

      setSiteBoundaryDraft({
        siteId,
        polygon: nextPolygon,
      })
      setSiteVertexDragState({
        pointerId: event.pointerId,
        siteId,
        vertexIndex: insertIndex,
      })
      onCursorPointChange(insertedPoint)
    },
    [displaySitePolygon, onCursorPointChange],
  )

  const handleSiteEdgePointerDown = useCallback(
    (siteId: SiteNode['id'], edgeIndex: number, event: ReactPointerEvent<SVGLineElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHoveredSiteHandleId(null)

      if (!(displaySitePolygon && displaySitePolygon.site.id === siteId)) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const basePolygon = displaySitePolygon.polygon.map(toWallPlanPoint)
      const startPoint = basePolygon[edgeIndex]
      const endPoint = basePolygon[(edgeIndex + 1) % basePolygon.length]
      if (!(startPoint && endPoint)) {
        return
      }

      const insertedPoint: WallPlanPoint = [snapToHalf(planPoint[0]), snapToHalf(planPoint[1])]
      const vertexHitRadius = vertexHitRadiusPx * getFloorplanUnitsPerPixel()
      const nearestVertex = basePolygon.reduce<{
        index: number
        distance: number
        point: WallPlanPoint
      } | null>((nearest, point, index) => {
        const distance = Math.hypot(insertedPoint[0] - point[0], insertedPoint[1] - point[1])
        if (nearest && nearest.distance <= distance) {
          return nearest
        }

        return { index, distance, point }
      }, null)

      if (nearestVertex && nearestVertex.distance <= vertexHitRadius) {
        setSiteBoundaryDraft({
          siteId,
          polygon: basePolygon,
        })
        setSiteVertexDragState({
          pointerId: event.pointerId,
          siteId,
          vertexIndex: nearestVertex.index,
        })
        onCursorPointChange(nearestVertex.point)
        return
      }

      const insertIndex = edgeIndex + 1
      const nextPolygon = [
        ...basePolygon.slice(0, insertIndex),
        insertedPoint,
        ...basePolygon.slice(insertIndex),
      ]

      setSiteBoundaryDraft({
        siteId,
        polygon: nextPolygon,
      })
      setSiteVertexDragState({
        pointerId: event.pointerId,
        siteId,
        vertexIndex: insertIndex,
      })
      onCursorPointChange(insertedPoint)
    },
    [
      displaySitePolygon,
      getFloorplanUnitsPerPixel,
      getPlanPointFromClientPoint,
      onCursorPointChange,
      vertexHitRadiusPx,
    ],
  )

  return {
    clearSiteBoundaryInteraction,
    handleSiteEdgePointerDown,
    handleSiteMidpointPointerDown,
    handleSiteVertexDoubleClick,
    handleSiteVertexPointerDown,
    hoveredSiteHandleId,
    setHoveredSiteHandleId,
    displaySitePolygon,
    shouldShowSiteBoundaryHandles,
    siteBoundaryDraft,
    siteEdgeHandles,
    siteMidpointHandles,
    siteVertexDragState,
    siteVertexHandles,
  }
}
