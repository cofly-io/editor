import { Ruler } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { convertReferenceLengthToMeters, formatMeasurement, formatNumber } from './measurements'
import type { PendingReferenceScale, ReferenceScaleDraft, ReferenceScaleUnit } from './types'

type ReferenceScaleOverlayProps = {
  draft: ReferenceScaleDraft | null
  pending: PendingReferenceScale | null
  referenceScaleUnit: ReferenceScaleUnit
  referenceScaleValue: string
  unit: 'metric' | 'imperial'
  onCancelPending: () => void
  onConfirmPending: () => void
  onReferenceScaleUnitChange: (unit: ReferenceScaleUnit) => void
  onReferenceScaleValueChange: (value: string) => void
}

export function FloorplanReferenceScaleOverlay({
  draft,
  pending,
  referenceScaleUnit,
  referenceScaleValue,
  unit,
  onCancelPending,
  onConfirmPending,
  onReferenceScaleUnitChange,
  onReferenceScaleValueChange,
}: ReferenceScaleOverlayProps) {
  const pendingDisplayLength = Number(referenceScaleValue)
  const pendingRealLengthMeters =
    pending && pendingDisplayLength > 0
      ? convertReferenceLengthToMeters(pendingDisplayLength, referenceScaleUnit)
      : null
  const pendingMetersPerUnit =
    pending && pendingRealLengthMeters
      ? pendingRealLengthMeters / pending.measuredLengthUnits
      : null
  const pendingImageScaleFactor =
    pending && pendingRealLengthMeters
      ? pendingRealLengthMeters / pending.measuredLengthUnits
      : null
  const inputError =
    referenceScaleValue.trim() === ''
      ? 'Enter the real length of the line.'
      : pendingDisplayLength > 0
        ? null
        : 'Length must be greater than 0.'

  return (
    <>
      {draft && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-md border bg-background/95 px-3 py-2 text-center text-sm shadow-sm">
          {draft.start
            ? 'Click the end of the known distance'
            : 'Click the start of a known distance'}
        </div>
      )}

      {pending && (
        <form
          className="absolute top-1/2 left-1/2 z-40 w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background/95 p-3.5 text-foreground shadow-2xl backdrop-blur-md"
          onSubmit={(event) => {
            event.preventDefault()
            onConfirmPending()
          }}
        >
          <div className="mb-3 flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-white/5">
              <Ruler className="h-4 w-4 text-foreground/80" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm">Set overlay scale</div>
              <div className="mt-0.5 text-muted-foreground text-xs leading-4">
                Enter the real-world length of the line you just drew. The image will resize to
                match it.
              </div>
            </div>
          </div>

          <div className="mb-3 rounded-xl border border-border/70 bg-white/5 px-3 py-2">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Drawn line
            </div>
            <div className="mt-1 font-medium text-sm">
              {formatMeasurement(pending.measuredLengthUnits, unit)}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block font-medium text-muted-foreground text-xs">
              Real length
            </span>
            <div className="grid grid-cols-[1fr_8.25rem] gap-2">
              <input
                aria-invalid={Boolean(inputError)}
                className={cn(
                  'h-9 rounded-lg border bg-background px-3 text-sm outline-none transition focus:border-foreground/40',
                  inputError ? 'border-destructive/60' : 'border-border',
                )}
                inputMode="decimal"
                onBlur={() => {
                  const value = Number(referenceScaleValue)
                  if (!(value > 0)) {
                    onReferenceScaleValueChange('0.0001')
                  }
                }}
                onChange={(event) => onReferenceScaleValueChange(event.target.value)}
                step="any"
                type="number"
                value={referenceScaleValue}
              />
              <select
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none transition focus:border-foreground/40"
                onChange={(event) =>
                  onReferenceScaleUnitChange(event.target.value as ReferenceScaleUnit)
                }
                value={referenceScaleUnit}
              >
                <option value="meters">Meters</option>
                <option value="centimeters">Centimeters</option>
                <option value="feet">Feet</option>
                <option value="inches">Inches</option>
              </select>
            </div>
            <span
              className={cn(
                'mt-1.5 block text-xs',
                inputError ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {inputError ?? 'Any decimal works. Use the known real length, not the drawn value.'}
            </span>
          </label>

          <div className="mt-3 rounded-lg bg-muted/45 px-3 py-2 text-muted-foreground text-xs">
            {pendingImageScaleFactor
              ? `Image will scale ${formatNumber(pendingImageScaleFactor, 3)}x from the first point.`
              : 'Enter a length greater than 0.'}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="h-8 rounded-lg border border-border px-3 font-medium text-muted-foreground text-xs transition hover:bg-white/8 hover:text-foreground"
              onClick={onCancelPending}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-8 rounded-lg bg-foreground px-3 font-medium text-background text-xs transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!pendingMetersPerUnit}
              type="submit"
            >
              Save Scale
            </button>
          </div>
        </form>
      )}
    </>
  )
}
