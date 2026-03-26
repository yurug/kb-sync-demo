// Module: pull-helpers -- Helper functions for the pull command
//
// This module contains the local modification detection and soft-delete
// logic used by the pull command. Extracted to keep pull.ts under 200 lines.
// It implements: P2 (local modification detection), P10 (deletion safety).
// Key design decisions: hash-based local mod detection, complete-fetch gate
// for deletions, per-file error tolerance.

import type { SyncState } from '../types.js';
import type { LinearClientInterface } from '../linear/types.js';
import { hashContent } from '../core/hasher.js';
import { moveToTrash } from '../fs/writer.js';

/**
 * Detect locally modified files by comparing current hashes with stored state.
 * A file is "modified" if its content hash differs from what we recorded at
 * last sync. New files (not in state) are not considered modifications.
 *
 * @param index - Map of issue ID to file path (from scanner)
 * @param state - Current sync state with stored hashes
 * @returns Array of file paths that have been modified locally
 * @invariant P2 — detects local changes so they aren't silently overwritten
 */
export async function detectLocalMods(
  index: Map<string, string>,
  state: SyncState,
): Promise<string[]> {
  const modified: string[] = [];
  for (const [id, path] of index) {
    const entry = state.issues[id];
    // New file not tracked in state — not a conflict, skip
    if (!entry) continue;

    try {
      const { readFile: rf } = await import('node:fs/promises');
      const content = await rf(path, 'utf-8');
      // Compare current hash against stored hash to detect edits
      if (hashContent(content) !== entry.contentHash) {
        modified.push(path);
      }
    } catch {
      // Can't read file — skip (may have been deleted)
    }
  }
  return modified;
}

/**
 * Detect deleted issues and move their local files to trash.
 * Only called when fetch was complete (P10 safety). If we can't
 * fetch the complete ID list, we skip deletion entirely.
 *
 * @param teamIds - Team IDs whose issues were fetched
 * @param client - Linear client for fetching complete ID list
 * @param existingIndex - Map of issue ID to file path on disk
 * @returns Number of files moved to trash
 * @invariant P10 — only deletes when all issue IDs were successfully fetched
 */
export async function detectAndTrashDeleted(
  teamIds: string[],
  client: LinearClientInterface,
  existingIndex: Map<string, string>,
): Promise<{ deleted: number; deletedIds: string[] }> {
  // Fetch complete list of remote issue IDs
  let allRemoteIds: string[];
  try {
    allRemoteIds = await client.fetchAllIssueIds(teamIds);
  } catch {
    // If we can't fetch the complete ID list, skip deletion (P10 safety)
    return { deleted: 0, deletedIds: [] };
  }

  const remoteIdSet = new Set(allRemoteIds);
  let deleted = 0;
  const deletedIds: string[] = [];
  const trashDir = '.kb-sync-trash';

  for (const [id, path] of existingIndex) {
    // Issue not in remote set means it was deleted or archived in Linear
    if (!remoteIdSet.has(id)) {
      try {
        await moveToTrash(path, trashDir);
        deleted++;
        deletedIds.push(id);
      } catch {
        // Failed to move — skip this file (NF7: per-file tolerance)
      }
    }
  }

  return { deleted, deletedIds };
}
