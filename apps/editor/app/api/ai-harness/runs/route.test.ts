import { describe, expect, test } from 'bun:test'
import fs from 'node:fs/promises'
import {
  createRun,
  listActiveRuns,
  markRunCancellationRequested,
  runDir,
} from '../../../../lib/ai-harness-runs/run-store'
import { parseJsonRequestBody } from '../../../../lib/request-json'

describe('POST /api/ai-harness/runs body parsing', () => {
  test('decodes normal UTF-8 JSON bodies without corrupting Chinese prompts', async () => {
    const body = await parseJsonRequestBody(
      new Request('http://localhost/api/ai-harness/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ mode: 'primitive', prompt: '生成一辆自行车' }),
      }),
    )

    expect(body).toEqual({
      mode: 'primitive',
      prompt: '生成一辆自行车',
    })
  })

  test('decodes Windows cmd GB18030 JSON bodies before prompt routing', async () => {
    const gb18030Body = new Uint8Array([
      123, 34, 109, 111, 100, 101, 34, 58, 34, 112, 114, 105, 109, 105, 116, 105, 118, 101, 34, 44,
      34, 112, 114, 111, 109, 112, 116, 34, 58, 34, 201, 250, 179, 201, 210, 187, 184, 246, 189,
      193, 176, 232, 198, 247, 163, 172, 210, 187, 184, 246, 184, 203, 215, 211, 163, 172, 207, 194,
      195, 230, 202, 199, 200, 253, 198, 172, 189, 176, 210, 182, 34, 125,
    ])
    const body = await parseJsonRequestBody(
      new Request('http://localhost/api/ai-harness/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=gb18030' },
        body: gb18030Body,
      }),
    )

    expect(body).toEqual({
      mode: 'primitive',
      prompt: '生成一个搅拌器，一个杆子，下面是三片桨叶',
    })
  })

  test('keeps a pre-cancelled client run from starting later', async () => {
    const runId = `run_cancel_test_${Date.now().toString(36)}`
    const conversationId = `conv_cancel_test_${Date.now().toString(36)}`

    markRunCancellationRequested(runId)
    const run = await createRun({
      id: runId,
      conversationId,
      mode: 'factory',
      prompt: '生成一个炼油厂',
    })

    try {
      expect(run.status).toBe('cancelled')
      expect(run.error).toBe('Generation cancelled before run started')
      expect(await listActiveRuns(conversationId)).toEqual([])
    } finally {
      await fs.rm(await runDir(runId), { recursive: true, force: true })
    }
  })
})
