#!/usr/bin/env node
/**
 * Query Cache Tests
 * 
 * Tests for the QueryCache module using Node.js built-in test runner.
 * 
 * Run: node .kimi/mempalace/lib/query-cache.test.mjs
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { QueryCache } from './query-cache.mjs';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration with shorter TTL for faster tests
const TEST_CONFIG = {
  ttlMs: 100, // 100ms for quick expiration tests
  maxEntries: 3, // Small for easy LRU testing
  cacheFilePath: '.kimi/mempalace/data/query-cache-test.json'
};

describe('QueryCache', () => {
  let cache;
  let cacheFile;

  beforeEach(() => {
    // Clean up any existing test cache file
    const testFilePath = new URL('../../../.kimi/mempalace/data/query-cache-test.json', import.meta.url);
    cacheFile = testFilePath.pathname;
    
    try {
      if (existsSync(cacheFile)) {
        unlinkSync(cacheFile);
      }
    } catch (err) {
      // Ignore cleanup errors
    }

    // Create fresh cache instance
    cache = new QueryCache(TEST_CONFIG);
  });

  afterEach(() => {
    // Clean up cache and file
    if (cache) {
      cache.clear();
    }
    try {
      if (existsSync(cacheFile)) {
        unlinkSync(cacheFile);
      }
      // Also clean up temp file if it exists
      const tmpFile = cacheFile + '.tmp';
      if (existsSync(tmpFile)) {
        unlinkSync(tmpFile);
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('Store and retrieve operations', () => {
    it('should store and retrieve a value', () => {
      const key = 'test:123';
      const value = { data: 'hello world', count: 42 };

      cache.set(key, value);
      const result = cache.get(key);

      assert.deepStrictEqual(result, value);
    });

    it('should return null for non-existent key', () => {
      const result = cache.get('non-existent-key');
      assert.strictEqual(result, null);
    });

    it('should return null for cleared cache', () => {
      const key = 'test:123';
      cache.set(key, { data: 'value' });
      
      cache.clear();
      
      const result = cache.get(key);
      assert.strictEqual(result, null);
    });

    it('should update value when setting same key twice', () => {
      const key = 'test:update';
      
      cache.set(key, { version: 1 });
      cache.set(key, { version: 2 });

      const result = cache.get(key);
      assert.deepStrictEqual(result, { version: 2 });
    });

    it('should return correct stats', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();

      assert.strictEqual(stats.size, 2);
      assert.strictEqual(stats.maxEntries, TEST_CONFIG.maxEntries);
      assert.strictEqual(stats.ttlMs, TEST_CONFIG.ttlMs);
      assert.strictEqual(stats.expired, 0);
    });

    it('should check if key exists with has()', () => {
      cache.set('exists', 'value');
      
      assert.strictEqual(cache.has('exists'), true);
      assert.strictEqual(cache.has('does-not-exist'), false);
    });
  });

  describe('TTL expiration behavior', () => {
    it('should return null for expired entries', async () => {
      const key = 'test:expire';
      cache.set(key, { data: 'will expire' });

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.ttlMs + 50));

      const result = cache.get(key);
      assert.strictEqual(result, null);
    });

    it('should return false for has() on expired entries', async () => {
      const key = 'test:expire-has';
      cache.set(key, { data: 'will expire' });

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.ttlMs + 50));

      assert.strictEqual(cache.has(key), false);
    });

    it('should count expired entries in stats', async () => {
      // Clear any previous entries to get clean count
      cache.clear();
      
      cache.set('expiring', { data: 'expiring' });

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.ttlMs + 50));

      // Add another entry after expiration
      cache.set('fresh', { data: 'fresh' });

      const stats = cache.getStats();
      // The expiring entry should be counted as expired
      assert.strictEqual(stats.expired, 1);
      assert.strictEqual(stats.size, 2); // Both entries still in cache
    });

    it('should persist non-expired entries after load', async () => {
      const key = 'persist-me';
      cache.set(key, { data: 'persist' });
      
      // Create new cache instance (triggers load)
      const newCache = new QueryCache(TEST_CONFIG);
      
      const result = newCache.get(key);
      assert.deepStrictEqual(result, { data: 'persist' });
      
      // Cleanup
      newCache.clear();
    });
  });

  describe('makeKey() consistency', () => {
    it('should generate same key for same params in different order', () => {
      const params1 = { a: 1, b: 2, c: 3 };
      const params2 = { c: 3, a: 1, b: 2 };
      const params3 = { b: 2, c: 3, a: 1 };

      const key1 = cache.makeKey('tool', params1);
      const key2 = cache.makeKey('tool', params2);
      const key3 = cache.makeKey('tool', params3);

      assert.strictEqual(key1, key2);
      assert.strictEqual(key2, key3);
    });

    it('should generate different keys for different tool names', () => {
      const params = { a: 1, b: 2 };

      const key1 = cache.makeKey('toolA', params);
      const key2 = cache.makeKey('toolB', params);

      assert.notStrictEqual(key1, key2);
    });

    it('should generate different keys for different params', () => {
      const key1 = cache.makeKey('tool', { a: 1 });
      const key2 = cache.makeKey('tool', { a: 2 });

      assert.notStrictEqual(key1, key2);
    });

    it('should handle nested objects consistently', () => {
      const params1 = { outer: { inner: { a: 1, b: 2 } } };
      const params2 = { outer: { inner: { b: 2, a: 1 } } };

      const key1 = cache.makeKey('tool', params1);
      const key2 = cache.makeKey('tool', params2);

      assert.strictEqual(key1, key2);
    });

    it('should handle arrays consistently', () => {
      const params1 = { items: [3, 1, 2] };
      const params2 = { items: [3, 1, 2] };
      const params3 = { items: [1, 2, 3] };

      const key1 = cache.makeKey('tool', params1);
      const key2 = cache.makeKey('tool', params2);
      const key3 = cache.makeKey('tool', params3);

      assert.strictEqual(key1, key2); // Same order = same key
      assert.notStrictEqual(key1, key3); // Different order = different key
    });

    it('should handle null and undefined values', () => {
      const params = { a: null, b: undefined, c: 'value' };

      const key = cache.makeKey('tool', params);
      
      assert.ok(key.includes('null'));
      assert.ok(key.startsWith('tool:'));
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when exceeding max entries', () => {
      // maxEntries is 3 in test config
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // This should evict key1

      assert.strictEqual(cache.get('key1'), null); // Evicted
      assert.strictEqual(cache.get('key2'), 'value2');
      assert.strictEqual(cache.get('key3'), 'value3');
      assert.strictEqual(cache.get('key4'), 'value4');
    });

    it('should update LRU order on get', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to make it recently used
      cache.get('key1');

      // Add new entry, should evict key2 (now oldest)
      cache.set('key4', 'value4');

      assert.strictEqual(cache.get('key1'), 'value1'); // Still there
      assert.strictEqual(cache.get('key2'), null); // Evicted
      assert.strictEqual(cache.get('key3'), 'value3');
      assert.strictEqual(cache.get('key4'), 'value4');
    });

    it('should update LRU order on set of existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Re-set key1 to make it recently used
      cache.set('key1', 'updated-value1');

      // Add new entry, should evict key2
      cache.set('key4', 'value4');

      assert.strictEqual(cache.get('key1'), 'updated-value1');
      assert.strictEqual(cache.get('key2'), null); // Evicted
    });

    it('should maintain correct size after eviction', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');

      const stats = cache.getStats();
      assert.strictEqual(stats.size, 3); // maxEntries
    });

    it('should not evict when setting same key multiple times', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      // Update key1 multiple times
      cache.set('key1', 'updated1');
      cache.set('key1', 'updated2');
      cache.set('key1', 'updated3');

      const stats = cache.getStats();
      assert.strictEqual(stats.size, 2);
      assert.strictEqual(cache.get('key1'), 'updated3');
      assert.strictEqual(cache.get('key2'), 'value2');
    });
  });

  describe('Persistence', () => {
    it('should save and load cache correctly', () => {
      cache.set('persist1', { data: 1 });
      cache.set('persist2', { data: 2 });

      // Create new cache instance (should load from disk)
      const newCache = new QueryCache(TEST_CONFIG);

      assert.deepStrictEqual(newCache.get('persist1'), { data: 1 });
      assert.deepStrictEqual(newCache.get('persist2'), { data: 2 });

      newCache.clear();
    });

    it('should skip expired entries on load', async () => {
      cache.set('will-expire', { data: 'old' });
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.ttlMs + 50));
      
      cache.set('still-fresh', { data: 'new' });

      // Create new cache instance
      const newCache = new QueryCache(TEST_CONFIG);

      assert.strictEqual(newCache.get('will-expire'), null);
      assert.deepStrictEqual(newCache.get('still-fresh'), { data: 'new' });

      newCache.clear();
    });
  });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running QueryCache tests...');
}
