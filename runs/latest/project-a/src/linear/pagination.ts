// Module: pagination -- Cursor-based pagination with retry and throttle
//
// This module provides a generic pagination helper for the Linear GraphQL API.
// It handles cursor-based (Relay-style) iteration with a 100ms inter-request
// throttle and exponential backoff on failures. The throttle prevents burst
// patterns that trigger rate limiting.
// It implements: NF3 (rate limit compliance), external/linear-sdk.md pagination.
// Key design decisions: serialize requests (no parallel fetches), 100ms throttle,
// exponential backoff (2s, 4s, 8s, 16s, 32s), max 5 retries.

import { ApiError, AuthError } from '../errors.js';

/** Maximum number of retries before giving up. */
const MAX_RETRIES = 5;

/** Base delay for exponential backoff (milliseconds). */
const BASE_DELAY_MS = 2000;

/** Throttle delay between paginated requests (milliseconds). */
const THROTTLE_MS = 100;

/**
 * Sleep for the given number of milliseconds.
 *
 * @param ms - Duration to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determine if an error is retryable (429 or 5xx).
 * Auth errors (401) are never retried.
 *
 * @param error - The caught error
 * @returns true if the request should be retried
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof AuthError) return false;

  // Check for HTTP status codes in error messages or properties
  const msg = error instanceof Error ? error.message : String(error);
  // 429 (rate limit) is always retryable
  if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) return true;
  // 5xx server errors are retryable
  if (/\b5\d{2}\b/.test(msg)) return true;
  // Network errors (ECONNRESET, ETIMEDOUT, etc.) are retryable
  if (/ECONNRE|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(msg)) return true;

  return false;
}

/**
 * Execute an async function with exponential backoff retry.
 *
 * @param fn - Async function to execute
 * @param maxRetries - Maximum retry attempts (default: 5)
 * @returns The function's return value
 * @throws {ApiError} When all retries are exhausted
 * @invariant NF3 — backoff prevents rate limit violations
 * @example
 * const data = await withRetry(() => fetchPage(cursor));
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      // Never retry auth errors — a 401 means the key is wrong
      if (error instanceof AuthError) throw error;

      const isLast = attempt === maxRetries;
      if (!isRetryable(error) || isLast) {
        // Non-retryable error or last attempt — wrap in ApiError
        const msg = error instanceof Error ? error.message : String(error);
        throw new ApiError(
          `API call failed after ${attempt} attempt(s): ${msg}`,
          `Linear API failed after ${attempt} retries. Last error: ${msg}`,
          { cause: error instanceof Error ? error : undefined },
        );
      }

      // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  // Unreachable, but TypeScript needs it
  throw new ApiError('Retry loop exhausted', 'Linear API failed unexpectedly.');
}

/**
 * Generic cursor-based paginator. Fetches all pages from a paginated
 * Linear API query, with throttling between requests.
 *
 * @param fetchPage - Function that fetches a single page given an optional cursor
 * @returns Tuple of [all accumulated items, fetchWasComplete flag]
 * @invariant P10 — tracks completion for safe deletion detection
 * @example
 * const [items, complete] = await paginate(async (cursor) => {
 *   const result = await query(cursor);
 *   return { items: result.nodes, hasNextPage: result.pageInfo.hasNextPage, endCursor: result.pageInfo.endCursor };
 * });
 */
export async function paginate<T>(
  fetchPage: (cursor?: string) => Promise<{
    items: T[];
    hasNextPage: boolean;
    endCursor: string | null;
  }>,
): Promise<[T[], boolean]> {
  const allItems: T[] = [];
  let cursor: string | undefined;
  let fetchWasComplete = true;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let page: { items: T[]; hasNextPage: boolean; endCursor: string | null };
    try {
      page = await withRetry(() => fetchPage(cursor));
    } catch {
      // If any page fetch fails after retries, mark as incomplete
      // This gates deletion detection — incomplete fetches must NOT trigger deletions (P10)
      fetchWasComplete = false;
      break;
    }

    allItems.push(...page.items);

    if (!page.hasNextPage) break;

    cursor = page.endCursor ?? undefined;
    // Throttle between requests to avoid burst patterns (NF3)
    await sleep(THROTTLE_MS);
  }

  return [allItems, fetchWasComplete];
}
