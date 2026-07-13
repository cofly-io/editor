function contentTypeCharset(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  const match = /(?:^|;)\s*charset=([^;]+)/i.exec(contentType)
  return match?.[1]?.trim().replace(/^"|"$/g, '').toLowerCase()
}

function decodeJsonBody(bytes: ArrayBuffer, charset?: string) {
  const normalized = charset?.replace(/[_-]/g, '')
  const decoders =
    normalized === 'gb18030' || normalized === 'gbk' || normalized === 'gb2312'
      ? [new TextDecoder('gb18030', { fatal: true }), new TextDecoder('utf-8', { fatal: true })]
      : [new TextDecoder('utf-8', { fatal: true }), new TextDecoder('gb18030', { fatal: true })]

  for (const decoder of decoders) {
    try {
      return decoder.decode(bytes)
    } catch {
      // Try the next likely JSON body encoding.
    }
  }

  return new TextDecoder().decode(bytes)
}

export async function parseJsonRequestBody(request: Request): Promise<unknown> {
  return JSON.parse(decodeJsonBody(await request.arrayBuffer(), contentTypeCharset(request)))
}
