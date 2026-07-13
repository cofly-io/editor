import { useCallback } from 'react'
import { throwIfAborted } from './chat-utils'
import type { ComposeTool } from './geometry-tools'
import type { ApiMessage } from './types'

export function useAiChatApi() {
  const baseUrl = process.env.NEXT_PUBLIC_AI_BASE_URL ?? ''
  const apiKey = process.env.NEXT_PUBLIC_AI_API_KEY ?? ''
  const aiProxyUrl = process.env.NEXT_PUBLIC_AI_PROXY_URL ?? '/api/ai-chat/completions'
  const model = process.env.NEXT_PUBLIC_AI_MODEL ?? 'gpt-4o'
  const primitiveHasConfig = Boolean(aiProxyUrl || (baseUrl && apiKey))

  const callApi = useCallback(
    async (
      apiMessages: ApiMessage[],
      tools?: ComposeTool[],
      signal?: AbortSignal,
    ) => {
      throwIfAborted(signal)
      const hasTools = tools && tools.length > 0
      const body: Record<string, unknown> = {
        model,
        messages: apiMessages,
        ...(hasTools ? { tools, tool_choice: 'auto' as const } : {}),
        max_tokens: 4096,
      }
      const bodyJson = JSON.stringify(body)
      let res: Response
      try {
        const useProxy = Boolean(aiProxyUrl)
        res = await fetch(useProxy ? aiProxyUrl : `${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(useProxy ? {} : { Authorization: `Bearer ${apiKey}` }),
          },
          signal,
          body: bodyJson,
        })
      } catch (error) {
        throwIfAborted(signal)
        const sizeKb = Math.ceil(bodyJson.length / 1024)
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(
          `AI request failed before sending. ${detail}. Payload size: ${sizeKb}KB. Check AI Base URL, CORS, and schema.`,
        )
      }
      throwIfAborted(signal)

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error(`[AI-Chat] API error: ${res.status} ${res.statusText}`, errText)
        throw new Error(`${res.status} ${res.statusText}${errText ? `: ${errText}` : ''}`)
      }

      const data = await res.json()
      throwIfAborted(signal)
      const msg = data.choices?.[0]?.message
      if (!msg) throw new Error('Empty response from AI.')
      return msg as {
        role: string
        content?: string
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
      }
    },
    [baseUrl, model, apiKey, aiProxyUrl],
  )

  return { callApi, primitiveHasConfig }
}
