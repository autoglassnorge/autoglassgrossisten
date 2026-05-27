#!/bin/bash
# Staggered launch: each worker starts 8s after the previous one
# This avoids login conflicts on auto-glass.no

cd /Users/taj/bilglass

rm -f data/autoglass-scrape/products-missing-*.ndjson

echo "[Launcher] Starting Worker 1 immediately..."
node scripts/scrape-autoglass-worker.mjs data/autoglass-scrape/missing-batch-1.json data/autoglass-scrape/products-missing-1.ndjson 1 > data/autoglass-scrape/worker-1.log 2>&1 &
PID1=$!

sleep 8
echo "[Launcher] Starting Worker 2 (8s delay)..."
node scripts/scrape-autoglass-worker.mjs data/autoglass-scrape/missing-batch-2.json data/autoglass-scrape/products-missing-2.ndjson 2 > data/autoglass-scrape/worker-2.log 2>&1 &
PID2=$!

sleep 8
echo "[Launcher] Starting Worker 3 (16s delay)..."
node scripts/scrape-autoglass-worker.mjs data/autoglass-scrape/missing-batch-3.json data/autoglass-scrape/products-missing-3.ndjson 3 > data/autoglass-scrape/worker-3.log 2>&1 &
PID3=$!

sleep 8
echo "[Launcher] Starting Worker 4 (24s delay)..."
node scripts/scrape-autoglass-worker.mjs data/autoglass-scrape/missing-batch-4.json data/autoglass-scrape/products-missing-4.ndjson 4 > data/autoglass-scrape/worker-4.log 2>&1 &
PID4=$!

echo "[Launcher] All 4 workers started: $PID1 $PID2 $PID3 $PID4"
echo "[Launcher] Waiting for completion..."

wait $PID1 && echo "[Launcher] Worker 1 done (exit 0)" || echo "[Launcher] Worker 1 exit $?"
wait $PID2 && echo "[Launcher] Worker 2 done (exit 0)" || echo "[Launcher] Worker 2 exit $?"
wait $PID3 && echo "[Launcher] Worker 3 done (exit 0)" || echo "[Launcher] Worker 3 exit $?"
wait $PID4 && echo "[Launcher] Worker 4 done (exit 0)" || echo "[Launcher] Worker 4 exit $?"

echo "[Launcher] All workers complete"
