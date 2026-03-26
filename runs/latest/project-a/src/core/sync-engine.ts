// Module: sync-engine -- Push orchestration: detect, validate, conflict-check, update
//
// This module orchestrates the push flow: identifies locally modified files,
// checks for conflicts with Linear, validates pushable fields, and sends
// updates. It is the core logic for the push command, separated from CLI
// concerns for testability and reuse.
// It implements: algorithms.md push algorithm, P1, P6, P7, P8, NF7.
// Key design decisions: per-file error handling (NF7), conflict = skip not fail,
// validation before mutation, dry-run support.

import type { SyncState, PushOptions, ReferenceData } from '../types.js';
import type { LinearClientInterface } from '../linear/types.js';
import { readState, writeState, updateStateEntry } from './state.js';
import { markdownToLinearUpdate } from './mapper.js';
import { findModifiedFiles } from './change-detector.js';
import type { ModifiedFile } from './change-detector.js';

// ---------------------------------------------------------------------------
// Push result types
// ---------------------------------------------------------------------------

/** Summary of a push operation. */
export interface PushResult {
  readonly pushed: number;
  readonly conflicts: number;
  readonly skipped: number;
  readonly details: PushDetail[];
}

/** Detail for a single file processed during push. */
export interface PushDetail {
  readonly identifier: string;
  readonly filePath: string;
  readonly status: 'pushed' | 'conflict' | 'skipped' | 'error' | 'dry-run';
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Main push orchestration
// ---------------------------------------------------------------------------

/**
 * Execute the push logic: detect modified files, check conflicts, validate,
 * and update Linear issues.
 *
 * @param dir - Project root directory
 * @param kbDir - Absolute path to the knowledge base directory
 * @param options - Push options (--dry-run, --force, files)
 * @param client - Linear API client (injected for testability)
 * @returns PushResult summarizing what happened
 * @invariant P6 — conflict detection: skip if remote updatedAt > stored
 * @invariant P7 — only pushable fields sent to Linear
 * @invariant P8 — validate fields before mutation
 * @invariant NF7 — one bad file doesn't abort the whole push
 */
export async function executePushLogic(
  dir: string,
  kbDir: string,
  options: PushOptions,
  client: LinearClientInterface,
): Promise<PushResult> {
  const state = await readState(dir);
  const details: PushDetail[] = [];
  let pushed = 0, conflicts = 0, skipped = 0;

  const modified = await findModifiedFiles(kbDir, state, options.files);
  if (modified.length === 0) {
    return { pushed: 0, conflicts: 0, skipped: 0, details: [] };
  }

  const refData = await client.fetchReferenceData();
  let currentState = state;

  // Process each modified file independently (NF7)
  for (const item of modified) {
    const result = await processSingleFile(item, currentState, refData, options, client);
    details.push(result.detail);

    if (result.detail.status === 'pushed' || result.detail.status === 'dry-run') {
      pushed++;
      if (result.newUpdatedAt && result.contentHash) {
        currentState = updateStateEntry(
          currentState, item.issue.id, result.newUpdatedAt, result.contentHash,
        );
      }
    } else if (result.detail.status === 'conflict') {
      conflicts++;
    } else {
      skipped++;
    }
  }

  if (!options.dryRun && pushed > 0) {
    await writeState(dir, currentState);
  }

  return { pushed, conflicts, skipped, details };
}

// ---------------------------------------------------------------------------
// Single file processing
// ---------------------------------------------------------------------------

interface ProcessResult {
  readonly detail: PushDetail;
  readonly newUpdatedAt?: string;
  readonly contentHash?: string;
}

/**
 * Process a single modified file through the push pipeline:
 * conflict check -> validate -> push (or dry-run).
 *
 * @param item - Modified file with parsed issue, path, and current content hash
 * @param state - Current sync state for conflict timestamp comparison
 * @param refData - Reference data maps for field validation and ID resolution
 * @param options - Push options (--dry-run, --force)
 * @param client - Linear API client for remote timestamp check and mutation
 * @returns ProcessResult with push detail and optional updated timestamp/hash
 * @invariant P6 — conflict detection via remote timestamp comparison
 * @invariant P8 — field validation before mutation
 */
async function processSingleFile(
  item: ModifiedFile,
  state: SyncState,
  refData: ReferenceData,
  options: PushOptions,
  client: LinearClientInterface,
): Promise<ProcessResult> {
  const { issue, filePath, currentHash } = item;

  // Check for remote conflicts before pushing (P6)
  const conflict = await checkConflict(issue.id, state, options.force, client);
  if (conflict) {
    return { detail: { identifier: issue.identifier, filePath, ...conflict } };
  }

  // Validate pushable fields against reference data (P8)
  const { input, errors } = markdownToLinearUpdate(issue, refData);
  if (errors.length > 0) {
    return {
      detail: {
        identifier: issue.identifier, filePath, status: 'skipped',
        message: errors.join('; '),
      },
    };
  }

  // Dry-run mode: report what would happen without mutating
  if (options.dryRun) {
    return {
      detail: {
        identifier: issue.identifier, filePath, status: 'dry-run',
        message: 'Would update (dry-run)',
      },
    };
  }

  // Execute the actual Linear API mutation
  return sendUpdate(issue.id, issue.identifier, filePath, input, currentHash, client);
}

/**
 * Check if a remote conflict exists for the given issue.
 *
 * @param issueId - Linear issue UUID
 * @param state - Sync state with stored timestamps
 * @param force - Whether to skip conflict detection
 * @param client - Linear client for fetching remote timestamp
 * @returns Conflict detail if conflict detected, undefined otherwise
 * @invariant P6 — remote updatedAt > stored updatedAt means conflict
 */
async function checkConflict(
  issueId: string,
  state: SyncState,
  force: boolean,
  client: LinearClientInterface,
): Promise<{ status: 'conflict'; message: string } | undefined> {
  const storedUpdatedAt = state.issues[issueId]?.updatedAt;
  if (!storedUpdatedAt || force) return undefined;

  const remoteUpdatedAt = await client.fetchIssueUpdatedAt(issueId);
  if (remoteUpdatedAt && remoteUpdatedAt > storedUpdatedAt) {
    return {
      status: 'conflict',
      message: 'Modified on Linear since last sync. Pull first or use --force.',
    };
  }
  return undefined;
}

/**
 * Send the validated update to Linear and return the result.
 *
 * @param issueId - Linear issue UUID
 * @param identifier - Human-readable identifier (e.g., "ENG-123")
 * @param filePath - Local file path for reporting
 * @param input - Validated update payload
 * @param contentHash - Current file content hash for state update
 * @param client - Linear API client
 * @returns ProcessResult with push detail and updated metadata
 */
async function sendUpdate(
  issueId: string,
  identifier: string,
  filePath: string,
  input: import('../linear/types.js').IssueUpdateInput,
  contentHash: string,
  client: LinearClientInterface,
): Promise<ProcessResult> {
  try {
    const newUpdatedAt = await client.updateIssue(issueId, input);
    return {
      detail: { identifier, filePath, status: 'pushed', message: 'Updated successfully' },
      newUpdatedAt,
      contentHash,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      detail: { identifier, filePath, status: 'error', message: `API error: ${msg}` },
    };
  }
}
