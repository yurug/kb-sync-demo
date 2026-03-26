#!/usr/bin/env node
// Module: index -- CLI entry point for kb-sync
//
// This is the main entry point: it sets up commander with all 4 commands
// (init, pull, push, status) and handles top-level errors. Concrete
// dependencies are created here and injected into command handlers.
// It implements: api-contracts.md command registration, error-handling.md exit codes.
// Key design decisions: DI wiring here (not in commands), top-level error
// handler catches KbSyncError for userMessage display.

import { Command } from 'commander';
import { LinearClientImpl } from './linear/client.js';
import { executeInit } from './commands/init.js';
import { executePull } from './commands/pull.js';
import { executePush } from './commands/push.js';
import { executeStatus } from './commands/status.js';
import { KbSyncError, AuthError, ConflictError } from './errors.js';

/** Package version — must match package.json. */
const VERSION = '0.1.0';

/**
 * Create a Linear API client from the LINEAR_API_KEY environment variable.
 * Validates that the key is set before constructing the client.
 *
 * @returns LinearClientImpl instance
 * @throws {AuthError} When LINEAR_API_KEY is not set
 */
function createLinearClient(): LinearClientImpl {
  const apiKey = process.env['LINEAR_API_KEY'];
  if (!apiKey) {
    throw new AuthError(
      'LINEAR_API_KEY not set',
      'LINEAR_API_KEY environment variable is not set. Export it and try again.',
    );
  }
  return new LinearClientImpl(apiKey);
}

/**
 * Top-level error handler. Catches KbSyncError subtypes and prints the
 * userMessage. Unknown errors print the full stack trace.
 *
 * @param error - The caught error
 */
function handleError(error: unknown): void {
  if (error instanceof ConflictError) {
    // Conflicts get exit code 2 (api-contracts.md)
    console.error(error.userMessage);
    process.exitCode = 2;
  } else if (error instanceof KbSyncError) {
    // All typed errors print userMessage and exit 1
    console.error(error.userMessage);
    process.exitCode = 1;
  } else {
    // Unexpected error — print message only, no stack trace (NF5)
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Unexpected error: ${msg}`);
    console.error('This is a bug — please report it.');
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// CLI setup with commander
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('kb-sync')
  .description('Bidirectional sync between a local markdown knowledge base and Linear')
  .version(VERSION);

// --- init command ---
program
  .command('init')
  .description('Initialize kb-sync: validate API key, create config file')
  .action(async () => {
    try {
      const client = createLinearClient();
      await executeInit(process.cwd(), client);
    } catch (error: unknown) {
      handleError(error);
    }
  });

// --- pull command ---
program
  .command('pull')
  .description('Fetch issues from Linear and write local markdown files')
  .option('--team <name>', 'Restrict to issues from a single team')
  .option('--force', 'Overwrite local modifications without warning', false)
  .action(async (opts: { team?: string; force: boolean }) => {
    try {
      const client = createLinearClient();
      await executePull(process.cwd(), { force: opts.force, team: opts.team }, client);
    } catch (error: unknown) {
      handleError(error);
    }
  });

// --- push command ---
program
  .command('push')
  .description('Push local changes to Linear')
  .option('--dry-run', 'Show changes without mutating Linear', false)
  .option('--force', 'Push even if conflicts detected', false)
  .argument('[files...]', 'Push specific files instead of all modified')
  .action(async (files: string[], opts: { dryRun: boolean; force: boolean }) => {
    try {
      const client = createLinearClient();
      await executePush(
        process.cwd(),
        { dryRun: opts.dryRun, force: opts.force, files: files.length > 0 ? files : undefined },
        client,
      );
    } catch (error: unknown) {
      handleError(error);
    }
  });

// --- status command ---
program
  .command('status')
  .description('Show local and remote changes since last sync')
  .action(async () => {
    try {
      const client = createLinearClient();
      await executeStatus(process.cwd(), client);
    } catch (error: unknown) {
      handleError(error);
    }
  });

// Parse and execute
program.parse();
