// Module: init -- The `kb-sync init` command handler
//
// This module implements the init command: validates the API key, fetches
// workspace info from Linear, creates .kb-sync.json, and updates .gitignore.
// It's the entry point for new users — the first command they run.
// It implements: api-contracts.md init command, algorithms.md init algorithm.
// Key design decisions: fail if config already exists (T20), append to .gitignore.

import { readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from '../types.js';
import type { LinearClientInterface } from '../linear/types.js';
import { ConfigError } from '../errors.js';
import { configExists, writeConfig } from '../core/config.js';

/**
 * Execute the `kb-sync init` command.
 * Validates the API key, fetches workspace info, creates config, updates .gitignore.
 *
 * @param dir - Project root directory
 * @param client - Linear API client (injected for testability)
 * @returns The created Config object
 * @throws {ConfigError} When config already exists (T20)
 * @throws {AuthError} When API key is invalid
 * @invariant P3 — creates the single source of truth config file
 * @example
 * const config = await executeInit(process.cwd(), linearClient);
 */
export async function executeInit(
  dir: string,
  client: LinearClientInterface,
): Promise<Config> {
  // T20: refuse to overwrite existing config
  if (await configExists(dir)) {
    throw new ConfigError(
      'Config already exists',
      '.kb-sync.json already exists. Delete it first to re-initialize.',
    );
  }

  // Validate API key by fetching viewer info
  await client.getViewer();

  // Fetch workspace metadata for the config file
  const org = await client.getOrganization();

  // Create the config with default values
  const config: Config = {
    version: 1,
    kbDir: './kb',
    workspace: org.urlKey,
    lastSyncedAt: null,
  };

  await writeConfig(dir, config);

  // Update .gitignore with state file and trash directory
  await updateGitignore(dir);

  console.log(`Initialized kb-sync for workspace "${org.name}". Config written.`);
  return config;
}

/**
 * Append kb-sync entries to .gitignore if they're not already present.
 * Creates .gitignore if it doesn't exist.
 *
 * @param dir - Project root directory
 * @returns Resolves when .gitignore is updated
 */
async function updateGitignore(dir: string): Promise<void> {
  const gitignorePath = join(dir, '.gitignore');
  const entriesToAdd = ['.kb-sync-state.json', '.kb-sync-trash/'];

  // Read existing .gitignore content (may not exist)
  let existing = '';
  try {
    existing = await readFile(gitignorePath, 'utf-8');
  } catch {
    // File doesn't exist — will be created
  }

  // Only add entries that aren't already present
  const linesToAdd = entriesToAdd.filter((entry) => !existing.includes(entry));

  if (linesToAdd.length > 0) {
    const suffix = existing.endsWith('\n') || existing.length === 0 ? '' : '\n';
    const content = suffix + linesToAdd.join('\n') + '\n';
    await appendFile(gitignorePath, content, 'utf-8');
  }
}
