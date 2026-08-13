/**
 * AI Gateway — Unified AI interface with fallback providers
 * Primary:   DeepSeek V4 Pro (@api.deepseek.com, deepseek-chat)
 * Fallback1: Workers AI (@cf/moonshotai/moonshot-auto)
 * Fallback2: Groq (llama-3.3-70b-versatile)
 */

import type { Env } from "../types";

interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface JsonSchema {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
}

export interface LlmCallOptions {
  messages: LlmMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: {
    type: "json_schema";
    json_schema: {
      name: string;
      schema: JsonSchema;
      strict?: boolean;
    };
  };
}

export type LlmProvider = "deepseek" | "workers-ai" | "groq";

export interface LlmCallResult {
  response: string;
  provider: LlmProvider;
  model: string;
}

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat"; // V4 Pro (default per 2026-08-13)
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const WORKERS_AI_MODEL = "@cf/moonshotai/moonshot-auto";

/** Detect if error is quota/rate-limit related */
function isQuotaError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("quota") ||
      msg.includes("rate limit") ||
      msg.includes("too many requests") ||
      msg.includes("429") ||
      msg.includes("insufficient") ||
      msg.includes("exceeded") ||
      msg.includes("limit") ||
      msg.includes("for mange") ||
      msg.includes("neurons") ||
      msg.includes("daily") ||
      msg.includes("allocation")
    );
  }
  return false;
}

/**
 * Inject a JSON schema into the system prompt for providers that only
 * support `json_object` (DeepSeek, Groq). Workers AI supports strict
 * json_schema natively.
 */
function injectSchemaIntoSystem(
  messages: LlmMessage[],
  schema: JsonSchema | undefined
): LlmMessage[] {
  if (!schema || messages[0]?.role !== "system") return messages;
  return [
    {
      role: "system",
      content:
        messages[0].content +
        `

VIKTIG: Du MÅ returnere et gyldig JSON-objekt som strengt følger dette skjemaet:
${JSON.stringify(schema, null, 2)}

Returner KUN JSON, ingen annen tekst før eller etter.`,
    },
    ...messages.slice(1),
  ];
}

/** Call DeepSeek V4 (OpenAI-compatible, json_object support) */
async function callDeepSeek(
  apiKey: string,
  options: LlmCallOptions
): Promise<LlmCallResult> {
  const schema = options.response_format?.json_schema?.schema;
  const messages = injectSchemaIntoSystem(options.messages, schema);

  const body: Record<string, unknown> = {
    model: DEEPSEEK_MODEL,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: options.max_tokens || 512,
    temperature: options.temperature ?? 0.3,
  };
  if (schema) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(
      `DeepSeek API error: ${res.status} ${res.statusText} — ${errText.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`DeepSeek API error: ${data.error.message || "Unknown"}`);
  }

  const response = data.choices?.[0]?.message?.content || "";
  if (!response) {
    throw new Error("Empty response from DeepSeek");
  }

  return { response, provider: "deepseek", model: DEEPSEEK_MODEL };
}

/** Call Workers AI with JSON schema support */
async function callWorkersAI(
  env: Env,
  options: LlmCallOptions
): Promise<LlmCallResult> {
  const result = await env.AI.run(WORKERS_AI_MODEL, {
    messages: options.messages,
    max_tokens: options.max_tokens || 512,
    temperature: options.temperature ?? 0.3,
    response_format: options.response_format,
  });

  const response = (result as { response?: string }).response || "";
  if (!response) {
    throw new Error("Empty response from Workers AI");
  }

  return { response, provider: "workers-ai", model: WORKERS_AI_MODEL };
}

/** Call Groq API (OpenAI-compatible, json_object support) */
async function callGroq(
  apiKey: string,
  options: LlmCallOptions
): Promise<LlmCallResult> {
  const schema = options.response_format?.json_schema?.schema;
  const messages = injectSchemaIntoSystem(options.messages, schema);

  const body: Record<string, unknown> = {
    model: GROQ_MODEL,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: options.max_tokens || 512,
    temperature: options.temperature ?? 0.3,
  };
  if (schema) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(
      `Groq API error: ${res.status} ${res.statusText} — ${errText.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`Groq API error: ${data.error.message || "Unknown"}`);
  }

  const response = data.choices?.[0]?.message?.content || "";
  if (!response) {
    throw new Error("Empty response from Groq");
  }

  return { response, provider: "groq", model: GROQ_MODEL };
}

/**
 * Unified LLM call with automatic fallback:
 *   1. DeepSeek V4 Pro (primary — best Norwegian, cheap)
 *   2. Workers AI (quota-included)
 *   3. Groq (free tier fallback)
 */
export async function callLLM(
  env: Env,
  options: LlmCallOptions
): Promise<LlmCallResult> {
  // 1. DeepSeek
  if (env.DEEPSEEK_API_KEY) {
    try {
      const result = await callDeepSeek(env.DEEPSEEK_API_KEY, options);
      console.log(`[AI-Gateway] DeepSeek succeeded (${result.model})`);
      return result;
    } catch (error) {
      console.warn(
        `[AI-Gateway] DeepSeek failed${isQuotaError(error) ? " (quota)" : ""}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // 2. Workers AI
  try {
    const result = await callWorkersAI(env, options);
    console.log(`[AI-Gateway] Workers AI succeeded (${result.model})`);
    return result;
  } catch (error) {
    const isQuota = isQuotaError(error);
    console.warn(
      `[AI-Gateway] Workers AI failed${isQuota ? " (quota)" : ""}:`,
      error instanceof Error ? error.message : String(error)
    );

    // 3. Groq
    if (env.GROQ_API_KEY) {
      console.log(`[AI-Gateway] Falling back to Groq (${GROQ_MODEL})...`);
      try {
        const result = await callGroq(env.GROQ_API_KEY, options);
        console.log(`[AI-Gateway] Groq fallback succeeded`);
        return result;
      } catch (groqError) {
        console.error(
          `[AI-Gateway] Groq fallback failed:`,
          groqError instanceof Error ? groqError.message : String(groqError)
        );
        throw groqError;
      }
    }
  }

  throw new Error("All AI providers failed");
}

/**
 * Check if AI services are available.
 */
export async function checkAIStatus(env: Env): Promise<{
  deepseek: "ok" | "no_key" | "error";
  workersAI: "ok" | "quota_exhausted" | "error";
  groq: "ok" | "no_key" | "error";
  recommended: LlmProvider | "none";
}> {
  let deepseek: "ok" | "no_key" | "error" = env.DEEPSEEK_API_KEY ? "ok" : "no_key";
  let workersAI: "ok" | "quota_exhausted" | "error" = "ok";
  let groq: "ok" | "no_key" | "error" = env.GROQ_API_KEY ? "ok" : "no_key";

  if (env.DEEPSEEK_API_KEY) {
    try {
      await callDeepSeek(env.DEEPSEEK_API_KEY, {
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 10,
      });
    } catch (e) {
      deepseek = isQuotaError(e) ? "error" : "error";
    }
  }

  try {
    await env.AI.run(WORKERS_AI_MODEL, {
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 10,
    });
  } catch (e) {
    workersAI = isQuotaError(e) ? "quota_exhausted" : "error";
  }

  if (env.GROQ_API_KEY && groq === "ok") {
    try {
      await callGroq(env.GROQ_API_KEY, {
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 10,
      });
    } catch {
      groq = "error";
    }
  }

  const recommended: LlmProvider | "none" =
    deepseek === "ok"
      ? "deepseek"
      : workersAI === "ok"
        ? "workers-ai"
        : groq === "ok"
          ? "groq"
          : "none";

  return { deepseek, workersAI, groq, recommended };
}
