import { describe, expect, test } from 'bun:test'
import {
  createGeometryAgentEditRequest,
  createGeometryAgentSessionClient,
  GeometryAgentClientError,
  type GeometryAgentClientFetch,
  geometryAgentDebugDetails,
  readGeometryAgentSessionClient,
  sendGeometryAgentMessageClient,
} from './geometry-agent-client'
import type { GeometryAgentRunResponse, GeometryAgentSnapshot } from './geometry-agent-client-types'

function okResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
  }
}

function errorResponse(status: number, data: unknown) {
  return {
    ok: false,
    status,
    statusText: 'Bad Request',
    json: async () => data,
  }
}

function snapshot(): GeometryAgentSnapshot {
  return {
    sessionId: 'geo_agent_test',
    manifest: {
      sessionId: 'geo_agent_test',
      sourcePath: 'source.equipment.dsl',
      status: 'succeeded',
      inputMode: 'text',
      sourceOrigin: 'workspace',
      currentArtifactId: 'artifact-1',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:01.000Z',
    },
    memory: {
      userGoal: '生成皮带输送机',
      namedParts: {},
      recentDecisions: [],
      userPreferences: { industrialStyle: 'editable realistic factory equipment' },
      referenceImageAssetId: null,
      referenceImageNotes: [],
      targetDimensions: { length: null, width: null, height: null, unit: 'm' },
      realismPreferences: {
        detailLevel: 'industrial_delivery',
        avoidToyLikeGeometry: true,
        preferRoundedSheetMetal: true,
        preferVisibleFasteners: true,
      },
    },
    source: "guardCover({ id: 'top_guard_cover', height: 0.75 });",
    diagnostics: {
      diagnostics: [],
      realismIssues: [],
      realismWarnings: [],
      spatialIssues: [],
      spatialWarnings: [],
    },
    lastRun: {
      kind: 'ok',
      sourceOrigin: 'workspace',
      irHash: 'ir-1',
      artifactId: 'artifact-1',
      partCount: 12,
      summary: '已按源码增量修改',
      at: '2026-07-28T00:00:01.000Z',
      changeFeedback: {
        changed: [
          {
            id: 'top_guard_cover',
            functionName: 'guardCover',
            changedParams: [{ name: 'height', before: '0.55', after: '0.75' }],
          },
        ],
        added: [],
        removed: [],
        unchangedImportantIds: ['belt', 'drive_motor'],
        text: '已按源码增量修改：\n- 修改：\n  - guardCover(top_guard_cover) height: 0.55 → 0.75',
      },
    },
    events: [],
  }
}

describe('geometry agent client', () => {
  test('creates, reads, and edits through stable geometry-agent endpoints', async () => {
    const calls: Array<{ url: string; init: Parameters<GeometryAgentClientFetch>[1] }> = []
    const runResponse: GeometryAgentRunResponse = {
      ...snapshot(),
      result: { kind: 'ok', attempts: 1, sourceAvailable: true },
    }
    const fetchImpl: GeometryAgentClientFetch = async (url, init) => {
      calls.push({ url, init })
      return okResponse(url.endsWith('/messages') ? runResponse : snapshot())
    }

    await createGeometryAgentSessionClient(
      { mode: 'text', prompt: '生成皮带输送机' },
      { fetchImpl },
    )
    await readGeometryAgentSessionClient('geo agent/slash', { fetchImpl })
    await sendGeometryAgentMessageClient(
      'geo_agent_test',
      createGeometryAgentEditRequest({ prompt: '罩子大一点', maxAttempts: 3 }),
      { fetchImpl },
    )

    expect(calls[0]).toMatchObject({
      url: '/api/geometry-agent/sessions',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    })
    expect(calls[0]?.init?.body).toBe('{"mode":"text","prompt":"生成皮带输送机"}')
    expect(calls[1]?.url).toBe('/api/geometry-agent/sessions/geo%20agent%2Fslash')
    expect(calls[1]?.init?.cache).toBe('no-store')
    expect(calls[2]?.url).toBe('/api/geometry-agent/sessions/geo_agent_test/messages')
    expect(calls[2]?.init?.body).toContain('"instruction":"罩子大一点"')
    expect(calls[2]?.init?.body).toContain('"maxAttempts":3')
  })

  test('formats persistent debug details with source and change feedback', () => {
    const details = geometryAgentDebugDetails(snapshot())

    expect(details).toContain('sessionId=geo_agent_test')
    expect(details).toContain('artifactId=artifact-1')
    expect(details).toContain('guardCover(top_guard_cover)')
    expect(details).toContain('Source:')
    expect(details).toContain("guardCover({ id: 'top_guard_cover'")
  })

  test('throws structured client errors', async () => {
    const fetchImpl: GeometryAgentClientFetch = async () =>
      errorResponse(400, { error: 'prompt_required', message: 'prompt is required' })

    await expect(
      createGeometryAgentSessionClient({ mode: 'text', prompt: '' }, { fetchImpl }),
    ).rejects.toBeInstanceOf(GeometryAgentClientError)
    await expect(
      createGeometryAgentSessionClient({ mode: 'text', prompt: '' }, { fetchImpl }),
    ).rejects.toMatchObject({ status: 400, message: 'prompt is required' })
  })
})
