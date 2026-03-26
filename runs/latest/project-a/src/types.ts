// Module: types -- Shared type definitions for kb-sync
//
// This module defines the core data structures flowing through the system:
// Config, SyncState, MarkdownIssue, and LinearIssue. These types are the
// contract between modules — every module imports from here.
// It implements: data-model.md entities.
// Key design decisions: types-only module (no logic), strict nullability.

// ---------------------------------------------------------------------------
// Config — stored in .kb-sync.json
// ---------------------------------------------------------------------------

/**
 * User-facing configuration for the kb-sync tool.
 * Created by `init`, read by all other commands.
 *
 * @invariant P3 — config is the single source of truth for project settings
 */
export interface Config {
  /** Schema version for future migration. Only `1` is supported. */
  readonly version: number;
  /** Relative path from project root to the knowledge base directory. */
  readonly kbDir: string;
  /** Linear workspace URL slug (e.g., "my-company"). */
  readonly workspace: string;
  /** ISO 8601 timestamp of last successful sync. null before first sync. */
  readonly lastSyncedAt: string | null;
}

// ---------------------------------------------------------------------------
// SyncState — stored in .kb-sync-state.json
// ---------------------------------------------------------------------------

/**
 * Per-issue sync tracking record.
 * Used to detect local modifications and remote changes.
 */
export interface SyncStateEntry {
  /** ISO 8601 — Linear's updatedAt at last sync. */
  readonly updatedAt: string;
  /** SHA-256 hex digest of the file contents at last sync. */
  readonly contentHash: string;
}

/**
 * Full sync state, keyed by Linear issue UUID.
 *
 * @invariant P6 — conflict detection relies on accurate state tracking
 */
export interface SyncState {
  readonly issues: Record<string, SyncStateEntry>;
}

// ---------------------------------------------------------------------------
// LinearIssue — fetched from API after bulk-fetch-then-join
// ---------------------------------------------------------------------------

/**
 * An issue as received from the Linear API with all relation IDs
 * resolved to human-readable names via the bulk-fetch-then-join pattern.
 *
 * @see external/linear-sdk.md for why fields are pre-resolved
 */
export interface LinearIssue {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly description: string | null;
  readonly priority: number;
  readonly statusName: string;
  readonly assigneeName: string | null;
  readonly labelNames: string[];
  readonly teamKey: string;
  readonly teamName: string;
  readonly projectName: string | null;
  readonly url: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// MarkdownIssue — parsed from a local markdown file
// ---------------------------------------------------------------------------

/**
 * An issue as parsed from a local markdown file's frontmatter + body.
 * The canonical frontmatter field order is defined in config-and-formats.md.
 *
 * @invariant P4 — extra frontmatter fields are preserved in `extraFields`
 * @invariant P7 — only pushable fields are sent to Linear on push
 */
export interface MarkdownIssue {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly status: string;
  readonly priority: number;
  readonly assignee: string | null;
  readonly labels: string[];
  readonly team: string;
  readonly project: string | null;
  readonly url: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Markdown body below the frontmatter. */
  readonly body: string;
  /** User-added frontmatter fields not defined by kb-sync. */
  readonly extraFields: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Reference data — bulk-fetched from Linear for ID→name resolution
// ---------------------------------------------------------------------------

/**
 * Bulk-fetched lookup maps used by the mapper to resolve Linear IDs
 * to human-readable names without triggering lazy-loading.
 *
 * @see architecture/decisions/adr-002-bulk-fetch-then-join.md
 */
export interface ReferenceData {
  /** team ID → { key, name } */
  readonly teams: Map<string, { key: string; name: string }>;
  /** user ID → display name */
  readonly users: Map<string, string>;
  /** workflow state ID → state name */
  readonly states: Map<string, string>;
  /** label ID → label name */
  readonly labels: Map<string, string>;
  /** project ID → project name */
  readonly projects: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Command options
// ---------------------------------------------------------------------------

/** Options for the pull command. */
export interface PullOptions {
  readonly force: boolean;
  readonly team?: string;
}

/** Options for the push command. */
export interface PushOptions {
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly files?: string[];
}

// ---------------------------------------------------------------------------
// Canonical frontmatter field order (for serialization)
// ---------------------------------------------------------------------------

/**
 * The order in which frontmatter fields are written to markdown files.
 * Extra user fields are appended after these in alphabetical order.
 */
export const FRONTMATTER_FIELD_ORDER = [
  'id',
  'identifier',
  'title',
  'status',
  'priority',
  'assignee',
  'labels',
  'team',
  'project',
  'url',
  'createdAt',
  'updatedAt',
] as const;
