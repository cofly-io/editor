export type PerfDistribution = {
  average: number
  p50: number
  p95: number
  max: number
}

const EMPTY_DISTRIBUTION: PerfDistribution = {
  average: 0,
  p50: 0,
  p95: 0,
  max: 0,
}

export function summarizePerfSamples(samples: readonly number[]): PerfDistribution {
  const values = samples.filter((sample) => Number.isFinite(sample) && sample >= 0)
  if (values.length === 0) return EMPTY_DISTRIBUTION

  const sorted = [...values].sort((left, right) => left - right)
  const average = values.reduce((total, sample) => total + sample, 0) / values.length

  return {
    average,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1) ?? 0,
  }
}

function percentile(sorted: readonly number[], ratio: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  return sorted[index] ?? 0
}
