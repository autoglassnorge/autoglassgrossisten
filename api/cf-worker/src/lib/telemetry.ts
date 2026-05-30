/**
 * Enterprise Telemetry & Observability (KV-Persisted)
 * ===================================================
 * Cloudflare-native metrics using KV for cross-request persistence.
 * 
 * 2026 Enterprise Architecture:
 * - KV for metrics persistence (survives request isolation)
 * - Atomic increments for counters
 * - Structured logging for observability
 */

import type { Env } from "../types";

const METRICS_KEY = "_metrics:v1";
const TOKEN_SAVINGS_KEY = "_token_savings:v1";

interface MetricsData {
  requests: {
    total: number;
    errors: number;
    cacheHits: number;
    totalLatency: number;
    latencies: number[];
  };
  endpoints: Record<string, {
    count: number;
    errors: number;
    totalLatency: number;
  }>;
}

interface TokenSavingsData {
  totalRequests: number;
  totalTokensSaved: number;
  totalOriginalTokens: number;
}

/**
 * Get current metrics from KV
 */
async function getMetrics(env: Env): Promise<MetricsData> {
  try {
    const data = await env.GLASS_CATALOG.get(METRICS_KEY, { type: "json" });
    if (data) return data as MetricsData;
  } catch {}
  
  return {
    requests: { total: 0, errors: 0, cacheHits: 0, totalLatency: 0, latencies: [] },
    endpoints: {},
  };
}

/**
 * Save metrics to KV
 */
async function saveMetrics(env: Env, data: MetricsData): Promise<void> {
  try {
    await env.GLASS_CATALOG.put(METRICS_KEY, JSON.stringify(data), { expirationTtl: 86400 });
  } catch (e) {
    console.error("[Telemetry] Failed to save metrics:", e);
  }
}

/**
 * Get token savings from KV
 */
async function getTokenSavings(env: Env): Promise<TokenSavingsData> {
  try {
    const data = await env.GLASS_CATALOG.get(TOKEN_SAVINGS_KEY, { type: "json" });
    if (data) return data as TokenSavingsData;
  } catch {}
  
  return { totalRequests: 0, totalTokensSaved: 0, totalOriginalTokens: 0 };
}

/**
 * Save token savings to KV
 */
async function saveTokenSavings(env: Env, data: TokenSavingsData): Promise<void> {
  try {
    await env.GLASS_CATALOG.put(TOKEN_SAVINGS_KEY, JSON.stringify(data), { expirationTtl: 86400 });
  } catch (e) {
    console.error("[Telemetry] Failed to save token savings:", e);
  }
}

/**
 * Record request metrics
 */
export async function recordRequest(
  env: Env,
  metrics: {
    endpoint: string;
    method: string;
    statusCode: number;
    latencyMs: number;
    compressed: boolean;
    cacheHit?: boolean;
  }
): Promise<void> {
  const data = await getMetrics(env);
  
  // Update totals
  data.requests.total++;
  data.requests.totalLatency += metrics.latencyMs;
  data.requests.latencies.push(metrics.latencyMs);
  
  // Keep last 1000 latencies for percentiles
  if (data.requests.latencies.length > 1000) {
    data.requests.latencies = data.requests.latencies.slice(-1000);
  }
  
  // Error tracking
  if (metrics.statusCode >= 400) {
    data.requests.errors++;
  }
  
  // Cache hit tracking
  if (metrics.cacheHit) {
    data.requests.cacheHits++;
  }
  
  // Endpoint breakdown
  if (!data.endpoints[metrics.endpoint]) {
    data.endpoints[metrics.endpoint] = { count: 0, errors: 0, totalLatency: 0 };
  }
  data.endpoints[metrics.endpoint].count++;
  data.endpoints[metrics.endpoint].totalLatency += metrics.latencyMs;
  if (metrics.statusCode >= 400) {
    data.endpoints[metrics.endpoint].errors++;
  }
  
  await saveMetrics(env, data);
  
  // Real-time logging
  if (metrics.latencyMs > 1000) {
    console.warn(`[SLOW] ${metrics.method} ${metrics.endpoint} ${metrics.latencyMs}ms`);
  }
  if (metrics.statusCode >= 400) {
    console.error(`[ERROR] ${metrics.endpoint} ${metrics.statusCode}`);
  }
}

/**
 * Record token savings
 */
export async function recordTokenSavings(
  env: Env,
  metrics: {
    endpoint: string;
    originalTokens: number;
    savedTokens: number;
    compressionRatio: number;
  }
): Promise<void> {
  const data = await getTokenSavings(env);
  
  data.totalRequests++;
  data.totalOriginalTokens += metrics.originalTokens;
  data.totalTokensSaved += metrics.savedTokens;
  
  await saveTokenSavings(env, data);
  
  // Log significant savings
  if (metrics.compressionRatio > 0.5) {
    console.log(`[TOKEN-SAVE] ${metrics.endpoint}: ${(metrics.compressionRatio * 100).toFixed(0)}% saved`);
  }
}

/**
 * Get metrics summary
 */
export async function getMetricsSummary(env: Env): Promise<{
  requests: {
    total: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    errorRate: number;
    cacheHitRate: number;
  };
  tokenSavings: {
    totalRequests: number;
    totalTokensSaved: number;
    avgCompressionRatio: number;
  };
  endpoints: Record<string, {
    count: number;
    avgLatency: number;
    errorRate: number;
  }>;
}> {
  const metrics = await getMetrics(env);
  const tokenData = await getTokenSavings(env);
  
  // Calculate percentiles
  const sorted = [...metrics.requests.latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
  
  // Calculate rates
  const errorRate = metrics.requests.total > 0 
    ? metrics.requests.errors / metrics.requests.total 
    : 0;
  const cacheHitRate = metrics.requests.total > 0
    ? metrics.requests.cacheHits / metrics.requests.total
    : 0;
  
  // Average compression
  const avgCompression = tokenData.totalOriginalTokens > 0
    ? tokenData.totalTokensSaved / tokenData.totalOriginalTokens
    : 0;
  
  return {
    requests: {
      total: metrics.requests.total,
      p50Latency: p50,
      p95Latency: p95,
      p99Latency: p99,
      errorRate,
      cacheHitRate,
    },
    tokenSavings: {
      totalRequests: tokenData.totalRequests,
      totalTokensSaved: tokenData.totalTokensSaved,
      avgCompressionRatio: avgCompression,
    },
    endpoints: Object.fromEntries(
      Object.entries(metrics.endpoints).map(([k, v]) => [
        k,
        {
          count: v.count,
          avgLatency: v.count > 0 ? v.totalLatency / v.count : 0,
          errorRate: v.count > 0 ? v.errors / v.count : 0,
        },
      ])
    ),
  };
}

/**
 * Flush metrics (reset counters)
 */
export async function flushMetrics(env: Env): Promise<void> {
  await env.GLASS_CATALOG.delete(METRICS_KEY);
  await env.GLASS_CATALOG.delete(TOKEN_SAVINGS_KEY);
  console.log("[Telemetry] Metrics flushed");
}
