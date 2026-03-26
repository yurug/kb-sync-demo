// Module: hasher -- SHA-256 content hashing for change detection
//
// This module provides content hashing used to detect local file modifications.
// The hash is stored in .kb-sync-state.json and compared against the current
// file contents to determine if the user has edited a file since last sync.
// It implements: data-model.md SyncState.contentHash field.
// Key design decisions: SHA-256 (standard, fast, no collisions in practice),
// hex encoding for JSON-safe storage.

import { createHash } from 'node:crypto';

/**
 * Compute a SHA-256 hex digest of the given content string.
 *
 * @param content - File content to hash (full file including frontmatter)
 * @returns Hex-encoded SHA-256 digest
 * @invariant P6 — content hash enables local modification detection
 * @example
 * const hash = hashContent('---\nid: abc\n---\nBody text');
 * // => 'a1b2c3d4...' (64 hex characters)
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
