/**
 * Tiny request-safe memoization helpers.
 * Workers are single-threaded, so a module-level Map is safe.
 * TTL prevents stale D1 results across deploys/data updates.
 */

interface TimedEntry<V> {
  value: V;
  expiry: number;
}

export class LruCache<K, V> {
  private cache = new Map<K, V>();
  constructor(private max: number) {
    if (max <= 0) throw new RangeError("max must be > 0");
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value === undefined) return undefined;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.max) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export class TimedLruCache<K, V> {
  private cache = new Map<K, TimedEntry<V>>();
  constructor(private max: number, private ttlMs: number) {
    if (max <= 0) throw new RangeError("max must be > 0");
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    // touch for LRU order
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    const entry = { value, expiry: Date.now() + this.ttlMs };
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.max) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    this.cache.set(key, entry);
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
}

export function memoizeSync<F extends (...args: any[]) => any>(
  fn: F,
  maxSize = 1000
): F {
  const cache = new LruCache<string, ReturnType<F>>(maxSize);
  return ((...args: unknown[]) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key) as ReturnType<F>;
    const value = fn(...args) as ReturnType<F>;
    cache.set(key, value);
    return value;
  }) as F;
}

export function memoizeAsync<F extends (...args: unknown[]) => Promise<unknown>>(
  fn: F,
  maxSize = 500,
  ttlMs = 60_000
): F {
  const cache = new TimedLruCache<string, Awaited<ReturnType<F>>>(maxSize, ttlMs);
  const inFlight = new Map<string, Promise<unknown>>();

  return (async (...args: unknown[]) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key) as Awaited<ReturnType<F>>;
    if (inFlight.has(key)) return (await inFlight.get(key)!) as Awaited<ReturnType<F>>;

    const promise = fn(...args).then((value) => {
      cache.set(key, value as Awaited<ReturnType<F>>);
      inFlight.delete(key);
      return value;
    }).catch((err) => {
      inFlight.delete(key);
      throw err;
    });
    inFlight.set(key, promise);
    return (await promise) as Awaited<ReturnType<F>>;
  }) as F;
}
