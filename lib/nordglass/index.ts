/**
 * Nord Glass — Ingest Pipeline for Klarpakke / Autoglass AS
 *
 * Usage:
 *   import { pipeline, parseLine, dedupe, validate } from './lib/nordglass';
 *
 *   const { stagingSQL, stats } = pipeline(rawLines, parseLine);
 */

export * from './schema';
export * from './tokenize';
export * from './parse-line';
export * from './normalize';
export * from './dedupe';
export * from './validate';
export * from './importer';
export * from './extract';
