'use client'

import { useLiveData } from '@pascal-app/core'
import { useEffect, useMemo, useState } from 'react'
import {
  buildUnsLiveDataValues,
  defaultRule,
  flattenUnsPoints,
  liveDataValueType,
  readStoredRules,
  readStoredRuntimeState,
  readStoredUnsCatalog,
  UNS_RUNTIME_EVENT,
} from '@/lib/uns-runtime'

function readRuntimeSnapshot(sceneId: string) {
  const catalog = readStoredUnsCatalog(sceneId)
  const points = flattenUnsPoints(catalog?.raw)
  const storedRules = readStoredRules(sceneId)
  const rules = Object.fromEntries(
    points.map((point) => [point.id, storedRules[point.id] ?? defaultRule(point)]),
  )
  const runtimeState = readStoredRuntimeState(sceneId)
  return { catalog, points, rules, simulating: runtimeState.simulating }
}

export function UnsSimulationRuntime({ sceneId }: { sceneId: string }) {
  const [runtime, setRuntime] = useState(() =>
    typeof window === 'undefined'
      ? { catalog: null, points: [], rules: {}, simulating: false }
      : readRuntimeSnapshot(sceneId),
  )
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const refresh = () => {
      setRuntime(readRuntimeSnapshot(sceneId))
      setTick(0)
    }
    refresh()
    window.addEventListener(UNS_RUNTIME_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(UNS_RUNTIME_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [sceneId])

  const paths = useMemo(
    () =>
      runtime.points.map((point) => ({
        path: point.id,
        label: point.path,
        category: 'UNS',
        valueType: liveDataValueType(point.dataType),
      })),
    [runtime.points],
  )

  useEffect(() => {
    useLiveData.getState().setPaths(paths)
  }, [paths])

  useEffect(() => {
    if (runtime.points.length === 0) return
    const values = buildUnsLiveDataValues(runtime.points, runtime.rules, tick)
    useLiveData.getState().setSnapshot({ values, timestamp: Date.now(), seq: tick })
  }, [runtime.points, runtime.rules, tick])

  useEffect(() => {
    if (!runtime.simulating) return
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(interval)
  }, [runtime.simulating])

  return null
}
