// Module: issue-fetcher -- Fetch issues via raw GraphQL
//
// This module provides GraphQL-based issue fetching that avoids the
// Linear SDK's lazy-loading traps. It fetches scalar fields + relation IDs,
// then resolves them via the resolver module.
// It implements: external/linear-sdk.md safe fetching pattern.
// Key design decisions: raw GraphQL, cursor pagination, throttled requests.

import type { LinearIssue, ReferenceData } from '../types.js';
import type { IssueNode } from './types.js';
import { paginate } from './pagination.js';
import { resolveIssueNode } from './resolver.js';

/** Page size for paginated queries. */
const PAGE_SIZE = 50;

/**
 * Raw GraphQL query executor type — provided by LinearClientImpl.
 */
export type RawQueryFn = <T>(query: string) => Promise<T>;

/**
 * Fetch issues from specified teams using raw GraphQL, then resolve
 * relation IDs to human-readable names.
 *
 * @param rawQuery - GraphQL executor function
 * @param refData - Reference data for name resolution
 * @param teamIds - Team UUIDs to fetch from
 * @param since - ISO 8601 for incremental sync (omit for full)
 * @returns Tuple of [resolved issues, fetchWasComplete]
 */
export async function fetchAndResolveIssues(
  rawQuery: RawQueryFn,
  refData: ReferenceData,
  teamIds: string[],
  since?: string,
): Promise<[LinearIssue[], boolean]> {
  // Build optional date filter for incremental sync — only fetch issues updated since last pull
  const updatedFilter = since ? `, updatedAt: { gte: "${since}" }` : '';

  // Paginate through all matching issues, fetching scalar fields + relation IDs
  const [nodes, complete] = await paginate<IssueNode>(async (cursor) => {
    const cursorArg = cursor ? `, after: "${cursor}"` : '';
    const query = `
      query {
        issues(
          first: ${PAGE_SIZE}${cursorArg},
          filter: { team: { id: { in: ${JSON.stringify(teamIds)} } }${updatedFilter} }
        ) {
          nodes {
            id identifier title description priority url createdAt updatedAt
            team { id }
            assignee { id }
            state { id }
            project { id }
            labels { nodes { id } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    const response = await rawQuery<{
      issues: {
        nodes: IssueNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(query);

    return {
      items: response.issues.nodes,
      hasNextPage: response.issues.pageInfo.hasNextPage,
      endCursor: response.issues.pageInfo.endCursor,
    };
  });

  // Resolve relation IDs (team.id, state.id, etc.) to human-readable names
  // using the pre-fetched reference data maps (ADR-002: bulk-fetch-then-join)
  const resolved = nodes.map((node) => resolveIssueNode(node, refData));
  return [resolved, complete];
}

/**
 * Fetch lightweight id+identifier+updatedAt for all issues in specified teams.
 * Used by the status command for efficient remote change detection (PERF-1).
 *
 * @param rawQuery - GraphQL executor function
 * @param teamIds - Team UUIDs to scan
 * @returns Array of {id, identifier, updatedAt} objects
 */
export async function fetchIssueTimestampList(
  rawQuery: RawQueryFn,
  teamIds: string[],
): Promise<Array<{ id: string; identifier: string; updatedAt: string }>> {
  const [items] = await paginate<{ id: string; identifier: string; updatedAt: string }>(async (cursor) => {
    const cursorArg = cursor ? `, after: "${cursor}"` : '';
    const query = `
      query {
        issues(
          first: ${PAGE_SIZE}${cursorArg},
          filter: { team: { id: { in: ${JSON.stringify(teamIds)} } } }
        ) {
          nodes { id identifier updatedAt }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    const response = await rawQuery<{
      issues: {
        nodes: Array<{ id: string; identifier: string; updatedAt: string }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(query);

    return {
      items: response.issues.nodes,
      hasNextPage: response.issues.pageInfo.hasNextPage,
      endCursor: response.issues.pageInfo.endCursor,
    };
  });

  return items;
}

/**
 * Fetch just the UUIDs of all issues in specified teams.
 * Lightweight query used by deletion detection — only fetches the `id` field
 * to minimize API payload (P10: need complete ID set for safe deletion).
 *
 * @param rawQuery - GraphQL executor function
 * @param teamIds - Team UUIDs to scan
 * @returns Array of issue UUIDs
 * @invariant P10 — complete ID list is required for safe deletion detection
 */
export async function fetchIssueIdList(
  rawQuery: RawQueryFn,
  teamIds: string[],
): Promise<string[]> {
  // Paginate through all issues, extracting only IDs
  const [ids] = await paginate<string>(async (cursor) => {
    const cursorArg = cursor ? `, after: "${cursor}"` : '';
    const query = `
      query {
        issues(
          first: ${PAGE_SIZE}${cursorArg},
          filter: { team: { id: { in: ${JSON.stringify(teamIds)} } } }
        ) {
          nodes { id }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    const response = await rawQuery<{
      issues: {
        nodes: Array<{ id: string }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(query);

    return {
      items: response.issues.nodes.map((n) => n.id),
      hasNextPage: response.issues.pageInfo.hasNextPage,
      endCursor: response.issues.pageInfo.endCursor,
    };
  });

  return ids;
}
