// Module: push -- The `kb-sync push` command handler
//
// This module implements the push command: detects locally modified files,
// checks for conflicts with Linear, validates fields, and pushes changes.
// Uses sync-engine.ts for the core logic; this file handles CLI concerns
// (exit codes, output formatting, option wiring).
// It implements: api-contracts.md push command, P6, P7, P8, NF7.
// Key design decisions: exit code 2 for conflicts, per-file error handling,
// dry-run prints changes without mutating.

import type { PushOptions } from '../types.js';
import type { LinearClientInterface } from '../linear/types.js';
import { readConfig } from '../core/config.js';
import { executePushLogic } from '../core/sync-engine.js';
import { ConflictError } from '../errors.js';
import { createProgress } from '../core/progress.js';
import { join } from 'node:path';
import chalk from 'chalk';

/**
 * Execute the `kb-sync push` command.
 * Pushes locally modified files back to Linear.
 *
 * @param dir - Project root directory
 * @param options - Push options (--dry-run, --force, files)
 * @param client - Linear API client (injected for testability)
 * @throws {ConfigError} When config is missing or invalid
 * @throws {AuthError} When API key is invalid
 * @throws {ConflictError} When conflicts are detected (exit code 2)
 * @invariant P6 — detects and reports conflicts
 * @invariant P7 — only pushable fields sent to Linear
 * @invariant NF7 — one bad file doesn't abort the whole push
 */
export async function executePush(
  dir: string,
  options: PushOptions,
  client: LinearClientInterface,
): Promise<void> {
  const config = await readConfig(dir);
  const kbDir = join(dir, config.kbDir);

  // NF6: spinner for potentially long operations
  const progress = createProgress('Detecting local changes...');
  const result = await executePushLogic(dir, kbDir, options, client);
  progress.stop();

  // No modified files — inform the user and exit
  if (result.details.length === 0) {
    console.log('No modified files to push.');
    return;
  }

  // Print per-file details
  for (const detail of result.details) {
    const prefix = formatStatus(detail.status);
    console.log(`${prefix} ${detail.identifier}: ${detail.message}`);
  }

  // Print summary
  const mode = options.dryRun ? ' (dry-run)' : '';
  console.log(
    `\nPush complete${mode}. ` +
    `${result.pushed} updated, ${result.conflicts} conflicts, ${result.skipped} skipped.`,
  );

  // Exit code 2 if conflicts were detected (api-contracts.md)
  if (result.conflicts > 0) {
    throw new ConflictError(
      `${result.conflicts} conflict(s) detected during push`,
      `${result.conflicts} conflict(s) detected. Pull first or use --force.`,
    );
  }
}

/**
 * Format a status label with color for terminal output.
 *
 * @param status - The push detail status
 * @returns Colored status prefix string
 */
function formatStatus(status: string): string {
  switch (status) {
    case 'pushed': return chalk.green('[updated]');
    case 'dry-run': return chalk.cyan('[dry-run]');
    case 'conflict': return chalk.red('[conflict]');
    case 'skipped': return chalk.yellow('[skipped]');
    case 'error': return chalk.red('[error]');
    default: return `[${status}]`;
  }
}
