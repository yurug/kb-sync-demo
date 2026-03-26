// Tests for src/commands/push.ts — push command handler

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executePush } from '../../src/commands/push.js';
import type { LinearClientInterface } from '../../src/linear/types.js';
import type { ReferenceData, SyncState } from '../../src/types.js';
import { ConflictError } from '../../src/errors.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-push-cmd-'));
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

async function writeConfig(dir: string): Promise<void> {
  const config = { version: 1, kbDir: './kb', workspace: 'test', lastSyncedAt: '2026-03-25T10:00:00.000Z' };
  await writeFile(join(dir, '.kb-sync.json'), JSON.stringify(config));
}

async function writeStateFile(dir: string, state: SyncState): Promise<void> {
  await writeFile(join(dir, '.kb-sync-state.json'), JSON.stringify(state));
}

async function writeIssueFile(
  dir: string,
  filename: string,
  fields: Record<string, unknown>,
  body: string = 'Test body',
): Promise<void> {
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
  await writeFile(join(kbDir, filename), lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Push command tests
// ---------------------------------------------------------------------------

describe('Push command: basic', () => {
  it('prints success message when push completes', async () => {
    await writeConfig(testDir);
    await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test',
      status: 'In Progress', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });
    await writeStateFile(testDir, {
      issues: { 'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old' } },
    });

    const client = makeMockClient();
    await executePush(testDir, { dryRun: false, force: false }, client);
    expect(client.updateIssue).toHaveBeenCalledOnce();
  });

  it('prints info when no files are modified', async () => {
    await writeConfig(testDir);

    // Write a file
    await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test',
      status: 'In Progress', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });

    // Get the actual file content for matching hash
    const { readFile: rf } = await import('node:fs/promises');
    const content = await rf(join(testDir, 'kb/ENG/ENG-1-test.md'), 'utf-8');
    const { hashContent } = await import('../../src/core/hasher.js');
    const hash = hashContent(content);

    await writeStateFile(testDir, {
      issues: { 'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: hash } },
    });

    const client = makeMockClient();
    // Should not throw — just prints "0 updated"
    await executePush(testDir, { dryRun: false, force: false }, client);
    expect(client.updateIssue).not.toHaveBeenCalled();
  });
});

describe('Push command: conflict handling', () => {
  it('throws ConflictError when conflicts are detected', async () => {
    await writeConfig(testDir);
    await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test',
      status: 'In Progress', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });
    await writeStateFile(testDir, {
      issues: { 'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old' } },
    });

    // Remote has newer timestamp
    const client = makeMockClient({
      fetchIssueUpdatedAt: vi.fn().mockResolvedValue('2026-03-25T11:00:00.000Z'),
    });

    // Should throw ConflictError (exit code 2)
    await expect(
      executePush(testDir, { dryRun: false, force: false }, client),
    ).rejects.toThrow(ConflictError);
  });
});

describe('Push command: dry-run', () => {
  it('dry-run mode does not mutate Linear', async () => {
    await writeConfig(testDir);
    await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test',
      status: 'In Progress', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });
    await writeStateFile(testDir, {
      issues: { 'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old' } },
    });

    const client = makeMockClient();
    await executePush(testDir, { dryRun: true, force: false }, client);

    expect(client.updateIssue).not.toHaveBeenCalled();
  });
});

describe('P8: Validation skips bad files', () => {
  it('T6: invalid status causes file to be skipped', async () => {
    await writeConfig(testDir);
    await writeIssueFile(testDir, 'ENG-1-test.md', {
      id: 'issue-1', identifier: 'ENG-1', title: 'Test',
      status: 'InvalidStatus', priority: 2, assignee: 'Alice Smith',
      labels: ['bug'], team: 'Engineering', project: 'Q1 Sprint',
      url: 'https://linear.app/test/ENG-1',
      createdAt: '2026-03-20T09:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });
    await writeStateFile(testDir, {
      issues: { 'issue-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'old' } },
    });

    const client = makeMockClient();
    // Should NOT throw — file is skipped, not command aborted
    await executePush(testDir, { dryRun: false, force: false }, client);
    expect(client.updateIssue).not.toHaveBeenCalled();
  });
});
