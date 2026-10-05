import type { GenAiProviderId } from '../domain'

export function makeOpenAiSuccessResponse<T>(payload: T): Response {
  const body = {
    id: 'resp_test_1',
    object: 'response',
    model: 'gpt-test',
    output: [
      {
        id: 'msg_test_1',
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify(payload),
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    },
  }
  return jsonResponse(body, 200)
}

export function makeAnthropicSuccessResponse<T>(payload: T): Response {
  const body = {
    id: 'msg_test_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-test',
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 },
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function makeGeminiSuccessResponse<T>(payload: T): Response {
  const body = {
    candidates: [
      {
        content: {
          role: 'model',
          parts: [{ text: JSON.stringify(payload) }],
        },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 50,
      totalTokenCount: 150,
    },
    modelVersion: 'gemini-test-001',
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function makeProviderErrorResponse(
  provider: GenAiProviderId,
  status: number,
  body: unknown = { error: { message: `${provider} error` } },
): Response {
  return jsonResponse(body, status)
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function makeOpenRouterSuccessResponse<T>(
  payload: T,
  model = 'test/served-model:free',
): Response {
  return jsonResponse(
    {
      id: 'gen_test_1',
      object: 'chat.completion',
      created: 1,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: JSON.stringify(payload) },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    },
    200,
  )
}
