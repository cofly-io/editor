/* eslint-disable no-console */
// 连发 N 次冰箱生成请求，跟踪 DSL 编译结果（验证 rotate prompt 修复）
const BASE = 'http://localhost:3002'
const N = 3
const PROMPT = '生成一个红色的双开门电冰箱'

async function submit(prompt: string): Promise<string> {
  const res = await fetch(`${BASE}/api/ai-harness/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'primitive', prompt }),
  })
  if (!res.ok) throw new Error(`submit failed ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return json.runId ?? json.id ?? json.run?.id
}

async function poll(runId: string, timeoutMs = 180_000): Promise<any> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BASE}/api/ai-harness/runs/${runId}`)
    if (res.ok) {
      const run = await res.json()
      const status = run.status ?? run.state
      if (status === 'completed' || status === 'succeeded' || status === 'failed' || status === 'error') {
        return run
      }
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`poll timeout for ${runId}`)
}

async function main() {
  const runIds: string[] = []
  for (let i = 0; i < N; i++) {
    const id = await submit(PROMPT)
    console.log(`[${i + 1}/${N}] submitted: ${id}`)
    runIds.push(id)
  }
  console.log('\npolling results...')
  for (const id of runIds) {
    try {
      const run = await poll(id)
      const m = run.metrics ?? run
      console.log(`\n=== ${id} ===`)
      console.log('status:', run.status ?? run.state)
      console.log('generationMode:', m.generationMode ?? m.route ?? '?')
      console.log('repairCallCount:', m.repairCallCount ?? m.llmRepairs ?? '?')
      console.log('dslDowngrade:', JSON.stringify(m.dslDowngrade ?? null))
      console.log('partCount:', m.partCount ?? m.parts ?? '?')
    } catch (e: any) {
      console.log(`\n=== ${id} === poll error: ${e.message}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
