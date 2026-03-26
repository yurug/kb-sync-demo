// Tests for src/core/sync-engine.ts — push orchestration

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executePushLogic } from '../../src/core/sync-engine.js';
import type { LinearClientInterface } from '../../src/linear/types.js';
import type { ReferenceData, SyncState } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-push-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['team-1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map([['user-1', 'Alice Smith']]),
    states: new Map([['state-1', 'In Progress'], ['state-2', 'Done']]),
    labels: new Map([['label-1', 'bug']]),
    projects: new Map([['proj-1', 'Q1 Sprint']]),
  };
}

function makeMockClient(
  overrides: Partial<LinearClientInterface> = {},
): LinearClientInterface {
  return {
    getViewer: vi.fn().mockResolvedValue({ id: 'u1', name: 'Test' }),
    getOrganization: vi.fn().mockResolvedValue({ name: 'Test', urlKey: 'test' }),
    fetchReferenceData: vi.fn().mockResolvedValue(makeRefData()),
    fetchIssues: vi.fn().mockResolvedValue([[], true]),
    fetchAllIssueIds: vi.fn().mockResolvedValue([]),
    fetchIssueUpdatedAt: vi.fn().mockResolvedValue('2026-03-25T10:00:00.000Z'),
    fetchIssueTimestamps: vi.fn().mockResolvedValue([]),
    updateIssue: vi.fn().mockResolvedValue('2026-03-25T12:00:00.000Z'),
    ...overrides,
  };
}

/** Write a config file to the test directory */
async function writeConfig(dir: string): Promise<void> {
  const config = { version: 1, kbDir: './kb', workspace: 'test', lastSyncedAt: '2026-03-25T10:00:00.000Z' };
  await writeFile(join(dir, '.kb-sync.json'), JSON.stringify(config));
}

/** Write a state file with tracked issues */
async function writeState(dir: string, state: SyncState): Promise<void> {
  await writeFile(join(dir, '.kb-sync-state.json'), JSON.stringify(state));
}

/**
 * Write a markdown file with given frontmatter fields and body.
 * Returns the file content for hash comparison.
 */
async function writeIssueFile(
  dir: string,
  filename: string,
  fields: Record<string, unknown>,
  body: string = 'Test body',
): Promise<string> {
  const kbDir = join(dir, 'kb', 'ENG');
  await mkdir(kbDir, { recursive: true });

  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      const items = value.map(v => `"${v}"`).join(', ');
      lines.push(`${key}: [${items}]`);
    } else if (value === null) {
      lines.push(`${key}: null`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: "${value}"`);
    }
  }
  lines.push('---', '', body, '');
  const content = lines.join('\n');

  const filePath = join(kbDir, filename);
  await writeFile(filePath, content);
  return content;
}

/** Hash content using the same algorithm as the app */
async function hashOf(content: string): Promise<string> {
  const { hashContent } = await import('../../src/core/hasher.js');
  return hashContent(content);
}

// ---------------------------------------------------------------------------
// Push: basic functionality
// ---------------------------------------------------------------------------

describe('Push: basic functionality', () => {
  it('detects modified files and pushes them', async () => {
    await writeConfig(testDir);

    // Write a file with known content
    await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test issue',
      status: 'In Progress', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });

    // State has a DIFFERENT hash, so the file appears modified
    const state: SyncState = {
      issues: {
        'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old-hash' },
      },
    };
    await writeState(testDir, state);

    const client = makeMockClient();
    const result = await executePushLogic(
      testDir, join(testDir, 'kb'),
      { dryRun: false, force: false }, client,
    );

    expect(result.pushed).toBe(1);
    expect(result.conflicts).toBe(0);
    expect(result.skipped).toBe(0);
    expect(client.updateIssue).toHaveBeenCalledOnce();
  });

  it('returns empty result when no files are modified', async () => {
    await writeConfig(testDir);

    const content = await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test issue',
      status: 'In Progress', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });

    // State matches current content — no modification
    const state: SyncState = {
      issues: {
        'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: await hashOf(content) },
      },
    };
    await writeState(testDir, state);

    const client = makeMockClient();
    const result = await executePushLogic(
      testDir, join(testDir, 'kb'),
      { dryRun: false, force: false }, client,
    );

    expect(result.pushed).toBe(0);
    expect(client.updateIssue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// P6: Conflict detection
// ---------------------------------------------------------------------------

describe('P6: Conflict detection', () => {
  it('P6: detects conflict when remote was modified since last sync', async () => {
    await writeConfig(testDir);
    await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test issue',
      status: 'In Progress', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });

    const state: SyncState = {
      issues: {
        'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old-hash' },
      },
    };
    await writeState(testDir, state);

    // Remote has a NEWER updatedAt than stored — conflict
    const client = makeMockClient({
      fetchIssueUpdatedAt: vi.fn().mockResolvedValue('2026-03-25T11:00:00.000Z'),
    });

    const result = await executePushLogic(
      testDir, join(testDir, 'kb'),
      { dryRun: false, force: false }, client,
    );

    expect(result.conflicts).toBe(1);
    expect(result.pushed).toBe(0);
    expect(client.updateIssue).not.toHaveBeenCalled();
  });

  it('P6: no conflict when remote has same timestamp', async () => {
    await writeConfig(testDir);
    await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test issue',
      status: 'In Progress', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });

    const state: SyncState = {
      issues: {
        'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old-hash' },
      },
    };
    await writeState(testDir, state);

    // Remote has SAME updatedAt — no conflict
    const client = makeMockClient({
      fetchIssueUpdatedAt: vi.fn().mockResolvedValue('2026-03-25T10:00:00.000Z'),
    });

    const result = await executePushLogic(
      testDir, join(testDir, 'kb'),
      { dryRun: false, force: false }, client,
    );

    expect(result.conflicts).toBe(0);
    expect(result.pushed).toBe(1);
  });

  it('P6: --force overrides conflict detection', async () => {
    await writeConfig(testDir);
    await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test issue',
      status: 'In Progress', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });

    const state: SyncState = {
      issues: {
        'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old-hash' },
      },
    };
    await writeState(testDir, state);

    // Remote is newer — would be a conflict, but --force overrides
    const client = makeMockClient({
      fetchIssueUpdatedAt: vi.fn().mockResolvedValue('2026-03-25T11:00:00.000Z'),
    });

    const result = await executePushLogic(
      testDir, join(testDir, 'kb'),
      { dryRun: false, force: true }, client,
    );

    // With --force, conflict detection is skipped
    expect(result.conflicts).toBe(0);
    expect(result.pushed).toBe(1);
    expect(client.updateIssue).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Dry-run
// ---------------------------------------------------------------------------

describe('Push: dry-run mode', () => {
  it('dry-run does not call updateIssue', async () => {
    await writeConfig(testDir);
    await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test issue',
      status: 'In Progress', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });

    const state: SyncState = {
      issues: {
        'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old-hash' },
      },
    };
    await writeState(testDir, state);

    const client = makeMockClient();
    const result = await executePushLogic(
      testDir, join(testDir, 'kb'),
      { dryRun: true, force: false }, client,
    );

    expect(result.pushed).toBe(1);
    expect(result.details[0].message).toContain('dry-run');
    // The actual API mutation should NOT have been called
    expect(client.updateIssue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T7: File missing required id field
// ---------------------------------------------------------------------------

describe('T7: Missing id field', () => {
  it('T7: skips file without id frontmatter', async () => {
    await writeConfig(testDir);

    // Write a file without the id field
    const kbDir = join(testDir, 'kb', 'ENG');
    await mkdir(kbDir, { recursive: true });
    await writeFile(
      join(kbDir, 'manual-file.md'),
      '---\ntitle: "No id"\nstatus: "Done"\npriority: 1\n---\nBody\n',
    );

    await writeState(testDir, { issues: {} });

    const client = makeMockClient();
    const result = await executePushLogic(
      testDir, join(testDir, 'kb'),
      { dryRun: false, force: false }, client,
    );

    // File should be skipped entirely — no push, no conflict, no error
    expect(result.pushed).toBe(0);
    expect(client.updateIssue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// NF7: Per-file error handling
// ---------------------------------------------------------------------------

describe('NF7: Graceful degradation', () => {
  it('NF7: one API error does not abort other files', async () => {
    await writeConfig(testDir);

    // Write two modified files
    await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test 1',
      status: 'In Progress', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });
    await writeIssueFile(testDir, 'ENG-2-test.md', {
      id: 'issue-2', identifier: 'ENG-2', title: 'Test 2',
      status: 'Done', priority: 1, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-2',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });

    const state: SyncState = {
      issues: {
        'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old-hash-1' },
        'issue-2': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old-hash-2' },
      },
    };
    await writeState(testDir, state);

    // First call fails, second succeeds
    const updateIssue = vi.fn()
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce('2026-03-25T12:00:00.000Z');

    const client = makeMockClient({ updateIssue });
    const result = await executePushLogic(
      testDir, join(testDir, 'kb'),
      { dryRun: false, force: false }, client,
    );

    // One pushed, one error — but neither should have aborted the other
    expect(result.pushed).toBe(1);
    expect(result.details.some(d => d.status === 'error')).toBe(true);
    expect(result.details.some(d => d.status === 'pushed')).toBe(true);
  });
});
