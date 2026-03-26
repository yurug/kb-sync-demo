// Tests for src/commands/status.ts — status command handler

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeStatus } from '../../src/commands/status.js';
import type { LinearClientInterface } from '../../src/linear/types.js';
import type { ReferenceData, SyncState } from '../../src/types.js';
import { ConfigError } from '../../src/errors.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-status-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['team-1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map(),
    states: new Map(),
    labels: new Map(),
    projects: new Map(),
  };
}

function makeMockClient(): LinearClientInterface {
  return {
    getViewer: vi.fn().mockResolvedValue({ id: 'u1', name: 'Test' }),
    getOrganization: vi.fn().mockResolvedValue({ name: 'Test', urlKey: 'test' }),
    fetchReferenceData: vi.fn().mockResolvedValue(makeRefData()),
    fetchIssues: vi.fn().mockResolvedValue([[], true]),
    fetchAllIssueIds: vi.fn().mockResolvedValue([]),
    fetchIssueUpdatedAt: vi.fn().mockResolvedValue(null),
    fetchIssueTimestamps: vi.fn().mockResolvedValue([]),
    updateIssue: vi.fn().mockResolvedValue(''),
  };
}

describe('Status command', () => {
  it('throws ConfigError when no config file exists', async () => {
    await expect(executeStatus(testDir, makeMockClient())).rejects.toThrow(ConfigError);
  });

  it('shows "no previous sync" message when lastSyncedAt is null', async () => {
    const config = { version: 1, kbDir: './kb', workspace: 'test', lastSyncedAt: null };
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));
    await mkdir(join(testDir, 'kb'), { recursive: true });

    const consoleSpy = vi.spyOn(console, 'log');
    await executeStatus(testDir, makeMockClient());
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No previous sync'),
    );
    consoleSpy.mockRestore();
  });

  it('runs without error on a synced workspace', async () => {
    const config = {
      version: 1,
      kbDir: './kb',
      workspace: 'test',
      lastSyncedAt: '2026-03-25T10:00:00.000Z',
    };
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));
    await mkdir(join(testDir, 'kb'), { recursive: true });

    // Should not throw
    await expect(executeStatus(testDir, makeMockClient())).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Status with local and remote changes
// ---------------------------------------------------------------------------

describe('Status: local change detection', () => {
  it('detects locally modified files', async () => {
    const config = { version: 1, kbDir: './kb', workspace: 'test', lastSyncedAt: '2026-03-25T10:00:00.000Z' };
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));

    // Write a tracked file
    const kbDir = join(testDir, 'kb', 'ENG');
    await mkdir(kbDir, { recursive: true });
    const content = '---\nid: "issue-1"\ntitle: "Test"\n---\nBody\n';
    await writeFile(join(kbDir, 'ENG-1.md'), content);

    // State with a different hash (so it appears modified)
    const state: SyncState = {
      issues: { 'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'different-hash' } },
    };
    await writeFile(join(testDir, '.kb-sync-state.json'), JSON.stringify(state));

    const consoleSpy = vi.spyOn(console, 'log');
    await executeStatus(testDir, makeMockClient());
    const calls = consoleSpy.mock.calls.map(c => String(c[0]));
    // Should mention "Modified"
    expect(calls.some(c => c.includes('Modified'))).toBe(true);
    consoleSpy.mockRestore();
  });

  it('detects new (untracked) local files', async () => {
    const config = { version: 1, kbDir: './kb', workspace: 'test', lastSyncedAt: '2026-03-25T10:00:00.000Z' };
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));

    const kbDir = join(testDir, 'kb', 'ENG');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'new-file.md'), '---\nid: "new-id"\n---\nNew\n');

    // Empty state — file is untracked
    await writeFile(join(testDir, '.kb-sync-state.json'), JSON.stringify({ issues: {} }));

    const consoleSpy = vi.spyOn(console, 'log');
    await executeStatus(testDir, makeMockClient());
    const calls = consoleSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('New') || c.includes('untracked'))).toBe(true);
    consoleSpy.mockRestore();
  });

  it('detects deleted files (in state but not on disk)', async () => {
    const config = { version: 1, kbDir: './kb', workspace: 'test', lastSyncedAt: '2026-03-25T10:00:00.000Z' };
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));
    await mkdir(join(testDir, 'kb'), { recursive: true });

    // State tracks a file that no longer exists
    const state: SyncState = {
      issues: { 'deleted-issue': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'x' } },
    };
    await writeFile(join(testDir, '.kb-sync-state.json'), JSON.stringify(state));

    const consoleSpy = vi.spyOn(console, 'log');
    await executeStatus(testDir, makeMockClient());
    const calls = consoleSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('Deleted'))).toBe(true);
    consoleSpy.mockRestore();
  });
});

describe('Status: remote change detection', () => {
  it('detects new remote issues', async () => {
    const config = { version: 1, kbDir: './kb', workspace: 'test', lastSyncedAt: '2026-03-25T10:00:00.000Z' };
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));
    await mkdir(join(testDir, 'kb'), { recursive: true });
    await writeFile(join(testDir, '.kb-sync-state.json'), JSON.stringify({ issues: {} }));

    // Client returns a new issue not in state (lightweight timestamp query)
    const client = {
      ...makeMockClient(),
      fetchIssueTimestamps: vi.fn().mockResolvedValue([
        { id: 'new-remote', identifier: 'ENG-99', updatedAt: '2026-03-25T12:00:00.000Z' },
      ]),
    };

    const consoleSpy = vi.spyOn(console, 'log');
    await executeStatus(testDir, client);
    const calls = consoleSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('New issues'))).toBe(true);
    consoleSpy.mockRestore();
  });

  it('detects remotely modified issues', async () => {
    const config = { version: 1, kbDir: './kb', workspace: 'test', lastSyncedAt: '2026-03-25T10:00:00.000Z' };
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));
    await mkdir(join(testDir, 'kb'), { recursive: true });

    // State has an issue with old timestamp
    const state: SyncState = {
      issues: { 'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'x' } },
    };
    await writeFile(join(testDir, '.kb-sync-state.json'), JSON.stringify(state));

    // Remote has a newer updatedAt (lightweight timestamp query)
    const client = {
      ...makeMockClient(),
      fetchIssueTimestamps: vi.fn().mockResolvedValue([
        { id: 'issue-1', identifier: 'ENG-1', updatedAt: '2026-03-25T11:00:00.000Z' },
      ]),
    };

    const consoleSpy = vi.spyOn(console, 'log');
    await executeStatus(testDir, client);
    const calls = consoleSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('Modified'))).toBe(true);
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

describe('Status: conflict detection', () => {
  it('P6: detects conflicts when both local and remote are modified', async () => {
    const config = { version: 1, kbDir: './kb', workspace: 'test', lastSyncedAt: '2026-03-25T10:00:00.000Z' };
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));

    // Write a locally modified file
    const kbDir = join(testDir, 'kb', 'ENG');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'ENG-1.md'), '---\nid: "issue-1"\ntitle: "Modified"\n---\nChanged body\n');

    // State has the original hash
    const state: SyncState = {
      issues: { 'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old-hash' } },
    };
    await writeFile(join(testDir, '.kb-sync-state.json'), JSON.stringify(state));

    // Remote also has changes (newer updatedAt) — lightweight timestamp query
    const client = {
      ...makeMockClient(),
      fetchIssueTimestamps: vi.fn().mockResolvedValue([
        { id: 'issue-1', identifier: 'ENG-1', updatedAt: '2026-03-25T11:00:00.000Z' },
      ]),
    };

    const consoleSpy = vi.spyOn(console, 'log');
    await executeStatus(testDir, client);
    const calls = consoleSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('conflict'))).toBe(true);
    consoleSpy.mockRestore();
  });
});
