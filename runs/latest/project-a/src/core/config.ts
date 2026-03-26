// Module: config -- Read, write, and validate .kb-sync.json
//
// This module owns the Config lifecycle: reading from disk, validating
// all fields against the schema, and writing updates (e.g., lastSyncedAt).
// It implements: P3 (config as single source of truth), config-and-formats.md.
// Key design decisions: strict validation with helpful error messages,
// JSON format (not YAML) per product requirements.

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from '../types.js';
import { ConfigError } from '../errors.js';

/** The config filename, always at project root. */
const CONFIG_FILENAME = '.kb-sync.json';

/**
 * Read and validate the config file from the given directory.
 *
 * @param dir - Directory containing .kb-sync.json (usually process.cwd())
 * @returns Validated Config object
 * @throws {ConfigError} When config file is missing, unparseable, or invalid
 * @invariant P3 — config is the single source of truth
 * @example
 * const config = await readConfig('/path/to/project');
 */
export async function readConfig(dir: string): Promise<Config> {
  const filePath = join(dir, CONFIG_FILENAME);

  // Attempt to read the file — missing file is a specific error
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    throw new ConfigError(
      `Failed to read ${filePath}`,
      `No ${CONFIG_FILENAME} found. Run 'kb-sync init' first.`,
      { cause: err as Error },
    );
  }

  // Parse JSON — show the parse error details
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const parseErr = err as SyntaxError;
    throw new ConfigError(
      `JSON parse error in ${filePath}: ${parseErr.message}`,
      `Failed to parse ${CONFIG_FILENAME}: ${parseErr.message}`,
      { cause: parseErr },
    );
  }

  // Validate that parsed value is an object
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(
      `${filePath} is not a JSON object`,
      `${CONFIG_FILENAME} is invalid: expected a JSON object.`,
    );
  }

  const obj = parsed as Record<string, unknown>;
  return validateConfig(obj);
}

/**
 * Validate a raw config object against the expected schema.
 *
 * @param obj - Raw parsed JSON object
 * @returns Validated Config
 * @throws {ConfigError} When required fields are missing or have wrong types
 */
function validateConfig(obj: Record<string, unknown>): Config {
  validateVersion(obj);
  validateKbDir(obj);
  validateWorkspace(obj);
  const lastSyncedAt = validateLastSyncedAt(obj);

  return {
    version: 1,
    kbDir: obj['kbDir'] as string,
    workspace: obj['workspace'] as string,
    lastSyncedAt,
  };
}

/**
 * Validate the version field: must exist and be 1.
 *
 * @param obj - Raw config object
 * @throws {ConfigError} When version is missing or unsupported
 */
function validateVersion(obj: Record<string, unknown>): void {
  if (obj['version'] === undefined) {
    throw new ConfigError(
      'Missing version field',
      `${CONFIG_FILENAME} is invalid: missing required field 'version'.`,
    );
  }
  if (obj['version'] !== 1) {
    throw new ConfigError(
      `Unsupported version: ${String(obj['version'])}`,
      `${CONFIG_FILENAME} has unsupported version ${String(obj['version'])} (expected 1).`,
    );
  }
}

/**
 * Validate the kbDir field: required non-empty string, no path escaping.
 *
 * @param obj - Raw config object
 * @throws {ConfigError} When kbDir is missing, empty, or contains ".."
 */
function validateKbDir(obj: Record<string, unknown>): void {
  if (typeof obj['kbDir'] !== 'string' || obj['kbDir'].length === 0) {
    throw new ConfigError(
      'Invalid kbDir',
      `${CONFIG_FILENAME} is invalid: missing required field 'kbDir'.`,
    );
  }
  if (obj['kbDir'].includes('..')) {
    throw new ConfigError(
      'kbDir contains ..',
      `${CONFIG_FILENAME} is invalid: kbDir must not contain '..' path escaping.`,
    );
  }
}

/**
 * Validate the workspace field: required non-empty string.
 *
 * @param obj - Raw config object
 * @throws {ConfigError} When workspace is missing or empty
 */
function validateWorkspace(obj: Record<string, unknown>): void {
  if (typeof obj['workspace'] !== 'string' || obj['workspace'].length === 0) {
    throw new ConfigError(
      'Invalid workspace',
      `${CONFIG_FILENAME} is invalid: missing required field 'workspace'.`,
    );
  }
}

/**
 * Validate the lastSyncedAt field: optional, must be string or null.
 *
 * @param obj - Raw config object
 * @returns Validated lastSyncedAt value
 * @throws {ConfigError} When lastSyncedAt has wrong type
 */
function validateLastSyncedAt(obj: Record<string, unknown>): string | null {
  const lastSyncedAt = obj['lastSyncedAt'];
  if (lastSyncedAt !== undefined && lastSyncedAt !== null && typeof lastSyncedAt !== 'string') {
    throw new ConfigError(
      'Invalid lastSyncedAt type',
      `${CONFIG_FILENAME} is invalid: 'lastSyncedAt' must be a string or null.`,
    );
  }
  return (lastSyncedAt as string | null) ?? null;
}

/**
 * Write the config object to .kb-sync.json with pretty-printing.
 *
 * @param dir - Directory to write config to
 * @param config - Config object to serialize
 * @throws {ConfigError} When file cannot be written
 * @invariant P3 — persists the single source of truth
 */
export async function writeConfig(dir: string, config: Config): Promise<void> {
  const filePath = join(dir, CONFIG_FILENAME);
  const content = JSON.stringify(config, null, 2) + '\n';
  try {
    await writeFile(filePath, content, 'utf-8');
  } catch (err: unknown) {
    throw new ConfigError(
      `Failed to write ${filePath}`,
      `Failed to write ${CONFIG_FILENAME}: ${(err as Error).message}`,
      { cause: err as Error },
    );
  }
}

/**
 * Check whether a config file already exists.
 *
 * @param dir - Directory to check
 * @returns true if .kb-sync.json exists
 */
export async function configExists(dir: string): Promise<boolean> {
  try {
    await access(join(dir, CONFIG_FILENAME));
    return true;
  } catch {
    return false;
  }
}
