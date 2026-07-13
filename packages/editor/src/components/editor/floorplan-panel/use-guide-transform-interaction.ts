'use client'

import type { GuideNode } from '@pascal-app/core'
import type { RefObject } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  areGuideTransformDraftsEqual,
  buildGuideResizeDraft,
  buildGuideRotationDraft,
  buildGuideTranslateDraft,
  doesGuideMatchDraft,
  transformGuideScaleReference,
} from './geometry'
import type { GuideInteractionState, GuideTransformDraft, SvgPoint } from './types'

type GuideTransformUpdates = {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
  scaleReference: GuideNode['scaleReference']
}

export function useGuideTransformInteraction({
  guideInteractionRef,
  guideById,
  guideTransformDraftRef,
}: {
  guideInteractionRef: RefObject<GuideInteractionState | null>
  guideById: Map<GuideNode['id'], GuideNode>
  guideTransformDraftRef: RefObject<GuideTransformDraft | null>
}) {
  const [guideTransformDraft, setGuideTransformDraft] = useState<GuideTransformDraft | null>(null)

  useEffect(() => {
    guideTransformDraftRef.current = guideTransformDraft
  }, [guideTransformDraft, guideTransformDraftRef])

  const clearGuideInteraction = useCallback(() => {
    guideInteractionRef.current = null
    guideTransformDraftRef.current = null
    setGuideTransformDraft(null)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [guideInteractionRef, guideTransformDraftRef])

  useEffect(() => {
    const interaction = guideInteractionRef.current
    if (interaction && !guideById.has(interaction.guideId)) {
      clearGuideInteraction()
    }
  }, [clearGuideInteraction, guideById, guideInteractionRef])

  useEffect(() => {
    return () => {
      clearGuideInteraction()
    }
  }, [clearGuideInteraction])

  const getDraftForPointer = useCallback(
    (interaction: GuideInteractionState, svgPoint: SvgPoint, shiftPressed: boolean) =>
      interaction.mode === 'rotate'
        ? buildGuideRotationDraft(interaction, svgPoint, shiftPressed)
        : interaction.mode === 'translate'
          ? buildGuideTranslateDraft(interaction, svgPoint)
          : buildGuideResizeDraft(interaction, svgPoint),
    [],
  )

  const updateGuideInteractionDraft = useCallback(
    ({
      event,
      getSvgPointFromClientPoint,
      shiftPressed,
    }: {
      event: PointerEvent
      getSvgPointFromClientPoint: (clientX: number, clientY: number) => SvgPoint | null
      shiftPressed: boolean
    }) => {
      const interaction = guideInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return false
      }

      event.preventDefault()

      const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
      if (!svgPoint) {
        return true
      }

      const nextDraft = getDraftForPointer(interaction, svgPoint, shiftPressed)

      if (areGuideTransformDraftsEqual(guideTransformDraftRef.current, nextDraft)) {
        return true
      }

      guideTransformDraftRef.current = nextDraft
      setGuideTransformDraft(nextDraft)
      return true
    },
    [getDraftForPointer, guideInteractionRef, guideTransformDraftRef],
  )

  const commitGuideInteraction = useCallback(
    ({
      event,
      getSvgPointFromClientPoint,
      shiftPressed,
      updateGuideNode,
    }: {
      event: PointerEvent
      getSvgPointFromClientPoint: (clientX: number, clientY: number) => SvgPoint | null
      shiftPressed: boolean
      updateGuideNode: (guideId: GuideNode['id'], updates: GuideTransformUpdates) => void
    }) => {
      const interaction = guideInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return false
      }

      event.preventDefault()

      const guide = guideById.get(interaction.guideId)
      if (!guide) {
        clearGuideInteraction()
        return true
      }

      const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
      const nextDraft = svgPoint
        ? getDraftForPointer(interaction, svgPoint, shiftPressed)
        : guideTransformDraftRef.current

      if (nextDraft && !doesGuideMatchDraft(guide, nextDraft)) {
        updateGuideNode(guide.id, {
          position: [nextDraft.position[0], guide.position[1], nextDraft.position[1]],
          rotation: [guide.rotation[0], nextDraft.rotation, guide.rotation[2]],
          scale: nextDraft.scale,
          scaleReference: transformGuideScaleReference(guide, nextDraft),
        })
      }

      clearGuideInteraction()
      return true
    },
    [
      clearGuideInteraction,
      getDraftForPointer,
      guideById,
      guideInteractionRef,
      guideTransformDraftRef,
    ],
  )

  const cancelGuideInteraction = useCallback(
    (event: PointerEvent) => {
      const interaction = guideInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return false
      }

      clearGuideInteraction()
      return true
    },
    [clearGuideInteraction, guideInteractionRef],
  )

  return {
    cancelGuideInteraction,
    clearGuideInteraction,
    commitGuideInteraction,
    guideTransformDraft,
    setGuideTransformDraft,
    updateGuideInteractionDraft,
  }
}
