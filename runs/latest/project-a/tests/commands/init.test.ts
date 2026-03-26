// Tests for src/commands/init.ts — init command handler

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeInit } from '../../src/commands/init.js';
import type { LinearClientInterface } from '../../src/linear/types.js';
import { ConfigError, AuthError } from '../../src/errors.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-init-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

function makeMockClient(overrides: Partial<LinearClientInterface> = {}): LinearClientInterface {
  return {
    getViewer: vi.fn().mockResolvedValue({ id: 'user-1', name: 'Test User' }),
    getOrganization: vi.fn().mockResolvedValue({ name: 'Test Org', urlKey: 'test-org' }),
    fetchReferenceData: vi.fn().mockResolvedValue({
      teams: new Map(), users: new Map(), states: new Map(), labels: new Map(), projects: new Map(),
    }),
    fetchIssues: vi.fn().mockResolvedValue([[], true]),
    fetchAllIssueIds: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('P3: Init creates config file', () => {
  it('P3: creates .kb-sync.json with correct workspace info', async () => {
    const client = makeMockClient();
    const config = await executeInit(testDir, client);

    expect(config.version).toBe(1);
    expect(config.kbDir).toBe('./kb');
    expect(config.workspace).toBe('test-org');
    expect(config.lastSyncedAt).toBeNull();

    // Verify file was written
    const raw = await readFile(join(testDir, '.kb-sync.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.workspace).toBe('test-org');
  });

  it('P3: validates API key before creating config', async () => {
    const client = makeMockClient();
    await executeInit(testDir, client);
    expect(client.getViewer).toHaveBeenCalled();
  });
});

describe('T20: Config already exists', () => {
  it('T20: throws ConfigError when config already exists', async () => {
    await writeFile(join(testDir, '.kb-sync.json'), '{}');
    const client = makeMockClient();
    await expect(executeInit(testDir, client)).rejects.toThrow(ConfigError);
    try {
      await executeInit(testDir, client);
    } catch (err) {
      expect((err as ConfigError).userMessage).toContain('already exists');
    }
  });
});

describe('Init .gitignore update', () => {
  it('creates .gitignore with state file and trash entries', async () => {
    await executeInit(testDir, makeMockClient());
    const content = await readFile(join(testDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.kb-sync-state.json');
    expect(content).toContain('.kb-sync-trash/');
  });

  it('appends to existing .gitignore without duplicating', async () => {
    await writeFile(join(testDir, '.gitignore'), 'node_modules/\n');
    await executeInit(testDir, makeMockClient());
    const content = await readFile(join(testDir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.kb-sync-state.json');
    // No duplicates
    const matches = content.match(/\.kb-sync-state\.json/g);
    expect(matches).toHaveLength(1);
  });

  it('does not add entries already present', async () => {
    await writeFile(join(testDir, '.gitignore'), '.kb-sync-state.json\n.kb-sync-trash/\n');
    await executeInit(testDir, makeMockClient());
    const content = await readFile(join(testDir, '.gitignore'), 'utf-8');
    const stateMatches = content.match(/\.kb-sync-state\.json/g);
    expect(stateMatches).toHaveLength(1);
  });
});

describe('Auth errors during init', () => {
  it('T12: propagates AuthError for invalid API key', async () => {
    const client = makeMockClient({
      getViewer: vi.fn().mockRejectedValue(
        new AuthError('invalid', 'Linear API key is invalid or expired.'),
      ),
    });
    await expect(executeInit(testDir, client)).rejects.toThrow(AuthError);
  });
});
