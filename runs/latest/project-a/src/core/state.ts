// Module: state -- Read/write .kb-sync-state.json (per-issue sync tracking)
//
// This module manages the sync state file that tracks per-issue metadata:
// Linear's updatedAt timestamp and a content hash of the local file.
// Together these enable local modification detection and conflict detection.
// It implements: data-model.md SyncState entity, P6 (conflict detection).
// Key design decisions: graceful degradation on corrupt state (treat as first sync).

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SyncState, SyncStateEntry } from '../types.js';

/** The state filename, always at project root. */
const STATE_FILENAME = '.kb-sync-state.json';

/**
 * Read the sync state file. Returns an empty state if the file is missing
 * or corrupt (graceful degradation — triggers a full re-sync).
 *
 * @param dir - Directory containing .kb-sync-state.json
 * @returns Parsed SyncState, or empty state if missing/corrupt
 * @invariant P6 — state must be accurate for conflict detection to work
 * @example
 * const state = await readState('/path/to/project');
 * if (state.issues['abc-123']) { ... }
 */
export async function readState(dir: string): Promise<SyncState> {
  const filePath = join(dir, STATE_FILENAME);

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist — first sync, return empty state
    return { issues: {} };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    // Basic shape validation — if corrupt, treat as empty
    if (typeof parsed === 'object' && parsed !== null && 'issues' in parsed) {
      return parsed as SyncState;
    }
    // Malformed structure — warn and return empty
    console.warn(`Warning: ${STATE_FILENAME} has unexpected structure. Treating as first sync.`);
    return { issues: {} };
  } catch {
    // Invalid JSON — warn and return empty (T10: corrupted state file)
    console.warn(`Warning: ${STATE_FILENAME} is corrupted. Treating as first sync.`);
    return { issues: {} };
  }
}

/**
 * Write the full sync state to disk.
 *
 * @param dir - Directory to write state file to
 * @param state - Complete SyncState to persist
 */
export async function writeState(dir: string, state: SyncState): Promise<void> {
  const filePath = join(dir, STATE_FILENAME);
  const content = JSON.stringify(state, null, 2) + '\n';
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Update a single issue entry in the state, returning a new state object.
 * Immutable — does not mutate the input.
 *
 * @param state - Current sync state
 * @param issueId - Linear issue UUID
 * @param updatedAt - Linear's updatedAt timestamp (ISO 8601)
 * @param contentHash - SHA-256 hex of the written file content
 * @returns New SyncState with the entry updated
 */
export function updateStateEntry(
  state: SyncState,
  issueId: string,
  updatedAt: string,
  contentHash: string,
): SyncState {
  const entry: SyncStateEntry = { updatedAt, contentHash };
  return {
    issues: { ...state.issues, [issueId]: entry },
  };
}

/**
 * Remove an issue entry from state (e.g., when a file is moved to trash).
 *
 * @param state - Current sync state
 * @param issueId - Linear issue UUID to remove
 * @returns New SyncState without the entry
 */
export function removeStateEntry(state: SyncState, issueId: string): SyncState {
  const { [issueId]: _removed, ...remaining } = state.issues;
  return { issues: remaining };
}
