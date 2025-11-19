// src/lib/client-cache.ts

interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Sets a value in the cache with the current timestamp.
 * @param key The cache key.
 * @param data The data to store.
 */
export const setCache = (key: string, data: any): void => {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
};

/**
 * Gets a value from the cache if it exists and is not stale.
 * @param key The cache key.
 * @returns The cached data or null if not found or stale.
 */
export const getCache = <T>(key: string): T | null => {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  const isStale = Date.now() - entry.timestamp > STALE_TIME_MS;
  if (isStale) {
    cache.delete(key);
    return null;
  }

  return entry.data as T;
};

/**
 * Clears the entire cache.
 */
export const clearCache = (): void => {
  cache.clear();
};
