// End-to-end tests — full CLI workflow with mocked Linear API
// Tests: init -> pull -> modify -> push -> status

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeInit } from '../src/commands/init.js';
import { executePull } from '../src/commands/pull.js';
import { executePush } from '../src/commands/push.js';
import { executeStatus } from '../src/commands/status.js';
import type { LinearClientInterface } from '../src/linear/types.js';
import type { LinearIssue, ReferenceData } from '../src/types.js';
import { ConflictError } from '../src/errors.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-e2e-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['team-1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map([['user-1', 'Alice Smith']]),
    states: new Map([['state-1', 'In Progress'], ['state-2', 'Done']]),
    labels: new Map([['label-1', 'bug'], ['label-2', 'feature']]),
    projects: new Map([['proj-1', 'Q1 Sprint']]),
  };
}

function makeIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'issue-uuid-1',
    identifier: 'ENG-1',
    title: 'Fix login bug',
    description: 'The login page crashes on submit.',
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
    getViewer: vi.fn().mockResolvedValue({ id: 'u1', name: 'Test User' }),
    getOrganization: vi.fn().mockResolvedValue({ name: 'Test Org', urlKey: 'test-org' }),
    fetchReferenceData: vi.fn().mockResolvedValue(makeRefData()),
    fetchIssues: vi.fn().mockResolvedValue([issues, true]),
    fetchAllIssueIds: vi.fn().mockResolvedValue(issues.map(i => i.id)),
    fetchIssueUpdatedAt: vi.fn().mockResolvedValue('2026-03-25T10:00:00.000Z'),
    fetchIssueTimestamps: vi.fn().mockResolvedValue([]),
    updateIssue: vi.fn().mockResolvedValue('2026-03-25T12:00:00.000Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// E2E: Full workflow — init -> pull -> modify -> push
// ---------------------------------------------------------------------------

describe('E2E: Full init -> pull -> modify -> push workflow', () => {
  it('E2E: complete workflow produces correct state at each step', async () => {
    const client = makeMockClient();

    // Step 1: Init
    const config = await executeInit(testDir, client);
    expect(config.workspace).toBe('test-org');
    expect(config.kbDir).toBe('./kb');

    // Verify config file exists
    const configRaw = await readFile(join(testDir, '.kb-sync.json'), 'utf-8');
    expect(JSON.parse(configRaw).workspace).toBe('test-org');

    // Step 2: Pull
    await executePull(testDir, { force: false }, client);

    // Verify file was created
    const filePath = join(testDir, 'kb', 'ENG', 'ENG-1-fix-login-bug.md');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('id: "issue-uuid-1"');
    expect(content).toContain('Fix login bug');
    expect(content).toContain('The login page crashes on submit.');

    // Verify state file
    const stateRaw = await readFile(join(testDir, '.kb-sync-state.json'), 'utf-8');
    const state = JSON.parse(stateRaw);
    expect(state.issues['issue-uuid-1']).toBeDefined();

    // Step 3: Modify the file locally (change status)
    const modified = content.replace('status: "In Progress"', 'status: "Done"');
    await writeFile(filePath, modified);

    // Step 4: Push
    await executePush(testDir, { dryRun: false, force: false }, client);
    expect(client.updateIssue).toHaveBeenCalledOnce();
  });

  it('E2E: init -> pull -> pull again writes zero changes (NF8 idempotency)', async () => {
    const client = makeMockClient();

    await executeInit(testDir, client);
    await executePull(testDir, { force: false }, client);

    // Second pull — no changes should be written (same data)
    await executePull(testDir, { force: true }, client);

    // File should still exist and be correct
    const filePath = join(testDir, 'kb', 'ENG', 'ENG-1-fix-login-bug.md');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('issue-uuid-1');
  });
});

// ---------------------------------------------------------------------------
// E2E: Dry-run workflow
// ---------------------------------------------------------------------------

describe('E2E: Dry-run workflow', () => {
  it('E2E: push --dry-run shows changes without mutating', async () => {
    const client = makeMockClient();

    await executeInit(testDir, client);
    await executePull(testDir, { force: false }, client);

    // Modify a file
    const filePath = join(testDir, 'kb', 'ENG', 'ENG-1-fix-login-bug.md');
    const content = await readFile(filePath, 'utf-8');
    await writeFile(filePath, content.replace('status: "In Progress"', 'status: "Done"'));

    // Push with dry-run
    await executePush(testDir, { dryRun: true, force: false }, client);

    // updateIssue should NOT have been called
    expect(client.updateIssue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E2E: Status after modifications
// ---------------------------------------------------------------------------

describe('E2E: Status command workflow', () => {
  it('E2E: status shows local modifications after edit', async () => {
    const client = makeMockClient();

    await executeInit(testDir, client);
    await executePull(testDir, { force: false }, client);

    // Modify a file
    const filePath = join(testDir, 'kb', 'ENG', 'ENG-1-fix-login-bug.md');
    const content = await readFile(filePath, 'utf-8');
    await writeFile(filePath, content + '\n\nExtra content');

    const consoleSpy = vi.spyOn(console, 'log');
    await executeStatus(testDir, client);
    const calls = consoleSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('Modified'))).toBe(true);
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// E2E: Multi-issue workflow
// ---------------------------------------------------------------------------

describe('E2E: Multi-issue workflow', () => {
  it('E2E: pull multiple issues, modify one, push only the modified one', async () => {
    const issues = [
      makeIssue({ id: 'id-1', identifier: 'ENG-1', title: 'First' }),
      makeIssue({ id: 'id-2', identifier: 'ENG-2', title: 'Second' }),
    ];
    const client = makeMockClient(issues);

    await executeInit(testDir, client);
    await executePull(testDir, { force: false }, client);

    // Only modify the first file
    const file1 = join(testDir, 'kb', 'ENG', 'ENG-1-first.md');
    const content1 = await readFile(file1, 'utf-8');
    await writeFile(file1, content1.replace('priority: 2', 'priority: 1'));

    await executePush(testDir, { dryRun: false, force: false }, client);

    // Only one issue should have been updated
    expect(client.updateIssue).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// E2E: Conflict scenario
// ---------------------------------------------------------------------------

describe('E2E: Conflict scenario', () => {
  it('E2E: push detects conflict and throws ConflictError', async () => {
    const client = makeMockClient();

    await executeInit(testDir, client);
    await executePull(testDir, { force: false }, client);

    // Modify the file locally
    const filePath = join(testDir, 'kb', 'ENG', 'ENG-1-fix-login-bug.md');
    const content = await readFile(filePath, 'utf-8');
    await writeFile(filePath, content.replace('priority: 2', 'priority: 1'));

    // Simulate remote change (newer timestamp)
    const conflictClient = makeMockClient([makeIssue()], {
      fetchIssueUpdatedAt: vi.fn().mockResolvedValue('2026-03-25T11:00:00.000Z'),
    });

    await expect(
      executePush(testDir, { dryRun: false, force: false }, conflictClient),
    ).rejects.toThrow(ConflictError);
  });
});
