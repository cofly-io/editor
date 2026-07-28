/**
 * generator_dsl 端到端冒烟 — 本地直调管线（不走 HTTP、不建 run 记录）。
 *
 * 用途：验证 LLM 生成循环 → sandbox 编译 → 空间门 → placement patches
 * 在真实 AI provider + 真实 worker 进程下整条打通。
 *
 * 运行（在仓库根目录）：
 *   AI_BASE_URL=... AI_API_KEY=... AI_MODEL=... bun apps/editor/scripts/dsl-e2e-smoke.ts
 *   # 或 Anthropic 直连：
 *   ANTHROPIC_API_KEY=... bun apps/editor/scripts/dsl-e2e-smoke.ts
 *
 * 环境变量：
 *   DSL_SMOKE_PROMPT   默认 "生成一个笔记本电脑"
 *   DSL_SMOKE_ATTEMPTS 默认 3（LLM 修复预算）
 *   DSL_SMOKE_PRINT_SOURCE=1  打印模型产出的 DSL source
 */

import { callConfiguredAi } from '../lib/ai-provider'
import { runDslSourceLoop, DSL_AUTHOR_PROMPT_VERSION } from '../lib/ai-harness-runs/generator-dsl-llm-loop'
import { executeGeneratorDslRun } from '../lib/ai-harness-runs/generator-dsl-run'
import { resolveGenerationMode, NO_SIGNALS } from '../lib/ai-harness-runs/generation-route'

const prompt = process.env.DSL_SMOKE_PROMPT ?? '生成一个笔记本电脑'
const maxAttempts = Number.parseInt(process.env.DSL_SMOKE_ATTEMPTS ?? '3', 10)

const route = resolveGenerationMode(
  { ...NO_SIGNALS, needsHierarchy: true, needsHinge: true, needsGrid: true, needsComputedLayout: true },
  { params: { generatorDsl: true }, env: {} },
)

async function callLlm(messages: Array<{ role: string; content: string }>): Promise<string> {
  const body = { messages, max_tokens: 4096 }
  const { res, text } = await callConfiguredAi(body, new AbortController().signal)
  if (!res.ok) throw new Error(`AI upstream ${res.status}: ${text.slice(0, 300)}`)
  const data = JSON.parse(text)
  const message = data.choices?.[0]?.message
  const content = message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c: { text?: string }) => c.text ?? '').join('\n')
  return ''
}

async function main() {
  console.log('=== generator_dsl e2e smoke ===')
  console.log(`prompt:    ${prompt}`)
  console.log(`promptVer: ${DSL_AUTHOR_PROMPT_VERSION}`)
  console.log('')

  const startedAt = Date.now()
  const loop = await runDslSourceLoop({
    userPrompt: prompt,
    callLlm,
    runAttempt: (source) =>
      executeGeneratorDslRun({
        source,
        apiVersion: '1.0.0',
        route,
      }),
    maxAttempts,
  })
  const wallMs = Date.now() - startedAt

  console.log(`outcome:   ${loop.kind}${loop.kind === 'failed' ? ` (stagnated=${loop.stagnated})` : ''}`)
  console.log(`attempts:  ${loop.attempts}`)
  console.log(`wall:      ${wallMs}ms`)
  console.log('')

  if (loop.kind === 'ok' && loop.finalRun.kind === 'ok') {
    const run = loop.finalRun
    console.log(`irHash:    ${run.irHash}`)
    console.log(`parts:     ${run.ir.parts.length}`)
    console.log(`spatial:   score=${run.spatial.score.toFixed(2)} issues=${run.spatial.issues.length} warnings=${run.spatial.warnings.length}`)
    console.log(`patches:   ${run.patches.length} (root first: ${run.patches[0]?.node.type})`)
    console.log(`budget:    sandboxAttempts=${run.budgetUsage.sandboxAttempts} sandboxMs=${run.budgetUsage.totalSandboxMs}`)
    if (run.spatial.warnings.length > 0) {
      console.log('')
      console.log('gate warnings:')
      for (const w of run.spatial.warnings) console.log(`  - ${w}`)
    }
    if (process.env.DSL_SMOKE_PRINT_SOURCE === '1') {
      console.log('')
      console.log('=== DSL source ===')
      console.log(loop.source)
    }
    console.log('')
    console.log('SMOKE OK')
    process.exit(0)
  }

  // failure path
  const failed = loop.finalRun
  console.log('SMOKE FAILED')
  if (failed?.kind === 'failed') {
    console.log(`reason:    ${failed.downgrade.reason}`)
    console.log(`message:   ${failed.downgrade.message}`)
    console.log(`codes:     ${failed.downgrade.diagnosticCodes.join(', ')}`)
  } else {
    console.log('model never produced DSL source')
  }
  if (process.env.DSL_SMOKE_PRINT_SOURCE === '1' && loop.source) {
    console.log('')
    console.log('=== last DSL source ===')
    console.log(loop.source)
  }
  process.exit(1)
}

main().catch((err) => {
  console.error('smoke crashed:', err instanceof Error ? err.message : err)
  process.exit(2)
})
