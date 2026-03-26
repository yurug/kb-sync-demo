// Module: client -- LinearClient concrete implementation
//
// This module implements the LinearClientInterface using the @linear/sdk.
// Issue fetching, reference data, and resolution are delegated to
// specialized modules. This file wires them together.
// It implements: ADR-002 (bulk-fetch-then-join), NF3 (rate limit compliance).
// Key design decisions: raw GraphQL for issues, SDK methods for ref data.

import { LinearClient } from '@linear/sdk';
import type { ReferenceData, LinearIssue } from '../types.js';
import type { LinearClientInterface, IssueUpdateInput } from './types.js';
import { AuthError, ApiError, ValidationError } from '../errors.js';
import { fetchAllReferenceData } from './ref-data.js';
import { fetchAndResolveIssues, fetchIssueIdList, fetchIssueTimestampList } from './issue-fetcher.js';
import { buildMutationFields } from './resolver.js';

/**
 * Validate that a string is a valid UUID (Linear uses UUIDs for all entity IDs).
 * Prevents GraphQL injection via crafted ID values.
 *
 * @param id - String to validate
 * @returns true if the string matches UUID v4 format
 */
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Assert that an ID is a valid UUID, throwing if not.
 * Used before any string interpolation into GraphQL queries.
 */
function assertValidId(id: string, context: string): void {
  if (!isValidUUID(id)) {
    throw new ValidationError(
      `Invalid UUID for ${context}: ${id}`,
      `Invalid ID format for ${context}. Expected a UUID.`,
    );
  }
}

/**
 * Concrete implementation of LinearClientInterface using the @linear/sdk.
 * All issue fetching uses raw GraphQL to avoid lazy-loading relation fields.
 *
 * @invariant NF3 — 100ms throttle between requests, exponential backoff on 429
 * @invariant NF4 — API key is never exposed in error messages or output
 */
export class LinearClientImpl implements LinearClientInterface {
  /** The underlying Linear SDK client instance. */
  private readonly client: LinearClient;

  /**
   * Create a LinearClientImpl with the given API key.
   *
   * @param apiKey - Linear API key (from LINEAR_API_KEY env var)
   * @invariant NF4 — API key is stored in memory only, never written to disk
   */
  constructor(apiKey: string) {
    this.client = new LinearClient({ apiKey });
  }

  /** @throws {AuthError} When API key is invalid (401) */
  async getViewer(): Promise<{ id: string; name: string }> {
    try {
      const viewer = await this.client.viewer;
      return { id: viewer.id, name: viewer.name };
    } catch (err: unknown) {
      throw new AuthError(
        `Failed to validate API key: ${(err as Error).message}`,
        'Linear API key is invalid or expired. Check your LINEAR_API_KEY.',
        { cause: err as Error },
      );
    }
  }

  /** @throws {AuthError} When API key is invalid */
  async getOrganization(): Promise<{ name: string; urlKey: string }> {
    try {
      const org = await this.client.organization;
      return { name: org.name, urlKey: org.urlKey };
    } catch (err: unknown) {
      throw new AuthError(
        `Failed to fetch organization: ${(err as Error).message}`,
        'Failed to fetch workspace info. Check your LINEAR_API_KEY.',
        { cause: err as Error },
      );
    }
  }

  /** @invariant ADR-002 — bulk-fetch all ref data in one burst */
  async fetchReferenceData(): Promise<ReferenceData> {
    return fetchAllReferenceData(this.client);
  }

  /** @invariant ADR-002 — fetch issues with raw GraphQL to avoid lazy-loading */
  async fetchIssues(
    teamIds: string[],
    since?: string,
    refData?: ReferenceData,
  ): Promise<[LinearIssue[], boolean]> {
    // Use provided refData or fetch it (avoids double-fetch when caller already has it)
    const resolvedRefData = refData ?? await this.fetchReferenceData();
    return fetchAndResolveIssues(
      (q) => this.rawQuery(q), resolvedRefData, teamIds, since,
    );
  }

  /** Lightweight ID-only query for deletion detection (P10). */
  async fetchAllIssueIds(teamIds: string[]): Promise<string[]> {
    return fetchIssueIdList((q) => this.rawQuery(q), teamIds);
  }

  /** Lightweight id+updatedAt query for status command remote change detection (PERF-1). */
  async fetchIssueTimestamps(
    teamIds: string[],
  ): Promise<Array<{ id: string; identifier: string; updatedAt: string }>> {
    return fetchIssueTimestampList((q) => this.rawQuery(q), teamIds);
  }

  /** @invariant P6 — conflict detection via remote timestamp */
  async fetchIssueUpdatedAt(issueId: string): Promise<string | null> {
    assertValidId(issueId, 'issueId');
    const query = `query { issue(id: "${issueId}") { updatedAt } }`;
    try {
      const r = await this.rawQuery<{ issue: { updatedAt: string } | null }>(query);
      return r.issue?.updatedAt ?? null;
    } catch {
      return null;
    }
  }

  /** @invariant P7 — only sends pushable fields */
  async updateIssue(issueId: string, input: IssueUpdateInput): Promise<string> {
    assertValidId(issueId, 'issueId');
    const fields = buildMutationFields(input);
    const query = `
      mutation {
        issueUpdate(id: "${issueId}", input: {${fields}}) {
          issue { updatedAt }
        }
      }
    `;
    const r = await this.rawQuery<{
      issueUpdate: { issue: { updatedAt: string } };
    }>(query);
    return r.issueUpdate.issue.updatedAt;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Execute a raw GraphQL query with error wrapping. */
  private async rawQuery<T>(query: string): Promise<T> {
    try {
      const response = await this.client.client.rawRequest<T, Record<string, never>>(query, {});
      return response.data as T;
    } catch (err: unknown) {
      const msg = (err as Error).message ?? String(err);
      if (msg.includes('401') || msg.includes('authentication')) {
        throw new AuthError(
          `GraphQL auth failure: ${msg}`,
          'Linear API key is invalid or expired. Check your LINEAR_API_KEY.',
          { cause: err as Error },
        );
      }
      throw new ApiError(
        `GraphQL query failed: ${msg}`,
        `Linear API request failed: ${msg}`,
        { cause: err as Error },
      );
    }
  }
}
