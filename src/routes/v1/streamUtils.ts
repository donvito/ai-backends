import { apiVersion } from './versionConfig'

type Stream = {
  writeSSE: (arg: { data: string }) => Promise<void>
  close: () => Promise<void>
}

type Usage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

type TextResult = {
  textStream?: AsyncIterable<string>
  usage?: Promise<Usage> | Usage
}

type StreamOptions = {
  initialEvent?: Record<string, unknown>
  extraDone?: Record<string, unknown>
}

export async function writeTextStreamSSE(
  stream: Stream,
  result: TextResult,
  meta: { provider: string; model: string; version?: string },
  options?: StreamOptions
) {
  const textStream = result.textStream
  if (!textStream) {
    throw new Error('Streaming not supported for this provider/model')
  }

  // optional first event
  if (options?.initialEvent) {
    await stream.writeSSE({
      data: JSON.stringify(options.initialEvent),
    })
  }

  // stream chunks
  for await (const chunk of textStream) {
    await stream.writeSSE({
      data: JSON.stringify({
        chunk,
        provider: meta.provider,
        model: meta.model,
        version: meta.version ?? apiVersion,
      }),
    })
  }

  // final usage event
  const usage = await result.usage
  if (usage) {
    await stream.writeSSE({
      data: JSON.stringify({
        done: true,
        usage: {
          input_tokens: usage.promptTokens,
          output_tokens: usage.completionTokens,
          total_tokens: usage.totalTokens,
        },
        provider: meta.provider,
        model: meta.model,
        version: meta.version ?? apiVersion,
        ...(options?.extraDone || {}),
      }),
    })
  }
}
