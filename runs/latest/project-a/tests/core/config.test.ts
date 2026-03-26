// Tests for src/core/config.ts — config read/write/validate

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readConfig, writeConfig, configExists } from '../../src/core/config.js';
import { ConfigError } from '../../src/errors.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-config-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

describe('P3: Config as source of truth', () => {
  it('P3: readConfig parses a valid config file', async () => {
    const config = { version: 1, kbDir: './kb', workspace: 'test-ws', lastSyncedAt: null };
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));
    const result = await readConfig(testDir);
    expect(result).toEqual(config);
  });

  it('P3: writeConfig creates a pretty-printed JSON file', async () => {
    const config = { version: 1, kbDir: './kb', workspace: 'my-ws', lastSyncedAt: '2026-01-01T00:00:00.000Z' };
    await writeConfig(testDir, config);
    const raw = await readFile(join(testDir, '.kb-sync.json'), 'utf-8');
    expect(JSON.parse(raw)).toEqual(config);
    // Pretty-printed with 2 spaces
    expect(raw).toContain('  "version"');
  });

  it('P3: readConfig -> writeConfig roundtrip preserves values', async () => {
    const config = { version: 1, kbDir: './docs', workspace: 'ws', lastSyncedAt: '2026-03-25T10:00:00.000Z' };
    await writeConfig(testDir, config);
    const result = await readConfig(testDir);
    expect(result).toEqual(config);
  });
});

describe('ConfigError: missing file', () => {
  it('throws ConfigError when .kb-sync.json is missing', async () => {
    await expect(readConfig(testDir)).rejects.toThrow(ConfigError);
    try {
      await readConfig(testDir);
    } catch (err) {
      expect((err as ConfigError).userMessage).toContain("Run 'kb-sync init' first");
    }
  });
});

describe('T11: Malformed config file', () => {
  it('T11: throws ConfigError on invalid JSON', async () => {
    await writeFile(join(testDir, '.kb-sync.json'), '{ broken json!!!');
    await expect(readConfig(testDir)).rejects.toThrow(ConfigError);
    try {
      await readConfig(testDir);
    } catch (err) {
      expect((err as ConfigError).userMessage).toContain('Failed to parse');
    }
  });

  it('T11: throws ConfigError on missing version field', async () => {
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify({ kbDir: './kb', workspace: 'ws' }));
    await expect(readConfig(testDir)).rejects.toThrow(ConfigError);
  });

  it('T11: throws ConfigError on wrong version number', async () => {
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify({ version: 2, kbDir: './kb', workspace: 'ws' }));
    try {
      await readConfig(testDir);
    } catch (err) {
      expect((err as ConfigError).userMessage).toContain('unsupported version 2');
    }
  });

  it('T11: throws ConfigError on missing workspace', async () => {
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify({ version: 1, kbDir: './kb' }));
    await expect(readConfig(testDir)).rejects.toThrow(ConfigError);
  });

  it('T11: throws ConfigError when kbDir contains ..', async () => {
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify({ version: 1, kbDir: '../escape', workspace: 'ws' }));
    await expect(readConfig(testDir)).rejects.toThrow(ConfigError);
  });
});

describe('configExists', () => {
  it('returns false when config does not exist', async () => {
    expect(await configExists(testDir)).toBe(false);
  });

  it('returns true when config exists', async () => {
    await writeFile(join(testDir, '.kb-sync.json'), '{}');
    expect(await configExists(testDir)).toBe(true);
  });
});
