import type { Env } from '../types';
import { errorResponse } from '../lib/cors';
import { detectInputType, validateInput } from '../lib/input-detector';
import { callLLM } from '../lib/ai-gateway';
import { buildPromptMessages, responseJsonSchema } from '../lib/customer-chat-prompt';
import { executeTool, executeHandoverToHuman } from '../lib/customer-chat-tools';
import {
  createSession,
  getSession,
  addMessage,
  getRecentMessages,
} from '../lib/customer-chat-session';
import { createChatStream, sseResponse, event } from '../lib/customer-chat-stream';
import type {
  ChatEvent,
  ChatRequest,
  ChatToolCall,
  LlmResponseShape,
  GlassSearchToolResult,
} from '../lib/customer-chat-types';

const MAX_ITERATIONS = 3;

export async function handleCustomerChat(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const message = body.message ?? '';
  const pageContext = body.page_context;

  // Basic input validation guardrail before we create or touch a session.
  if (message) {
    const detected = detectInputType(message);
    const validation = validateInput(detected);
    if (!validation.valid) {
      const stream = createChatStream([
        event('meta', { session_token: null, status: 'active' }),
        event('error', { message: validation.error }),
        event('done', {}),
      ]);
      return sseResponse(stream);
    }
  }

  let session: { token: string; id: number };
  const existingSession = body.session_token ? await getSession(env, body.session_token) : null;
  if (existingSession) {
    session = { token: existingSession.session_token, id: existingSession.id };
  } else {
    session = await createSession(env, { customerId: body.customer_id ?? null, pageContext });
  }

  if (message) {
    await addMessage(env, session.id, 'user', message);
  }

  const events: ChatEvent[] = [event('meta', { session_token: session.token, status: 'active' })];

  try {
    const toolResults: unknown[] = [];
    let finalResponse: LlmResponseShape | null = null;
    const history = await getRecentMessages(env, session.id, 20);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const messages = buildPromptMessages({ pageContext, history, toolResults });
      const llmResult = await callLLM(env, {
        messages,
        max_tokens: 512,
        temperature: iteration === 0 ? 0.2 : 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'customer_chat_response',
            schema: responseJsonSchema(),
            strict: false,
          },
        },
      });
      const parsed = JSON.parse(llmResult.response) as LlmResponseShape;

      if (parsed.tool_calls && parsed.tool_calls.length > 0) {
        events.push(event('typing', {}));
        for (const call of parsed.tool_calls) {
          events.push(event('tool_call', { tool: call.tool, params: call.params }));
          const result = await executeTool(env, call as ChatToolCall, {
            sessionId: session.id,
            context: ctx,
          });

          if (call.tool === 'handoverToHuman' && (result as { ok: boolean }).ok) {
            const handoff = result as { handoffId: number; summary: string; reason: string };
            events.push(
              event('handoff', {
                handoff_id: handoff.handoffId,
                summary: handoff.summary,
                reason: handoff.reason,
              })
            );
            events.push(event('done', {}));
            const stream = createChatStream(events);
            await addMessage(env, session.id, 'assistant', handoff.summary, {
              candidatesJson: [],
            });
            return sseResponse(stream);
          }

          // Surface successful product searches as a dedicated event.
          if (
            call.tool === 'searchGlass' &&
            result &&
            typeof result === 'object' &&
            (result as GlassSearchToolResult).ok &&
            ((result as GlassSearchToolResult).candidates?.length ?? 0) > 0
          ) {
            const searchResult = result as GlassSearchToolResult;
            events.push(
              event('products', {
                vehicle: searchResult.vehicle ?? null,
                candidates: searchResult.candidates,
              })
            );
          }

          toolResults.push({ tool: call.tool, result });
        }
        continue;
      }

      finalResponse = parsed;
      break;
    }

    if (!finalResponse) {
      const handoff = await executeHandoverToHuman(
        env,
        {
          reason: 'loop_limit',
          summary: 'Verktøyloopen nådde maksimalt antall iterasjoner.',
        },
        { sessionId: session.id }
      );
      events.push(
        event('handoff', {
          handoff_id: handoff.handoffId,
          summary: handoff.summary,
          reason: handoff.reason,
        })
      );
    } else {
      if (finalResponse.message) {
        const words = finalResponse.message.split(' ');
        for (const word of words) {
          events.push(event('text', { delta: `${word} ` }));
        }
      }
      if (finalResponse.quick_replies) {
        events.push(event('quick_replies', { chips: finalResponse.quick_replies }));
      }
      await addMessage(env, session.id, 'assistant', finalResponse.message ?? '', {
        candidatesJson: [],
      });
    }

    events.push(event('done', {}));
    const stream = createChatStream(events);
    return sseResponse(stream);
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Unknown error';
    const handoff = await executeHandoverToHuman(
      env,
      { reason: 'error', summary: `Assistenten fikk en feil: ${err}` },
      { sessionId: session.id }
    );
    events.push(
      event('error', {
        message: 'Beklager, jeg fikk ikke svar. Jeg overfører deg til et menneske.',
      })
    );
    events.push(
      event('handoff', {
        handoff_id: handoff.handoffId ?? null,
        summary: handoff.summary,
        reason: handoff.reason,
      })
    );
    events.push(event('done', {}));
    const stream = createChatStream(events);
    return sseResponse(stream);
  }
}
