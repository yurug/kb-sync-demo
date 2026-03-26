// Tests for src/linear/pagination.ts — retry, throttle, and pagination

import { describe, it, expect, vi } from 'vitest';
import { withRetry, paginate, isRetryable, sleep } from '../../src/linear/pagination.js';
import { AuthError, ApiError } from '../../src/errors.js';

describe('isRetryable', () => {
  it('returns true for 429 errors', () => {
    expect(isRetryable(new Error('HTTP 429 Too Many Requests'))).toBe(true);
  });

  it('returns true for 500 errors', () => {
    expect(isRetryable(new Error('HTTP 500 Internal Server Error'))).toBe(true);
  });

  it('returns true for network errors', () => {
    expect(isRetryable(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryable(new Error('fetch failed'))).toBe(true);
  });

  it('returns false for AuthError', () => {
    expect(isRetryable(new AuthError('bad key', 'bad key'))).toBe(false);
  });

  it('returns false for 400 errors', () => {
    expect(isRetryable(new Error('HTTP 400 Bad Request'))).toBe(false);
  });
});

describe('NF3: withRetry exponential backoff', () => {
  it('NF3: returns value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, 3);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('NF3: retries on retryable error and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockResolvedValueOnce('ok');
    // Override sleep for fast test
    const result = await withRetry(fn, 3);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('NF3: throws ApiError after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 429'));
    await expect(withRetry(fn, 2)).rejects.toThrow(ApiError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('NF3: never retries AuthError (T12)', async () => {
    const fn = vi.fn().mockRejectedValue(
      new AuthError('bad', 'bad key'),
    );
    await expect(withRetry(fn, 5)).rejects.toThrow(AuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('NF3: does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 400 Bad Request'));
    await expect(withRetry(fn, 5)).rejects.toThrow(ApiError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('P10: paginate with completion tracking', () => {
  it('P10: fetches all pages and returns complete=true', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ items: [1, 2], hasNextPage: true, endCursor: 'c1' })
      .mockResolvedValueOnce({ items: [3], hasNextPage: false, endCursor: null });

    const [items, complete] = await paginate(fetchPage);
    expect(items).toEqual([1, 2, 3]);
    expect(complete).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('P10: returns complete=false when a page fetch fails', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ items: [1], hasNextPage: true, endCursor: 'c1' })
      .mockRejectedValueOnce(new Error('network fail'));

    const [items, complete] = await paginate(fetchPage);
    expect(items).toEqual([1]);
    expect(complete).toBe(false);
  });

  it('handles single page result', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: ['a', 'b'],
      hasNextPage: false,
      endCursor: null,
    });

    const [items, complete] = await paginate(fetchPage);
    expect(items).toEqual(['a', 'b']);
    expect(complete).toBe(true);
  });

  it('handles empty result', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: [],
      hasNextPage: false,
      endCursor: null,
    });

    const [items, complete] = await paginate(fetchPage);
    expect(items).toEqual([]);
    expect(complete).toBe(true);
  });
});

describe('sleep', () => {
  it('resolves after the specified delay', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
