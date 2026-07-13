'use client'

import { Navigation } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/primitives/tooltip'
import { nearestEquivalentDegrees } from './navigation'

const COMPASS_ANIMATION_TIME_CONSTANT_MS = 90

export function FloorplanCompassButton({
  northRotationDeg,
  onAlignNorth,
  navigationSource,
}: {
  northRotationDeg: number
  onAlignNorth: () => void
  navigationSource?: '2d' | '3d'
}) {
  const [displayedRotationDeg, setDisplayedRotationDeg] = useState(northRotationDeg)
  const displayedRotationRef = useRef(northRotationDeg)
  const animationFrameRef = useRef<number | null>(null)

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  useEffect(() => {
    if (navigationSource === '3d') cancelAnimation()
    if (animationFrameRef.current !== null) return
    displayedRotationRef.current = northRotationDeg
    setDisplayedRotationDeg(northRotationDeg)
  }, [cancelAnimation, navigationSource, northRotationDeg])

  useEffect(() => cancelAnimation, [cancelAnimation])

  const animateToNorth = () => {
    cancelAnimation()
    const targetDeg = nearestEquivalentDegrees(0, displayedRotationRef.current)
    let last = performance.now()
    const tick = (now: number) => {
      const decay = Math.exp(-(now - last) / COMPASS_ANIMATION_TIME_CONSTANT_MS)
      last = now
      let nextDeg = targetDeg - (targetDeg - displayedRotationRef.current) * decay
      if (Math.abs(targetDeg - nextDeg) < 0.05) nextDeg = targetDeg
      displayedRotationRef.current = nextDeg
      setDisplayedRotationDeg(nextDeg)
      animationFrameRef.current = nextDeg === targetDeg ? null : requestAnimationFrame(tick)
    }
    animationFrameRef.current = requestAnimationFrame(tick)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label="Align view to north"
          className="group absolute bottom-3 left-3 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white/85 text-neutral-800 shadow-sm backdrop-blur-md transition hover:bg-white hover:shadow-md dark:border-white/10 dark:bg-neutral-900/85 dark:text-neutral-100 dark:hover:bg-neutral-900"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onAlignNorth()
            animateToNorth()
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          type="button"
        >
          <Navigation className="h-4 w-4 opacity-30" strokeWidth={1.8} />
          <svg
            aria-hidden="true"
            className="absolute h-6 w-6 overflow-visible"
            style={{ transform: `rotate(${displayedRotationDeg}deg)` }}
            viewBox="-12 -12 24 24"
          >
            <path className="fill-red-500 drop-shadow-sm" d="M 0 -10 L 3 1 L 0 3 L -3 1 Z" />
            <path className="fill-neutral-500/70" d="M 0 10 L 2 1 L 0 3 L -2 1 Z" />
          </svg>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Align view to north</TooltipContent>
    </Tooltip>
  )
}
