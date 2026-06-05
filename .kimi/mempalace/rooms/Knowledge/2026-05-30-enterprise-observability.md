# ADR-ENT-001: Enterprise Observability & Telemetry Stack

**Date:** 2026-05-30  
**Status:** Accepted  
**Author:** Enterprise Architect (AI)  
**Stakeholders:** Autoglass AS Operations, Development Team

---

## Context

Following the successful token optimization deployment (62-96% savings), we need enterprise-grade observability to:

1. **Validate ROI** - Prove token savings in production
2. **Operational Excellence** - Monitor API health, latency, errors
3. **Business Intelligence** - Track search patterns, conversion funnels
4. **2026 Enterprise Standards** - Meet modern observability requirements

## Decision

Implement **in-memory telemetry** with Cloudflare Worker-native approach:

- Request metrics (latency percentiles, error rates)
- Token savings tracking (compression effectiveness)
- Cache hit rates (performance optimization validation)
- `/api/metrics` endpoint for real-time dashboards

### Alternative Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| External APM (Datadog/NewRelic) | Rich features, established | Cost, vendor lock-in, latency | ❌ Rejected |
| Cloudflare Analytics | Native integration | Limited custom metrics | ❌ Rejected |
| **In-memory + KV persistence** | Fast, zero latency, cost-effective | Ephemeral (lost on restart) | ✅ **Accepted** |
| D1 Metrics Table | Persistent, SQL queryable | Write amplification | ⚠️ Future enhancement |

## Consequences

### Positive
- Zero external dependencies
- Sub-millisecond metric collection
- Real-time visibility into token savings
- No additional cost

### Negative
- Metrics lost on Worker restart (acceptable for 2026 MVP)
- No historical trending (add D1 persistence later)
- Manual flush required

## Implementation

```typescript
// Request tracking
recordRequest({
  endpoint: "/api/glass",
  latencyMs: 145,
  compressed: true,
  cacheHit: true,
});

// Token savings validation
recordTokenSavings({
  endpoint: "/api/glass",
  originalTokens: 2048,
  savedTokens: 1269,
  compressionRatio: 0.62,
});
```

### Metrics Endpoint

```bash
curl https://api.autoglass.no/api/metrics
```

Response:
```json
{
  "requests": {
    "total": 1523,
    "p50Latency": 89,
    "p95Latency": 245,
    "p99Latency": 520,
    "errorRate": 0.02,
    "cacheHitRate": 0.73
  },
  "tokenSavings": {
    "totalRequests": 892,
    "totalTokensSaved": 1247500,
    "avgCompressionRatio": 0.62
  }
}
```

## Related Decisions

- ADR-OPT-001: Token Optimization (prerequisite)
- ADR-DEP-001: Cloudflare Worker Platform

## Future Work (2026 Q3-Q4)

1. **D1 Persistence** - Store metrics for trending
2. **Grafana Dashboard** - Visualize real-time metrics
3. **Alerting** - P95 latency >500ms, error rate >1%
4. **Business Metrics** - Search-to-quote conversion tracking

---
**Approved:** Enterprise Architecture Board, 2026-05-30
