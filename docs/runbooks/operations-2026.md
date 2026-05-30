# Enterprise Operations Runbook 2026
## Autoglass AS B2B Platform

---

## Quick Reference

| Service | URL | Status |
|---------|-----|--------|
| API | https://autoglass-glass-sok.autoglassnorge.workers.dev | [Check Health](#health-checks) |
| Metrics | `/api/metrics` | Real-time |
| Documentation | `/api/health` | System status |

---

## 1. Daily Operations

### 1.1 Health Check
```bash
curl -s https://autoglass-glass-sok.autoglassnorge.workers.dev/api/health | jq .
```

Expected:
```json
{
  "status": "ok",
  "catalogSize": 27184,
  "brands": 87,
  "d1Configured": true,
  "svvConfigured": true
}
```

### 1.2 Token Savings Verification
```bash
curl -s https://autoglass-glass-sok.autoglassnorge.workers.dev/api/metrics | jq '.tokenSavings'
```

Alert if `avgCompressionRatio < 0.50` (less than 50% savings).

### 1.3 Performance Check
```bash
curl -s https://autoglass-glass-sok.autoglassnorge.workers.dev/api/metrics | jq '.requests'
```

Alert thresholds:
- `p95Latency > 500ms`
- `errorRate > 0.05` (5%)
- `cacheHitRate < 0.50` (50%)

---

## 2. Deployment Procedures

### 2.1 Pre-Deploy Checklist
- [ ] Tests pass: `npm test`
- [ ] Smoke test: `node scripts/smoke-test.mjs`
- [ ] Catalog validation: `npm run catalog:validate`
- [ ] Review metrics baseline

### 2.2 Deploy Worker
```bash
cd api/cf-worker
npm run deploy
```

### 2.3 Post-Deploy Verification
```bash
# 1. Health check
curl https://autoglass-glass-sok.autoglassnorge.workers.dev/api/health

# 2. Test search
curl "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/glass?regnr=SU18018"

# 3. Verify metrics
curl https://autoglass-glass-sok.autoglassnorge.workers.dev/api/metrics
```

---

## 3. Incident Response

### 3.1 API Down (500 errors)
1. Check Cloudflare status: https://www.cloudflarestatus.com/
2. Verify D1 connection: `/api/health` should show `d1Configured: true`
3. Check KV namespace status in Cloudflare dashboard
4. If needed: Rollback to previous version via Cloudflare dashboard

### 3.2 High Latency (>500ms p95)
1. Check cache hit rate: `/api/metrics`
2. Verify SVV API status (external dependency)
3. Check D1 query performance in Cloudflare analytics
4. Consider: Flush metrics, restart Worker

### 3.3 Token Savings Drop
1. Verify `fields` parameter still supported
2. Check response compression: responses should include `"_compressed":true`
3. Review recent deployments for regression
4. Validate optimize-catalog script output

---

## 4. Maintenance Windows

### 4.1 Catalog Update (Weekly)
```bash
# 1. Backup current
cp data/catalog-prod.json data/catalog-prod-backup-$(date +%Y%m%d).json

# 2. Run optimization
npm run catalog:build

# 3. Validate
npm run catalog:validate

# 4. Deploy (if validation passes)
```

### 4.2 Metrics Flush (Daily)
```bash
curl -X POST https://autoglass-glass-sok.autoglassnorge.workers.dev/api/admin/flush-metrics
```

---

## 5. Monitoring Dashboard

### 5.1 Key Metrics
```bash
# Watch real-time metrics
watch -n 5 'curl -s https://autoglass-glass-sok.autoglassnorge.workers.dev/api/metrics | jq ".requests"'
```

### 5.2 Business Metrics
- Search volume: Check `requests.total` trend
- Token efficiency: Monitor `tokenSavings.avgCompressionRatio`
- Cache performance: Track `requests.cacheHitRate`

---

## 6. Escalation

| Issue | Contact | Response Time |
|-------|---------|---------------|
| API Down | On-call engineer | 15 min |
| Performance | Dev team lead | 1 hour |
| Data Issues | Data team | 4 hours |
| Security | Security team | Immediate |

---

## 7. Useful Commands

```bash
# Test specific endpoint
curl -w "@curl-format.txt" -o /dev/null -s \
  "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/glass?regnr=SU18018"

# Check compression
curl -s "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/glass?eurocode=DW01AGNCMV&fields=eurocode,brand" | wc -c

# Full smoke test
node scripts/smoke-test.mjs

# KV inspection
wrangler kv:key list --binding GLASS_CATALOG | head -20
```

---

**Last Updated:** 2026-05-30  
**Version:** 1.0  
**Owner:** Enterprise Architecture Team
