/**
 * generator_dsl 端到端冒烟 — 走 3002 的 HTTP run 接口（完整管线）。
 *
 * 验证点：
 *   1. POST /api/ai-harness/runs 创建 primitive run，params.generatorDsl=true 强制走 DSL
 *   2. 路由事件里 generation-route 的 mode 是 generator_dsl
 *   3. LLM 生成循环跑通，最终 run.status = succeeded，result.generatedAssembly 带 patches
 *   4. 失败时 result.dslDowngrade 有显式记录
 *
 * 运行（3002 已启动，且 dev server 的 env 里有 AI provider 配置）：
 *   bun apps/editor/scripts/dsl-e2e-http-smoke.ts
 *
 * 环境变量：
 *   DSL_SMOKE_BASE    默认 http://localhost:3002
 *   DSL_SMOKE_PROMPT  默认 "生成一个笔记本电脑"
 *   DSL_SMOKE_TIMEOUT_MS 默认 180000（LLM 多轮可能较慢）
 */

const base = (process.env.DSL_SMOKE_BASE ?? 'http://localhost:3002').replace(/\/+$/, '')
const prompt = process.env.DSL_SMOKE_PROMPT ?? '生成一个笔记本电脑'
const timeoutMs = Number.parseInt(process.env.DSL_SMOKE_TIMEOUT_MS ?? '180000', 10)

async function postRun(): Promise<string> {
  const res = await fetch(`${base}/api/ai-harness/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'primitive',
      prompt,
      conversationId: `dsl-smoke-${Date.now()}`,
      params: { generatorDsl: true }, // 显式走 DSL 路线（绕过灰度）
    }),
  })
  if (!res.ok) throw new Error(`POST /runs ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { runId?: string }
  if (!data.runId) throw new Error('no runId in response')
  return data.runId
}

type RunRecord = {
  id: string
  status: string
  error?: string
  result?: {
    generatedAssembly?: { irHash?: string; patches?: unknown[] }
    dslDowngrade?: { reason?: string; message?: string; attempts?: number; diagnosticCodes?: string[] }
    metrics?: { primitiveRoute?: Record<string, unknown> }
    shapeCount?: number
  }
}

async function pollRun(runId: string): Promise<RunRecord> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const res = await fetch(`${base}/api/ai-harness/runs/${runId}`)
    if (!res.ok) throw new Error(`GET /runs/${runId} ${res.status}`)
    const data = (await res.json()) as { run: RunRecord }
    const run = data.run
    if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
      return run
    }
    if (Date.now() > deadline) throw new Error(`timeout after ${timeoutMs}ms (status=${run.status})`)
    await new Promise((r) => setTimeout(r, 2000))
  }
}

async function main() {
  console.log('=== generator_dsl http e2e smoke ===')
  console.log(`base:   ${base}`)
  console.log(`prompt: ${prompt}`)
  console.log('')

  const runId = await postRun()
  console.log(`runId:  ${runId}`)
  const run = await pollRun(runId)

  console.log(`status: ${run.status}`)
  const metrics = run.result?.metrics?.primitiveRoute ?? {}
  console.log(`route:  ${metrics.route ?? '?'}  mode=${metrics.generationMode ?? '?'}`)
  console.log(`flag:   ${JSON.stringify(metrics.generatorDslFlag ?? {})}`)

  if (run.status === 'succeeded') {
    const asm = run.result?.generatedAssembly
    if (asm?.irHash) {
      console.log(`irHash: ${asm.irHash}`)
      console.log(`patches: ${Array.isArray(asm.patches) ? asm.patches.length : 0}`)
      console.log(`parts:   ${metrics.dslPartCount ?? '?'}  spatial=${metrics.dslSpatialScore ?? '?'}  llmRepairs=${metrics.repairCallCount ?? '?'}`)
      console.log('')
      console.log('SMOKE OK')
      process.exit(0)
    }
    // succeeded + dslDowngrade: DSL 管线跑了但受控降级（显式失败，未动场景）
    const dg = run.result?.dslDowngrade
    if (dg) {
      console.log('')
      console.log('SMOKE FAILED: generator_dsl route downgraded (explicit, no scene changes)')
      console.log(`  reason:   ${dg.reason}`)
      console.log(`  message:  ${dg.message}`)
      console.log(`  attempts: ${dg.attempts ?? '?'}`)
      console.log(`  codes:    ${(dg.diagnosticCodes ?? []).join(', ')}`)
      process.exit(1)
    }
    // succeeded but neither generatedAssembly nor dslDowngrade (路由没走 DSL)
    console.log('')
    console.log('SMOKE FAILED: run succeeded but did NOT go through generator_dsl')
    console.log(`  route reasons: ${JSON.stringify(metrics.generationRouteReasons ?? [])}`)
    process.exit(1)
  }

  console.log('')
  console.log('SMOKE FAILED')
  const dg = run.result?.dslDowngrade
  if (dg) {
    console.log(`  reason:  ${dg.reason}`)
    console.log(`  message: ${dg.message}`)
    console.log(`  codes:   ${(dg.diagnosticCodes ?? []).join(', ')}`)
  } else {
    console.log(`  error:   ${run.error ?? 'unknown'}`)
  }
  process.exit(1)
}

main().catch((err) => {
  console.error('smoke crashed:', err instanceof Error ? err.message : err)
  process.exit(2)
})
