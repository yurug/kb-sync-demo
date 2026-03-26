// Module: status -- The `kb-sync status` command handler
//
// This module implements the status command: shows a summary of local changes,
// remote changes, and conflicts. It's a read-only command that helps users
// understand the current sync state before pulling or pushing.
// It implements: algorithms.md status algorithm, api-contracts.md status command.
// Key design decisions: lightweight remote query (just IDs + timestamps),
// no mutations, exit code always 0.

import type { SyncState } from '../types.js';
import type { LinearClientInterface } from '../linear/types.js';
import { readConfig } from '../core/config.js';
import { readState } from '../core/state.js';
import { hashContent } from '../core/hasher.js';
import { scanDirectory } from '../fs/scanner.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { printSection } from './status-formatter.js';

/**
 * Execute the `kb-sync status` command.
 * Shows a summary of local changes, remote changes, and potential conflicts.
 *
 * @param dir - Project root directory
 * @param client - Linear API client (injected for testability)
 * @throws {ConfigError} When config is missing or invalid
 * @throws {AuthError} When API key is invalid
 * @invariant P6 — conflict detection logic matches the push algorithm's
 * @example
 * await executeStatus(process.cwd(), linearClient);
 */
export async function executeStatus(
  dir: string,
  client: LinearClientInterface,
): Promise<void> {
  const config = await readConfig(dir);
  const state = await readState(dir);
  const kbDir = join(dir, config.kbDir);

  // Scan local files and detect changes against stored state
  const index = await scanDirectory(kbDir);
  const localChanges = await detectLocalChanges(index, state);
  printLocalChanges(localChanges);

  // First sync — no remote comparison possible
  if (config.lastSyncedAt === null) {
    console.log(chalk.dim('\nNo previous sync. Run "kb-sync pull" to fetch issues.'));
    return;
  }

  // Fetch and display remote changes, then report conflicts
  const remoteChanges = await fetchAndPrintRemoteChanges(client, state);
  reportConflicts(localChanges.modifiedIds, remoteChanges.modifiedIds);
}

/**
 * Print categorized local changes to the console.
 *
 * @param changes - Detected local file changes
 */
function printLocalChanges(changes: LocalChanges): void {
  printSection('Local changes', [
    { label: 'New (untracked)', items: changes.newFiles, color: chalk.green },
    { label: 'Modified', items: changes.modified, color: chalk.yellow },
    { label: 'Deleted', items: changes.deleted, color: chalk.red },
  ]);
}

/**
 * Fetch remote changes from Linear and print them.
 *
 * @param client - Linear API client
 * @param state - Stored sync state for timestamp comparison
 * @returns Categorized remote changes
 */
async function fetchAndPrintRemoteChanges(
  client: LinearClientInterface,
  state: SyncState,
): Promise<RemoteChanges> {
  console.log(chalk.dim('\nChecking remote changes...'));
  const refData = await client.fetchReferenceData();
  const teamIds = [...refData.teams.keys()];
  const remoteChanges = await detectRemoteChanges(teamIds, state, client);

  printSection('Remote changes', [
    { label: 'New issues', items: remoteChanges.newIssues, color: chalk.green },
    { label: 'Modified', items: remoteChanges.modified, color: chalk.yellow },
  ]);
  return remoteChanges;
}

/**
 * Report conflicts where both local and remote have changed.
 *
 * @param localModifiedIds - Issue IDs modified locally
 * @param remoteModifiedIds - Issue IDs modified on Linear
 */
function reportConflicts(localModifiedIds: string[], remoteModifiedIds: string[]): void {
  const conflicts = localModifiedIds.filter((id) => remoteModifiedIds.includes(id));
  if (conflicts.length > 0) {
    console.log(chalk.red(`\n${conflicts.length} conflict(s) detected.`));
    console.log(chalk.dim('Pull first, or use --force on push to override.'));
  }
}

// -------------------------------------------------------------------------
// Local change detection
// -------------------------------------------------------------------------

interface LocalChanges {
  newFiles: string[];
  modified: string[];
  modifiedIds: string[];
  deleted: string[];
}

/**
 * Detect local file changes by comparing current hashes to stored state.
 *
 * @param index - Map from issue ID to file path
 * @param state - Stored sync state
 * @returns Categorized local changes
 */
async function detectLocalChanges(
  index: Map<string, string>,
  state: SyncState,
): Promise<LocalChanges> {
  const newFiles: string[] = [];
  const modified: string[] = [];
  const modifiedIds: string[] = [];

  for (const [id, path] of index) {
    if (!state.issues[id]) {
      // File has an ID not in state — it's new (created locally)
      newFiles.push(path);
      continue;
    }

    try {
      const content = await readFile(path, 'utf-8');
      if (hashContent(content) !== state.issues[id].contentHash) {
        modified.push(path);
        modifiedIds.push(id);
      }
    } catch {
      // Can't read file — treat as deleted
    }
  }

  // Check for deleted files (in state but not on disk)
  const deleted: string[] = [];
  for (const id of Object.keys(state.issues)) {
    if (!index.has(id)) {
      deleted.push(id);
    }
  }

  return { newFiles, modified, modifiedIds, deleted };
}

// -------------------------------------------------------------------------
// Remote change detection
// -------------------------------------------------------------------------

interface RemoteChanges {
  newIssues: string[];
  modified: string[];
  modifiedIds: string[];
}

/**
 * Detect remote changes by comparing Linear timestamps to stored state.
 * Uses a lightweight ID+identifier+updatedAt query (PERF-1: no full issue resolution).
 *
 * @param teamIds - Teams to check
 * @param state - Stored sync state
 * @param client - Linear client
 * @returns Categorized remote changes
 */
async function detectRemoteChanges(
  teamIds: string[],
  state: SyncState,
  client: LinearClientInterface,
): Promise<RemoteChanges> {
  // Use lightweight timestamp query — no reference data resolution needed
  const issues = await client.fetchIssueTimestamps(teamIds);

  const newIssues: string[] = [];
  const modified: string[] = [];
  const modifiedIds: string[] = [];

  for (const issue of issues) {
    const entry = state.issues[issue.id];
    if (!entry) {
      newIssues.push(issue.identifier);
    } else if (issue.updatedAt > entry.updatedAt) {
      modified.push(issue.identifier);
      modifiedIds.push(issue.id);
    }
  }

  return { newIssues, modified, modifiedIds };
}

