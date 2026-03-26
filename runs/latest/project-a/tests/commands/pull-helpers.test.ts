// Tests for src/commands/pull-helpers.ts — local mod detection and trash

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectLocalMods, detectAndTrashDeleted } from '../../src/commands/pull-helpers.js';
import { hashContent } from '../../src/core/hasher.js';
import type { SyncState } from '../../src/types.js';
import type { LinearClientInterface } from '../../src/linear/types.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-helpers-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

// ---------------------------------------------------------------------------
// detectLocalMods
// ---------------------------------------------------------------------------

describe('P2: detectLocalMods', () => {
  it('P2: detects files with changed content', async () => {
    const kbDir = join(testDir, 'ENG');
    await mkdir(kbDir, { recursive: true });
    const content = '---\nid: "uuid-1"\n---\nBody\n';
    await writeFile(join(kbDir, 'file.md'), content);

    const index = new Map([['uuid-1', join(kbDir, 'file.md')]]);
    const state: SyncState = {
      issues: { 'uuid-1': { updatedAt: 'x', contentHash: 'different-hash' } },
    };

    const mods = await detectLocalMods(index, state);
    expect(mods.length).toBe(1);
    expect(mods[0]).toContain('file.md');
  });

  it('P2: returns empty when no files are modified', async () => {
    const kbDir = join(testDir, 'ENG');
    await mkdir(kbDir, { recursive: true });
    const content = '---\nid: "uuid-1"\n---\nBody\n';
    await writeFile(join(kbDir, 'file.md'), content);

    const index = new Map([['uuid-1', join(kbDir, 'file.md')]]);
    const state: SyncState = {
      issues: { 'uuid-1': { updatedAt: 'x', contentHash: hashContent(content) } },
    };

    const mods = await detectLocalMods(index, state);
    expect(mods.length).toBe(0);
  });

  it('P2: skips new files not tracked in state', async () => {
    const kbDir = join(testDir, 'ENG');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'new.md'), '---\nid: "new"\n---\n');

    const index = new Map([['new', join(kbDir, 'new.md')]]);
    const state: SyncState = { issues: {} };

    const mods = await detectLocalMods(index, state);
    expect(mods.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectAndTrashDeleted
// ---------------------------------------------------------------------------

describe('P10: detectAndTrashDeleted', () => {
  it('P10: moves deleted files to trash', async () => {
    const kbDir = join(testDir, 'ENG');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'old.md'), '---\nid: "gone"\n---\n');

    const existingIndex = new Map([['gone', join(kbDir, 'old.md')]]);

    const mockClient: LinearClientInterface = {
      getViewer: vi.fn(),
      getOrganization: vi.fn(),
      fetchReferenceData: vi.fn(),
      fetchIssues: vi.fn(),
      fetchAllIssueIds: vi.fn().mockResolvedValue(['other-id']),
      fetchIssueUpdatedAt: vi.fn(),
      fetchIssueTimestamps: vi.fn().mockResolvedValue([]),
      updateIssue: vi.fn(),
    };

    // Save original cwd and change to testDir so relative .kb-sync-trash works
    const originalCwd = process.cwd();
    process.chdir(testDir);
    try {
      const result = await detectAndTrashDeleted(['team-1'], mockClient, existingIndex);
      expect(result.deleted).toBe(1);
      expect(result.deletedIds).toEqual(['gone']);

      // Original file should be gone
      await expect(access(join(kbDir, 'old.md'))).rejects.toThrow();
      // File should be in trash (relative to testDir since that's cwd)
      const trashContent = await readFile(join(testDir, '.kb-sync-trash', 'old.md'), 'utf-8');
      expect(trashContent).toContain('gone');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('P10: does not delete files present in remote', async () => {
    const kbDir = join(testDir, 'ENG');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'keep.md'), '---\nid: "keep"\n---\n');

    const existingIndex = new Map([['keep', join(kbDir, 'keep.md')]]);

    const mockClient: LinearClientInterface = {
      getViewer: vi.fn(),
      getOrganization: vi.fn(),
      fetchReferenceData: vi.fn(),
      fetchIssues: vi.fn(),
      fetchAllIssueIds: vi.fn().mockResolvedValue(['keep']),
      fetchIssueUpdatedAt: vi.fn(),
      fetchIssueTimestamps: vi.fn().mockResolvedValue([]),
      updateIssue: vi.fn(),
    };

    const result = await detectAndTrashDeleted(['team-1'], mockClient, existingIndex);
    expect(result.deleted).toBe(0);
  });

  it('P10: returns 0 when fetchAllIssueIds fails (safety)', async () => {
    const existingIndex = new Map([['id-1', '/some/path.md']]);

    const mockClient: LinearClientInterface = {
      getViewer: vi.fn(),
      getOrganization: vi.fn(),
      fetchReferenceData: vi.fn(),
      fetchIssues: vi.fn(),
      fetchAllIssueIds: vi.fn().mockRejectedValue(new Error('network error')),
      fetchIssueUpdatedAt: vi.fn(),
      fetchIssueTimestamps: vi.fn().mockResolvedValue([]),
      updateIssue: vi.fn(),
    };

    const result = await detectAndTrashDeleted(['team-1'], mockClient, existingIndex);
    expect(result.deleted).toBe(0);
  });
});
