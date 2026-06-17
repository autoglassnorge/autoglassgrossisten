import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { createSession, getSession, addMessage, getRecentMessages, createHandoff, hashIdentifier } from './customer-chat-session';
import type { Env } from '../types';
import migrationSql from '../../migrations/0024_customer_chat.sql?raw';

function splitSqlStatements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe('customer-chat-session', () => {
  beforeAll(async () => {
    const db = env.GLASS_CATALOG_D1;
    const statements = splitSqlStatements(migrationSql).map((stmt) => db.prepare(stmt));
    await db.batch(statements);
  });

  it('hashes an identifier consistently', async () => {
    const h1 = await hashIdentifier('AB12345');
    const h2 = await hashIdentifier('AB12345');
    expect(h1).toBe(h2);
    expect(h1).not.toBe('AB12345');
  });

  it('returns null for missing session', async () => {
    const session = await getSession(env as Env, 'missing-token');
    expect(session).toBeNull();
  });
});
