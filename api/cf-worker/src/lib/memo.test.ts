import { describe, it, expect, vi } from "vitest";
import { LruCache, TimedLruCache, memoizeSync, memoizeAsync } from "./memo";

describe("LruCache", () => {
  it("stores and retrieves values", () => {
    const cache = new LruCache<string, number>(3);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  it("evicts least-recently-used entries", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // touch a
    cache.set("c", 3); // should evict b
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
  });

  it("rejects non-positive max size", () => {
    expect(() => new LruCache<string, number>(0)).toThrow(RangeError);
    expect(() => new LruCache<string, number>(-1)).toThrow(RangeError);
  });
});

describe("TimedLruCache", () => {
  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    const cache = new TimedLruCache<string, number>(10, 1000);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(cache.get("a")).toBeUndefined();
    vi.useRealTimers();
  });

  it("touches entries on get", () => {
    vi.useFakeTimers();
    const cache = new TimedLruCache<string, number>(2, 60_000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    vi.useRealTimers();
  });
});

describe("memoizeSync", () => {
  it("caches function results by arguments", () => {
    const fn = vi.fn((x: number) => x * 2);
    const memo = memoizeSync(fn, 10);
    expect(memo(2)).toBe(4);
    expect(memo(2)).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("memoizeAsync", () => {
  it("deduplicates concurrent calls with the same args", async () => {
    const fn = vi.fn(async (x: number) => x + 1);
    const memo = memoizeAsync(fn, 10, 60_000);
    const [a, b] = await Promise.all([memo(1), memo(1)]);
    expect(a).toBe(2);
    expect(b).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("caches resolved values", async () => {
    const fn = vi.fn(async (x: number) => x + 1);
    const memo = memoizeAsync(fn, 10, 60_000);
    expect(await memo(5)).toBe(6);
    expect(await memo(5)).toBe(6);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
