// Module: pull -- The `kb-sync pull` command handler
//
// This module implements the pull command: fetches issues from Linear and
// writes them as local markdown files. Supports full sync, incremental sync,
// --team filtering, --force to overwrite local mods, and soft-delete detection.
// It implements: algorithms.md pull algorithm, P1-P5, P9-P10.
// Key design decisions: match files by ID (not filename), soft delete to trash,
// gate deletion on complete fetch success.

import type { PullOptions, SyncState, LinearIssue, Config, ReferenceData } from '../types.js';
import type { LinearClientInterface } from '../linear/types.js';
import { readConfig, writeConfig } from '../core/config.js';
import { readState, writeState, updateStateEntry, removeStateEntry } from '../core/state.js';
import { linearToMarkdown, buildFilePath } from '../core/mapper.js';
import { hashContent } from '../core/hasher.js';
import { scanDirectory } from '../fs/scanner.js';
import { writeMarkdownFile } from '../fs/writer.js';
import { readMarkdownFile } from '../fs/reader.js';
import { ValidationError } from '../errors.js';
import { createProgress } from '../core/progress.js';
import { detectLocalMods, detectAndTrashDeleted } from './pull-helpers.js';
import { rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import chalk from 'chalk';

/**
 * Execute the `kb-sync pull` command.
 * Fetches issues from Linear and writes/updates local markdown files.
 *
 * @param dir - Project root directory
 * @param options - Pull options (--force, --team)
 * @param client - Linear API client (injected for testability)
 * @throws {ConfigError} When config is missing or invalid
 * @throws {AuthError} When API key is invalid
 * @throws {ApiError} When Linear API fails
 * @invariant P1 — pull direction preserves roundtrip fidelity
 * @invariant P2 — warns on local mods, requires --force to overwrite
 * @invariant P5 — matches files by frontmatter id, not filename
 * @invariant P10 — soft-deletes only when fetch is complete
 */
export async function executePull(
  dir: string,
  options: PullOptions,
  client: LinearClientInterface,
): Promise<void> {
  const config = await readConfig(dir);
  let state = await readState(dir);
  const kbDir = join(dir, config.kbDir);

  // Step 1: Check for local modifications (P2)
  const existingIndex = await scanDirectory(kbDir);
  if (await hasLocalMods(existingIndex, state, options.force)) {
    return;
  }

  const isFirstSync = config.lastSyncedAt === null;
  const progress = createProgress('Fetching workspace data from Linear...');

  // Step 3: Fetch reference data and resolve team filter
  const refData = await client.fetchReferenceData();
  const teamIds = resolveTeamFilter(refData, options.team);

  // Step 4: Fetch issues from Linear
  progress.update('Fetching issues from Linear...');
  const since = isFirstSync ? undefined : config.lastSyncedAt ?? undefined;
  const [issues, fetchWasComplete] = await client.fetchIssues(teamIds, since, refData);

  // Handle empty workspace (T8)
  if (issues.length === 0 && isFirstSync) {
    await handleEmptyWorkspace(kbDir, config, dir, progress);
    return;
  }

  // Step 5: Write markdown files and update state
  progress.update(`Writing ${issues.length} files...`);
  state = await writeIssueFiles(issues, kbDir, existingIndex, state);

  // Step 6: Deletion detection (only on complete fetch, P10)
  let deleted = 0;
  if (fetchWasComplete) {
    const result = await handleDeletions(teamIds, client, existingIndex);
    deleted = result.deleted;
    for (const id of result.deletedIds) {
      state = removeStateEntry(state, id);
    }
  }

  // Step 7: Persist updated config and state
  await writeConfig(dir, { ...config, lastSyncedAt: new Date().toISOString() });
  await writeState(dir, state);
  progress.succeed(`Pull complete. ${issues.length} written, ${deleted} deleted, 0 conflicts.`);
}

/**
 * Check if there are local modifications that would be overwritten.
 * Prints a warning and sets exit code 1 if mods found.
 *
 * @param index - Map of issue ID to file path on disk
 * @param state - Current sync state
 * @param force - Whether --force flag was provided
 * @returns true if pull should abort due to local mods
 * @invariant P2 — never silently overwrite local changes
 */
async function hasLocalMods(
  index: Map<string, string>,
  state: SyncState,
  force: boolean,
): Promise<boolean> {
  if (force || index.size === 0) return false;
  const localMods = await detectLocalMods(index, state);
  if (localMods.length > 0) {
    console.error(
      chalk.yellow(`${localMods.length} files modified locally since last sync. Use --force to overwrite.`),
    );
    process.exitCode = 1;
    return true;
  }
  return false;
}

/**
 * Resolve the --team filter to a list of team IDs.
 * Returns all team IDs if no filter is specified.
 *
 * @param refData - Reference data containing team maps
 * @param teamFilter - Optional team name from --team flag
 * @returns Array of team UUIDs to sync
 * @throws {ValidationError} When specified team name is not found
 */
function resolveTeamFilter(refData: ReferenceData, teamFilter?: string): string[] {
  if (!teamFilter) return [...refData.teams.keys()];

  const matchedTeam = [...refData.teams.entries()].find(
    ([, t]) => t.name === teamFilter,
  );
  if (!matchedTeam) {
    const available = [...refData.teams.values()].map((t) => t.name).join(', ');
    throw new ValidationError(
      `Team '${teamFilter}' not found`,
      `Team '${teamFilter}' not found. Available teams: ${available}`,
    );
  }
  return [matchedTeam[0]];
}

/**
 * Handle empty workspace case: create kbDir, update config.
 *
 * @param kbDir - Knowledge base directory path
 * @param config - Current config
 * @param dir - Project root directory
 * @param progress - Progress reporter to stop
 */
async function handleEmptyWorkspace(
  kbDir: string,
  config: Config,
  dir: string,
  progress: ReturnType<typeof createProgress>,
): Promise<void> {
  progress.stop();
  await mkdir(kbDir, { recursive: true });
  console.log(`No issues found in workspace '${config.workspace}'. Nothing to sync.`);
  await writeConfig(dir, { ...config, lastSyncedAt: new Date().toISOString() });
}

/**
 * Write fetched issues as markdown files, preserving extra frontmatter (P4)
 * and matching by ID (P5). Returns updated state.
 *
 * @param issues - Fetched Linear issues
 * @param kbDir - Knowledge base directory path
 * @param existingIndex - Map of issue ID to existing file path
 * @param state - Current sync state to update
 * @returns Updated sync state with new hashes and timestamps
 * @invariant P4 — extra frontmatter fields are preserved on overwrite
 * @invariant P5 — files are matched by frontmatter ID, not filename
 */
async function writeIssueFiles(
  issues: LinearIssue[],
  kbDir: string,
  existingIndex: Map<string, string>,
  state: SyncState,
): Promise<SyncState> {
  let current = state;
  for (const issue of issues) {
    const filePath = buildFilePath(kbDir, issue.teamKey, issue.identifier, issue.title);
    const existingPath = existingIndex.get(issue.id);

    // Preserve extra frontmatter and handle renames (P4, P5)
    const extraFields = await preserveExtraFields(existingPath);
    await handleRename(existingPath, filePath);

    // Convert and write the issue as markdown
    const mdIssue = linearToMarkdown(issue, extraFields);
    const content = await writeMarkdownFile(filePath, mdIssue);
    current = updateStateEntry(current, issue.id, issue.updatedAt, hashContent(content));
  }
  return current;
}

/**
 * Read extra frontmatter fields from an existing file for preservation.
 *
 * @param existingPath - Path to existing file, or undefined if new
 * @returns Extra frontmatter fields, or empty object if none
 * @invariant P4 — custom user fields survive pull overwrites
 */
async function preserveExtraFields(
  existingPath: string | undefined,
): Promise<Record<string, unknown>> {
  if (!existingPath) return {};
  try {
    const existing = await readMarkdownFile(existingPath);
    return existing.extraFields;
  } catch {
    return {};
  }
}

/**
 * Rename a file if its title-based path has changed.
 *
 * @param existingPath - Current file path, or undefined if new
 * @param newPath - Target file path based on current title
 */
async function handleRename(
  existingPath: string | undefined,
  newPath: string,
): Promise<void> {
  if (!existingPath || existingPath === newPath) return;
  try {
    await mkdir(dirname(newPath), { recursive: true });
    await rename(existingPath, newPath);
  } catch {
    // Rename failed — file will be created fresh at new path
  }
}

/**
 * Detect and trash-delete files for issues removed from Linear.
 *
 * @param teamIds - Team IDs that were synced
 * @param client - Linear client for fetching remote issue IDs
 * @param existingIndex - Map of issue ID to file path on disk
 * @returns Deletion result with count and IDs of deleted files
 * @invariant P10 — only deletes when complete fetch confirmed
 */
async function handleDeletions(
  teamIds: string[],
  client: LinearClientInterface,
  existingIndex: Map<string, string>,
): Promise<{ deleted: number; deletedIds: string[] }> {
  return detectAndTrashDeleted(teamIds, client, existingIndex);
}
