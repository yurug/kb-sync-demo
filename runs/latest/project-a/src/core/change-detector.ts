// Module: change-detector -- Find locally modified files for push
//
// This module scans the knowledge base directory, compares file hashes
// with the stored sync state, and identifies which files have been
// modified locally. It also filters to specific files if requested.
// It implements: algorithms.md push step 1 (identify modified files).
// Key design decisions: hash comparison, skip files without id (T7).

import type { SyncState, MarkdownIssue } from '../types.js';
import { hashContent } from './hasher.js';
import { readMarkdownFile } from '../fs/reader.js';
import { scanDirectory } from '../fs/scanner.js';
import { readFile } from 'node:fs/promises';

/**
 * A locally modified file ready for push processing.
 */
export interface ModifiedFile {
  readonly filePath: string;
  readonly issue: MarkdownIssue;
  readonly currentHash: string;
  readonly rawContent: string;
}

/**
 * Find all locally modified files by comparing current hashes to state.
 * Filters to specific files if targetFiles is set.
 *
 * @param kbDir - Knowledge base directory
 * @param state - Current sync state
 * @param targetFiles - Optional list of specific files to check
 * @returns Array of modified files with parsed content
 */
export async function findModifiedFiles(
  kbDir: string,
  state: SyncState,
  targetFiles?: string[],
): Promise<ModifiedFile[]> {
  const modified: ModifiedFile[] = [];

  // Get files to check: either specified files or all in kbDir
  let filePaths: string[];
  if (targetFiles && targetFiles.length > 0) {
    filePaths = targetFiles;
  } else {
    const index = await scanDirectory(kbDir);
    filePaths = [...index.values()];
  }

  for (const filePath of filePaths) {
    try {
      const issue = await readMarkdownFile(filePath);

      // T7: Skip files without required id field
      if (!issue.id) {
        console.warn(`Skipping ${filePath}: missing required field 'id'`);
        continue;
      }

      // Skip files not from a previous pull (unknown to state)
      if (!state.issues[issue.id]) {
        console.warn(`Skipping ${filePath}: unknown issue (not from a previous pull)`);
        continue;
      }

      // Compare hash to detect actual modifications
      const rawContent = await readFile(filePath, 'utf-8');
      const currentHash = hashContent(rawContent);
      if (currentHash !== state.issues[issue.id].contentHash) {
        modified.push({ filePath, issue, currentHash, rawContent });
      }
    } catch {
      // Can't read or parse — skip this file (NF7)
      console.warn(`Skipping ${filePath}: unable to read or parse`);
    }
  }

  return modified;
}
