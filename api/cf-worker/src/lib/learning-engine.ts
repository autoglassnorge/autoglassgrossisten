/**
 * Learning Engine — LLM extracts lessons from completed conversations and
 * applies them automatically on subsequent dialogue turns (weighted).
 *
 * Decisions (Tom 2026-08-13): 2D = learn everything weighted; 3A = auto-apply.
 *
 * Lesson types:
 *   - accessory : glue/primer/clips/trim preferences per glass/customer
 *   - equipment : ADAS/heat/sensor/antenna patterns per make/model
 *   - dialogue  : what confuses customers → prompt guidance
 *   - pricing   : price-sensitivity / bundle signals
 *
 * Scope: global | make | make_model | position (frontrute/bakrute/...)
 */

import type { Env } from "../types";
import { callLLM } from "./ai-gateway";

export interface Lesson {
  id?: number;
  scope: "global" | "make" | "make_model" | "position";
  scope_key: string;
  lesson_type: "accessory" | "equipment" | "dialogue" | "pricing";
  content: string;
  weight: number;
  confidence: number;
  source: string;
}

export interface LearningContext {
  make?: string;
  model?: string;
  position?: string;
  regnr?: string;
}

const LESSON_SCHEMA = {
  type: "object",
  properties: {
    lessons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["global", "make", "make_model", "position"] },
          scope_key: { type: "string" },
          lesson_type: { type: "string", enum: ["accessory", "equipment", "dialogue", "pricing"] },
          content: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["scope", "scope_key", "lesson_type", "content", "confidence"],
      },
    },
  },
  required: ["lessons"],
};

/** Ask the LLM to extract durable lessons from a finished conversation. */
export async function extractLessons(
  env: Env,
  conversationText: string,
  context: LearningContext
): Promise<Lesson[]> {
  const ctx = [
    context.make ? `Merke: ${context.make}` : null,
    context.model ? `Modell: ${context.model}` : null,
    context.position ? `Posisjon: ${context.position}` : null,
  ].filter(Boolean).join(", ");

  const system =
    `Du analyserer en fullført samtale mellom en bilglass-ordremottaker og en B2B-kunde (verksted/forhandler).\n` +
    `Trekk ut VARIGE lærdommer som gjør fremtidige samtaler bedre. KONTEKST: ${ctx || "ukjent"}\n\n` +
    `REGLER:\n` +
    `- scope: "global" hvis det gjelder alle, "make" (scope_key=merke), "make_model" (scope_key="MERKE MODELL"), eller "position" (scope_key=frontrute/bakrute/...).\n` +
    `- lesson_type: accessory (lim/primer/klips/list-preferanser), equipment (ADAS/varme/sensor/antenne-mønstre), dialogue (hva som forvirret kunden), pricing (pris-sensitivitet/pakke-signaler).\n` +
    `- content: én konkret, handlingsrettet setning på norsk. Ikke gjenta samtalen, generaliser.\n` +
    `- confidence: 0-1, hvor sikker du er på at dette er en varig lærdom og ikke en enkelthendelse.\n` +
    `- Kun lærdommer med confidence >= 0.6. Maks 6 lærdommer.`;
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: conversationText.slice(0, 6000) },
  ];

  const result = await callLLM(env, {
    messages,
    max_tokens: 800,
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: { name: "lessons", schema: LESSON_SCHEMA, strict: true },
    },
  });

  const parsed = JSON.parse(result.response) as { lessons?: Array<{
    scope: Lesson["scope"];
    scope_key: string;
    lesson_type: Lesson["lesson_type"];
    content: string;
    confidence: number;
  }> };

  return (parsed.lessons || []).map((l) => ({
    scope: l.scope,
    scope_key: (l.scope_key || "").trim(),
    lesson_type: l.lesson_type,
    content: l.content.trim(),
    weight: 1,
    confidence: l.confidence,
    source: "conversation",
  }));
}

/** Upsert a lesson, bumping weight on an existing equivalent. */
export async function upsertLesson(db: D1Database, lesson: Lesson): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_lessons (scope, scope_key, lesson_type, content, weight, confidence, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(scope, scope_key, lesson_type, content) DO UPDATE SET
         weight = weight + 1,
         confidence = MAX(confidence, excluded.confidence),
         updated_at = datetime('now')`
    )
    .bind(
      lesson.scope,
      lesson.scope_key,
      lesson.lesson_type,
      lesson.content,
      lesson.confidence,
      lesson.source
    )
    .run();
}

/** Retrieve the most relevant lessons for a dialogue turn (auto-apply). */
export async function getRelevantLessons(
  db: D1Database,
  context: LearningContext,
  limit = 6
): Promise<Lesson[]> {
  const keys: string[] = ["global"];
  if (context.make) keys.push(`make:${context.make.toUpperCase()}`);
  if (context.make && context.model)
    keys.push(`make_model:${(context.make + " " + context.model).toUpperCase().trim()}`);
  if (context.position) keys.push(`position:${context.position}`);

  const placeholders = keys.map(() => "(scope = ? AND scope_key = ?)").join(" OR ");
  const params = keys.flatMap((k) => {
    const [scope, ...rest] = k.split(":");
    return [scope, rest.join(":")];
  });

  const { results } = await db
    .prepare(
      `SELECT id, scope, scope_key, lesson_type, content, weight, confidence, source
       FROM ai_lessons
       WHERE ${placeholders}
       ORDER BY (weight * confidence) DESC
       LIMIT ?`
    )
    .bind(...params, limit)
    .all();

  return (results || []).map((r) => r as unknown as Lesson);
}

/** Format lessons for prompt injection. */
export function formatLessonsForPrompt(lessons: Lesson[]): string {
  if (lessons.length === 0) return "";
  return lessons
    .map((l) => `- [${l.lesson_type}/${l.scope_key || l.scope}] ${l.content}`)
    .join("\n");
}

/** Full learning pass: extract from conversation + upsert (run async after a session ends). */
export async function runLearningPass(
  env: Env,
  conversationText: string,
  context: LearningContext
): Promise<number> {
  try {
    const lessons = await extractLessons(env, conversationText, context);
    for (const lesson of lessons) {
      await upsertLesson(env.GLASS_CATALOG_D1, lesson);
    }
    console.log(`[LearningEngine] Extracted + stored ${lessons.length} lessons`);
    return lessons.length;
  } catch (e) {
    console.error(
      `[LearningEngine] Learning pass failed:`,
      e instanceof Error ? e.message : String(e)
    );
    return 0;
  }
}
