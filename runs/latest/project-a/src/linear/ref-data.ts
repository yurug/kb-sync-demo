// Module: ref-data -- Bulk-fetch reference data from Linear
//
// This module fetches teams, users, workflow states, labels, and projects
// from the Linear API and builds Map<id, name> lookup tables. These maps
// are used by the resolver to join relation IDs to human-readable names.
// It implements: ADR-002 (bulk-fetch-then-join), NF3 (rate limit).
// Key design decisions: paginate each entity type, throttle between pages.

import { LinearClient } from '@linear/sdk';
import type { ReferenceData } from '../types.js';
import { AuthError, ApiError } from '../errors.js';
import { sleep } from './pagination.js';

/** Page size for paginated queries. */
const PAGE_SIZE = 50;

/** Throttle delay between reference data pagination requests. */
const THROTTLE_MS = 100;

/**
 * Fetch all reference data (teams, users, states, labels, projects)
 * from the Linear API. Each entity type is paginated independently.
 *
 * @param client - Linear SDK client instance
 * @returns ReferenceData with all lookup maps populated
 * @throws {ApiError} When any reference data fetch fails
 */
export async function fetchAllReferenceData(client: LinearClient): Promise<ReferenceData> {
  try {
    // Fetch all entity types in parallel — they are independent API calls (PERF-2)
    const [teams, users, states, labels, projects] = await Promise.all([
      // Teams: key is used for directory names, name for display
      paginateEntity<{ id: string; key: string; name: string }>(
        async (cursor) => {
          const r = await client.teams({ first: PAGE_SIZE, after: cursor });
          return {
            items: r.nodes.map((t) => ({ id: t.id, key: t.key, name: t.name })),
            hasNextPage: r.pageInfo.hasNextPage,
            endCursor: r.pageInfo.endCursor ?? null,
          };
        },
      ),

      // Users: displayName for assignee resolution
      paginateEntity<{ id: string; name: string }>(async (cursor) => {
        const r = await client.users({ first: PAGE_SIZE, after: cursor });
        return {
          items: r.nodes.map((u) => ({ id: u.id, name: u.displayName })),
          hasNextPage: r.pageInfo.hasNextPage,
          endCursor: r.pageInfo.endCursor ?? null,
        };
      }),

      // Workflow states: resolve state IDs to human-readable names
      paginateEntity<{ id: string; name: string }>(async (cursor) => {
        const r = await client.workflowStates({ first: PAGE_SIZE, after: cursor });
        return {
          items: r.nodes.map((s) => ({ id: s.id, name: s.name })),
          hasNextPage: r.pageInfo.hasNextPage,
          endCursor: r.pageInfo.endCursor ?? null,
        };
      }),

      // Labels: issue labels for display and push validation
      paginateEntity<{ id: string; name: string }>(async (cursor) => {
        const r = await client.issueLabels({ first: PAGE_SIZE, after: cursor });
        return {
          items: r.nodes.map((l) => ({ id: l.id, name: l.name })),
          hasNextPage: r.pageInfo.hasNextPage,
          endCursor: r.pageInfo.endCursor ?? null,
        };
      }),

      // Projects: optional project assignment
      paginateEntity<{ id: string; name: string }>(async (cursor) => {
        const r = await client.projects({ first: PAGE_SIZE, after: cursor });
        return {
          items: r.nodes.map((p) => ({ id: p.id, name: p.name })),
          hasNextPage: r.pageInfo.hasNextPage,
          endCursor: r.pageInfo.endCursor ?? null,
        };
      }),
    ]);

    // Build Map<id, value> lookup tables from the fetched entities
    return {
      teams: new Map(teams.map((t) => [t.id, { key: t.key, name: t.name }])),
      users: new Map(users.map((u) => [u.id, u.name])),
      states: new Map(states.map((s) => [s.id, s.name])),
      labels: new Map(labels.map((l) => [l.id, l.name])),
      projects: new Map(projects.map((p) => [p.id, p.name])),
    };
  } catch (err: unknown) {
    if (err instanceof AuthError || err instanceof ApiError) throw err;
    throw new ApiError(
      `Failed to fetch reference data: ${(err as Error).message}`,
      `Failed to fetch workspace data from Linear. ${(err as Error).message}`,
      { cause: err as Error },
    );
  }
}

/**
 * Paginate a single entity type, accumulating all items across pages.
 * Includes a throttle delay between pages to stay within rate limits (NF3).
 *
 * @param fetchPage - Function that fetches one page given an optional cursor
 * @returns Array of all items across all pages
 * @invariant NF3 — throttles between pages to respect Linear rate limits
 */
async function paginateEntity<T>(
  fetchPage: (cursor?: string) => Promise<{
    items: T[];
    hasNextPage: boolean;
    endCursor: string | null;
  }>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await fetchPage(cursor);
    all.push(...page.items);
    if (!page.hasNextPage) break;
    // Advance cursor and throttle to avoid hitting rate limits
    cursor = page.endCursor ?? undefined;
    await sleep(THROTTLE_MS);
  }

  return all;
}
