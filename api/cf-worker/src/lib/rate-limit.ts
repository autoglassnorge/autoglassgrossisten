/**
 * D1-based rate limiting.
 */

export async function checkRateLimit(db: D1Database, ip: string): Promise<boolean> {
  const key = `rate:${ip}`;
  try {
    const row = await db.prepare("SELECT count FROM rate_limits WHERE key = ? AND expires_at > datetime('now')").bind(key).first();
    const count = row ? (row as any).count : 0;
    if (count > 600) return false; // 600 req/min
    await db.prepare(
      `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, ?, datetime('now', '+1 minute'))
       ON CONFLICT(key) DO UPDATE SET count = count + 1, expires_at = excluded.expires_at`
    ).bind(key, count + 1).run();
    return true;
  } catch (e) {
    console.error(`Rate limit check failed for ${ip}: ${e instanceof Error ? e.message : String(e)}`);
    return true; // Allow through if table missing
  }
}
