import {Context} from "hono";
import { streamSSE } from 'hono/streaming'

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
    options?: StreamOptions,
    apiVersion?: string,
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



export async function handleStreaming(c: Context, result: any, provider: string, model: string, apiVersion: string)  {
    // Set SSE headers
    c.header('Content-Type', 'text/event-stream')
    c.header('Cache-Control', 'no-cache')
    c.header('Connection', 'keep-alive')

    return streamSSE(c, async (stream) => {
        try {
            await writeTextStreamSSE(
                stream,
                result,
                { provider, model, version: apiVersion }
            )
        } catch (error) {
            console.error('Streaming error:', error)
            try {
                await stream.writeSSE({
                    data: JSON.stringify({
                        error: error instanceof Error ? error.message : 'Streaming error',
                        done: true
                    })
                })
            } catch (writeError) {
                console.error('Error writing error message to stream:', writeError)
            }
        } finally {
            try {
                await stream.close()
            } catch (closeError) {
                console.error('Error closing stream:', closeError)
            }
        }
    })
}