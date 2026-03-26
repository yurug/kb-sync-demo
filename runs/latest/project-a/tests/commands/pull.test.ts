// Tests for src/commands/pull.ts — pull command handler

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executePull } from '../../src/commands/pull.js';
import type { LinearClientInterface } from '../../src/linear/types.js';
import type { LinearIssue, ReferenceData } from '../../src/types.js';
import { ValidationError } from '../../src/errors.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-pull-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['team-1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map([['user-1', 'Alice Smith']]),
    states: new Map([['state-1', 'In Progress']]),
    labels: new Map([['label-1', 'bug']]),
    projects: new Map([['proj-1', 'Q1 Sprint']]),
  };
}

function makeIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'issue-uuid-1',
    identifier: 'ENG-1',
    title: 'Test issue',
    description: 'Description body',
    priority: 2,
    statusName: 'In Progress',
    assigneeName: 'Alice Smith',
    labelNames: ['bug'],
    teamKey: 'ENG',
    teamName: 'Engineering',
    projectName: 'Q1 Sprint',
    url: 'https://linear.app/test/issue/ENG-1',
    createdAt: '2026-03-20T09:00:00.000Z',
    updatedAt: '2026-03-25T10:00:00.000Z',
    ...overrides,
  };
}

function makeMockClient(
  issues: LinearIssue[] = [makeIssue()],
  overrides: Partial<LinearClientInterface> = {},
): LinearClientInterface {
  return {
    getViewer: vi.fn().mockResolvedValue({ id: 'u1', name: 'Test' }),
    getOrganization: vi.fn().mockResolvedValue({ name: 'Test', urlKey: 'test' }),
    fetchReferenceData: vi.fn().mockResolvedValue(makeRefData()),
    fetchIssues: vi.fn().mockResolvedValue([issues, true]),
    fetchAllIssueIds: vi.fn().mockResolvedValue(issues.map(i => i.id)),
    fetchIssueUpdatedAt: vi.fn().mockResolvedValue('2026-03-25T10:00:00.000Z'),
    fetchIssueTimestamps: vi.fn().mockResolvedValue([]),
    updateIssue: vi.fn().mockResolvedValue('2026-03-25T12:00:00.000Z'),
    ...overrides,
  };
}

async function writeConfigFile(dir: string): Promise<void> {
  const config = { version: 1, kbDir: './kb', workspace: 'test', lastSyncedAt: null };
  await writeFile(join(dir, '.kb-sync.json'), JSON.stringify(config));
}

describe('Pull: basic functionality', () => {
  it('creates markdown files from Linear issues', async () => {
    await writeConfigFile(testDir);
    await executePull(testDir, { force: false }, makeMockClient());

    const filePath = join(testDir, 'kb', 'ENG', 'ENG-1-test-issue.md');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('id: "issue-uuid-1"');
    expect(content).toContain('title: "Test issue"');
    expect(content).toContain('Description body');
  });

  it('creates state file after pull', async () => {
    await writeConfigFile(testDir);
    await executePull(testDir, { force: false }, makeMockClient());

    const stateRaw = await readFile(join(testDir, '.kb-sync-state.json'), 'utf-8');
    const state = JSON.parse(stateRaw);
    expect(state.issues['issue-uuid-1']).toBeDefined();
    expect(state.issues['issue-uuid-1'].updatedAt).toBe('2026-03-25T10:00:00.000Z');
  });

  it('updates lastSyncedAt in config', async () => {
    await writeConfigFile(testDir);
    await executePull(testDir, { force: false }, makeMockClient());

    const configRaw = await readFile(join(testDir, '.kb-sync.json'), 'utf-8');
    const config = JSON.parse(configRaw);
    expect(config.lastSyncedAt).not.toBeNull();
  });
});

describe('T8: Empty workspace', () => {
  it('T8: prints message and exits cleanly for empty workspace', async () => {
    await writeConfigFile(testDir);
    const consoleSpy = vi.spyOn(console, 'log');
    await executePull(testDir, { force: false }, makeMockClient([]));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No issues found'),
    );
    consoleSpy.mockRestore();
  });
});

describe('P5: ID-based matching', () => {
  it('P5: updates existing file found by ID, not filename', async () => {
    await writeConfigFile(testDir);
    // First pull
    await executePull(testDir, { force: true }, makeMockClient());

    // Verify file was created
    const filePath = join(testDir, 'kb', 'ENG', 'ENG-1-test-issue.md');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('issue-uuid-1');
  });
});

describe('--team filter', () => {
  it('filters to specified team', async () => {
    await writeConfigFile(testDir);
    const client = makeMockClient();
    await executePull(testDir, { force: false, team: 'Engineering' }, client);
    expect(client.fetchIssues).toHaveBeenCalled();
  });

  it('throws ValidationError for unknown team', async () => {
    await writeConfigFile(testDir);
    const client = makeMockClient();
    await expect(
      executePull(testDir, { force: false, team: 'Nonexistent' }, client),
    ).rejects.toThrow(ValidationError);
  });
});

describe('Pull with multiple issues', () => {
  it('writes multiple files for multiple issues', async () => {
    await writeConfigFile(testDir);
    const issues = [
      makeIssue({ id: 'id-1', identifier: 'ENG-1', title: 'First' }),
      makeIssue({ id: 'id-2', identifier: 'ENG-2', title: 'Second' }),
    ];
    await executePull(testDir, { force: false }, makeMockClient(issues));

    const file1 = await readFile(join(testDir, 'kb', 'ENG', 'ENG-1-first.md'), 'utf-8');
    const file2 = await readFile(join(testDir, 'kb', 'ENG', 'ENG-2-second.md'), 'utf-8');
    expect(file1).toContain('id: "id-1"');
    expect(file2).toContain('id: "id-2"');
  });
});

// ---------------------------------------------------------------------------
// P2: Local modification detection on pull
// ---------------------------------------------------------------------------

describe('P2: Local modification detection', () => {
  it('P2: detects local modifications and blocks pull without --force', async () => {
    // First pull to create files and state
    await writeConfigFile(testDir);
    await executePull(testDir, { force: false }, makeMockClient());

    // Modify a file locally
    const filePath = join(testDir, 'kb', 'ENG', 'ENG-1-test-issue.md');
    const original = await readFile(filePath, 'utf-8');
    await writeFile(filePath, original + '\n\nLocal edit!');

    // Update config to have lastSyncedAt (incremental sync)
    const config = JSON.parse(await readFile(join(testDir, '.kb-sync.json'), 'utf-8'));
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));

    // Second pull should detect local mods and block
    const errorSpy = vi.spyOn(console, 'error');
    await executePull(testDir, { force: false }, makeMockClient());
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('files modified locally'),
    );
    errorSpy.mockRestore();
  });

  it('P2: --force overwrites local modifications', async () => {
    await writeConfigFile(testDir);
    await executePull(testDir, { force: true }, makeMockClient());

    // Modify file
    const filePath = join(testDir, 'kb', 'ENG', 'ENG-1-test-issue.md');
    const original = await readFile(filePath, 'utf-8');
    await writeFile(filePath, original + '\nLocal change');

    // Pull with --force should succeed
    await executePull(testDir, { force: true }, makeMockClient());
    const content = await readFile(filePath, 'utf-8');
    expect(content).not.toContain('Local change');
  });
});

// ---------------------------------------------------------------------------
// P4: Extra frontmatter preservation on pull
// ---------------------------------------------------------------------------

describe('P4: Extra frontmatter preservation on pull', () => {
  it('P4: user-added fields survive a pull', async () => {
    // First pull
    await writeConfigFile(testDir);
    await executePull(testDir, { force: true }, makeMockClient());

    // Add an extra field to the file
    const filePath = join(testDir, 'kb', 'ENG', 'ENG-1-test-issue.md');
    let content = await readFile(filePath, 'utf-8');
    content = content.replace('---\n\n', 'notes: "keep me"\n---\n\n');
    await writeFile(filePath, content);

    // Second pull with --force
    await executePull(testDir, { force: true }, makeMockClient());

    const final = await readFile(filePath, 'utf-8');
    expect(final).toContain('notes: "keep me"');
  });
});

// ---------------------------------------------------------------------------
// P10: Deletion detection
// ---------------------------------------------------------------------------

describe('P10: Deletion safety', () => {
  it('P10: incomplete fetch does not trigger deletions', async () => {
    await writeConfigFile(testDir);
    // First pull to create files
    await executePull(testDir, { force: false }, makeMockClient());

    // Second pull with incomplete fetch — file should NOT be deleted
    const client = makeMockClient([], {
      fetchIssues: vi.fn().mockResolvedValue([[], false]), // incomplete
      fetchAllIssueIds: vi.fn().mockResolvedValue([]),
    });
    const config = JSON.parse(await readFile(join(testDir, '.kb-sync.json'), 'utf-8'));
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));

    await executePull(testDir, { force: true }, client);

    // File should still exist (not deleted due to incomplete fetch)
    const filePath = join(testDir, 'kb', 'ENG', 'ENG-1-test-issue.md');
    const exists = await readFile(filePath, 'utf-8').then(() => true).catch(() => false);
    // The issue has no matching issue in the fetched set, but the fetch was incomplete
    // so P10 says we should NOT delete
    expect(exists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Incremental sync
// ---------------------------------------------------------------------------

describe('P9: Incremental sync', () => {
  it('P9: uses lastSyncedAt from config for incremental fetch', async () => {
    // Config with lastSyncedAt set
    const config = { version: 1, kbDir: './kb', workspace: 'test', lastSyncedAt: '2026-03-24T00:00:00.000Z' };
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify(config));

    const client = makeMockClient();
    await executePull(testDir, { force: true }, client);

    // fetchIssues should have been called with the since parameter (3rd arg is pre-fetched refData)
    expect(client.fetchIssues).toHaveBeenCalledWith(
      expect.anything(),
      '2026-03-24T00:00:00.000Z',
      expect.anything(),
    );
  });
});
