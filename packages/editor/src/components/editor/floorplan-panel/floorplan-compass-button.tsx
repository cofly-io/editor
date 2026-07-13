'use client'

import { Navigation } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/primitives/tooltip'

export function FloorplanCompassButton({
  northRotationDeg,
  onAlignNorth,
}: {
  northRotationDeg: number
  onAlignNorth: () => void
}) {
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
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          type="button"
        >
          <Navigation className="h-4 w-4 opacity-30" strokeWidth={1.8} />
          <svg
            aria-hidden="true"
            className="absolute h-6 w-6 overflow-visible transition-transform duration-200"
            style={{ transform: `rotate(${northRotationDeg}deg)` }}
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
