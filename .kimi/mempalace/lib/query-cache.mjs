#!/usr/bin/env node
/**
 * Query Cache Module for MemPalace
 * 
 * Caches query results to reduce token usage by avoiding repeated searches.
 * Features:
 * - 5-minute TTL for cache entries
 * - Max 100 entries with LRU eviction
 * - Disk persistence to .kimi/mempalace/data/query-cache.json
 * - Deterministic key generation with sorted params
 * 
 * @version 1.0.0
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default configuration
const DEFAULT_CONFIG = {
  ttlMs: 5 * 60 * 1000,  // 5 minutes
  maxEntries: 100,
  cacheFilePath: '.kimi/mempalace/data/query-cache.json'
};

/**
 * QueryCache - LRU cache with TTL and disk persistence
 */
export class QueryCache {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map(); // Maintains insertion order for LRU
    this.timestamps = new Map(); // Track when each entry was added
    
    // Resolve cache file path relative to project root
    const root = resolve(__dirname, '../../..');
    this.cacheFile = resolve(root, this.config.cacheFilePath);
    
    // Load existing cache from disk
    this.load();
  }

  /**
   * Create a deterministic cache key from tool name and params
   * Params are sorted to ensure consistent keys regardless of object key order
   * @param {string} toolName - Name of the tool/method being called
   * @param {object} params - Parameters object
   * @returns {string} - Cache key
   */
  makeKey(toolName, params) {
    const sortedParams = this._sortObject(params);
    const paramsString = JSON.stringify(sortedParams);
    return `${toolName}:${paramsString}`;
  }

  /**
   * Get a cached result if it exists and hasn't expired
   * @param {string} key - Cache key
   * @returns {any|null} - Cached result or null if not found/expired
   */
  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }

    const timestamp = this.timestamps.get(key);
    const now = Date.now();

    // Check if entry has expired
    if (now - timestamp > this.config.ttlMs) {
      this._delete(key);
      this.save();
      return null;
    }

    // Move to end to mark as recently used (LRU)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    
    return value;
  }

  /**
   * Store a result in the cache
   * @param {string} key - Cache key
   * @param {any} result - Result to cache
   */
  set(key, result) {
    // If key already exists, delete it first to maintain LRU order
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.config.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      this._delete(oldestKey);
    }

    // Store new entry
    this.cache.set(key, result);
    this.timestamps.set(key, Date.now());
    
    // Persist to disk
    this.save();
  }

  /**
   * Check if a key exists in cache and is not expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    if (!this.cache.has(key)) {
      return false;
    }

    const timestamp = this.timestamps.get(key);
    const now = Date.now();

    if (now - timestamp > this.config.ttlMs) {
      this._delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cached entries
   */
  clear() {
    this.cache.clear();
    this.timestamps.clear();
    this.save();
  }

  /**
   * Get cache statistics
   * @returns {object} - Stats object with size, maxEntries, ttlMs
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    
    for (const [key, timestamp] of this.timestamps) {
      if (now - timestamp > this.config.ttlMs) {
        expired++;
      }
    }

    return {
      size: this.cache.size,
      maxEntries: this.config.maxEntries,
      ttlMs: this.config.ttlMs,
      expired,
      cacheFile: this.cacheFile
    };
  }

  /**
   * Load cache from disk
   */
  load() {
    if (!existsSync(this.cacheFile)) {
      return;
    }

    try {
      const data = JSON.parse(readFileSync(this.cacheFile, 'utf8'));
      
      // Validate data structure
      if (!data.entries || !Array.isArray(data.entries)) {
        return;
      }

      const now = Date.now();
      let loaded = 0;
      let skipped = 0;

      for (const entry of data.entries) {
        // Skip expired entries on load
        if (!entry.timestamp || now - entry.timestamp > this.config.ttlMs) {
          skipped++;
          continue;
        }

        this.cache.set(entry.key, entry.value);
        this.timestamps.set(entry.key, entry.timestamp);
        loaded++;
      }

      // If we have more entries than max after loading, trim oldest
      while (this.cache.size > this.config.maxEntries) {
        const oldestKey = this.cache.keys().next().value;
        this._delete(oldestKey);
      }

      console.error(`[QueryCache] Loaded ${loaded} entries, skipped ${skipped} expired`);
    } catch (err) {
      console.error(`[QueryCache] Failed to load cache: ${err.message}`);
    }
  }

  /**
   * Save cache to disk atomically
   */
  save() {
    try {
      // Ensure directory exists
      const dir = dirname(this.cacheFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Build entries array
      const entries = [];
      for (const [key, value] of this.cache) {
        entries.push({
          key,
          value,
          timestamp: this.timestamps.get(key)
        });
      }

      // Atomic write: write to temp file then rename
      const tmpFile = this.cacheFile + '.tmp';
      writeFileSync(tmpFile, JSON.stringify({ entries }, null, 2));
      renameSync(tmpFile, this.cacheFile);
    } catch (err) {
      console.error(`[QueryCache] Failed to save cache: ${err.message}`);
    }
  }

  /**
   * Delete an entry from cache and timestamps
   * @private
   */
  _delete(key) {
    this.cache.delete(key);
    this.timestamps.delete(key);
  }

  /**
   * Recursively sort object keys for consistent key generation
   * @private
   */
  _sortObject(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this._sortObject(item));
    }

    const sorted = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = this._sortObject(obj[key]);
    }
    return sorted;
  }
}

// Export singleton instance with default config
export const queryCache = new QueryCache();

// Default export for flexibility
export default QueryCache;
