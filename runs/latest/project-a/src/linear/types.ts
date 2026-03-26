// Module: linear/types -- Linear-specific types for raw GraphQL responses
//
// This module defines the shape of data returned by the Linear GraphQL API
// before bulk-fetch-then-join resolution. These types match the raw response
// from client.client.rawRequest(), not the SDK's lazy-loading objects.
// It implements: external/linear-sdk.md IssueNode interface.
// Key design decisions: plain interfaces (no classes), matches GraphQL schema.

// ---------------------------------------------------------------------------
// Raw issue node from GraphQL response
// ---------------------------------------------------------------------------

/**
 * A single issue node as returned by the raw GraphQL query.
 * Relation fields contain only IDs — the mapper resolves them to names
 * using the bulk-fetched ReferenceData maps.
 *
 * @see external/linear-sdk.md for the GraphQL query that produces this shape
 */
export interface IssueNode {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly description: string | null;
  readonly priority: number;
  readonly url: string;
  /** ISO 8601 string from GraphQL (already a string, unlike SDK Date objects). */
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly team: { readonly id: string };
  readonly assignee: { readonly id: string } | null;
  readonly state: { readonly id: string };
  readonly project: { readonly id: string } | null;
  readonly labels: { readonly nodes: ReadonlyArray<{ readonly id: string }> };
}

// ---------------------------------------------------------------------------
// Pagination response shape
// ---------------------------------------------------------------------------

/**
 * Page info for cursor-based (Relay-style) pagination.
 */
export interface PageInfo {
  readonly hasNextPage: boolean;
  readonly endCursor: string | null;
}

/**
 * A paginated response containing issue nodes.
 */
export interface IssuesConnection {
  readonly nodes: IssueNode[];
  readonly pageInfo: PageInfo;
}

// ---------------------------------------------------------------------------
// Linear API client interface
// ---------------------------------------------------------------------------

/**
 * Interface for the Linear API client. All interaction with Linear goes
 * through this interface, enabling DI-based mocking in tests.
 *
 * @invariant NF3 — implementations must respect rate limits (100ms throttle, backoff)
 */
export interface LinearClientInterface {
  /**
   * Validate the API key and get the authenticated user's info.
   * @returns Viewer identity
   * @throws {AuthError} When API key is invalid
   */
  getViewer(): Promise<{ id: string; name: string }>;

  /**
   * Get the workspace/organization info.
   * @returns Organization name and URL slug
   * @throws {AuthError} When API key is invalid
   */
  getOrganization(): Promise<{ name: string; urlKey: string }>;

  /**
   * Bulk-fetch all reference data (teams, users, states, labels, projects).
   * @returns ReferenceData maps for ID->name resolution
   * @throws {ApiError} When API calls fail after retries
   */
  fetchReferenceData(): Promise<import('../types.js').ReferenceData>;

  /**
   * Fetch issues from specified teams, optionally filtered by updatedAt.
   * Uses raw GraphQL to avoid lazy-loading traps.
   *
   * @param teamIds - Team UUIDs to fetch issues from
   * @param since - ISO 8601 timestamp for incremental sync (omit for full sync)
   * @returns Tuple of [resolved LinearIssues, fetchWasComplete flag]
   * @throws {ApiError} When API calls fail after retries
   */
  fetchIssues(
    teamIds: string[],
    since?: string,
    refData?: import('../types.js').ReferenceData,
  ): Promise<[import('../types.js').LinearIssue[], boolean]>;

  /**
   * Fetch just the IDs of all issues in specified teams.
   * Used for deletion detection — lightweight query.
   *
   * @param teamIds - Team UUIDs to scan
   * @returns Array of issue UUIDs
   */
  fetchAllIssueIds(teamIds: string[]): Promise<string[]>;

  /**
   * Fetch lightweight id+updatedAt pairs for all issues in specified teams.
   * Used by the status command for remote change detection without full issue resolution.
   *
   * @param teamIds - Team UUIDs to scan
   * @returns Array of {id, updatedAt} objects
   */
  fetchIssueTimestamps(teamIds: string[]): Promise<Array<{ id: string; identifier: string; updatedAt: string }>>;

  /**
   * Fetch the current updatedAt timestamp for a single issue.
   * Used for conflict detection before push — lightweight single-field query.
   *
   * @param issueId - Linear issue UUID
   * @returns ISO 8601 updatedAt timestamp, or null if issue not found
   * @throws {ApiError} When API call fails
   * @invariant P6 — enables conflict detection by comparing remote vs stored timestamp
   */
  fetchIssueUpdatedAt(issueId: string): Promise<string | null>;

  /**
   * Update an issue on Linear with the given fields.
   * Only pushable fields should be included (P7).
   *
   * @param issueId - Linear issue UUID
   * @param input - Fields to update (title, description, stateId, priority, assigneeId, labelIds, projectId)
   * @returns The updatedAt from Linear's mutation response (for state tracking)
   * @throws {ApiError} When the mutation fails
   * @invariant P7 — only pushable fields are sent
   */
  updateIssue(issueId: string, input: IssueUpdateInput): Promise<string>;
}

// ---------------------------------------------------------------------------
// Issue update input for push mutations
// ---------------------------------------------------------------------------

/**
 * Fields that can be sent to Linear when updating an issue.
 * All fields are optional — only changed fields need to be included.
 * Uses Linear IDs (not names) for relations, resolved by the sync engine.
 *
 * @invariant P7 — mirrors the "pushable" column in data-model.md
 */
export interface IssueUpdateInput {
  readonly title?: string;
  readonly description?: string;
  readonly stateId?: string;
  readonly priority?: number;
  readonly assigneeId?: string | null;
  readonly labelIds?: string[];
  readonly projectId?: string | null;
}
