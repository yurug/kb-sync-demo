// Performance benchmark tests for NF1 and NF2 from kb/properties/non-functional.md
// NF1: Pull 500 issues in under 5 minutes
// NF2: Push 10 issues in under 30 seconds
//
// These tests use mocked Linear API to benchmark the local processing
// pipeline (mapping, serialization, file I/O) without real network latency.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executePull } from '../src/commands/pull.js';
import { executePush } from '../src/commands/push.js';
import { writeConfig } from '../src/core/config.js';
import { writeState } from '../src/core/state.js';
import { writeMarkdownFile } from '../src/fs/writer.js';
import { linearToMarkdown } from '../src/core/mapper.js';
import { hashContent } from '../src/core/hasher.js';
import type { LinearClientInterface } from '../src/linear/types.js';
import type { LinearIssue, ReferenceData, SyncState } from '../src/types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-perf-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['team-1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map([['user-1', 'Alice']]),
    states: new Map([['state-1', 'In Progress'], ['state-2', 'Done']]),
    labels: new Map([['label-1', 'bug']]),
    projects: new Map(),
  };
}

function makeIssue(i: number): LinearIssue {
  return {
    id: `uuid-${i}`,
    identifier: `ENG-${i}`,
    title: `Issue number ${i} with a reasonably long title for realism`,
    description: `This is the description for issue ${i}.\n\n`.repeat(5),
    priority: i % 5,
    statusName: 'In Progress',
    assigneeName: 'Alice',
    labelNames: ['bug'],
    teamKey: 'ENG',
    teamName: 'Engineering',
    projectName: null,
    url: `https://linear.app/ENG-${i}`,
    createdAt: '2026-03-20T09:00:00.000Z',
    updatedAt: '2026-03-25T10:00:00.000Z',
  };
}

function makeMockClient(issues: LinearIssue[]): LinearClientInterface {
  return {
    getViewer: async () => ({ id: 'v1', name: 'Test' }),
    getOrganization: async () => ({ id: 'org-1', name: 'TestOrg', urlKey: 'test-org' }),
    fetchReferenceData: async () => makeRefData(),
    fetchIssues: async () => [issues, true],
    fetchAllIssueIds: async () => issues.map((i) => i.id),
    fetchIssueTimestamps: async () =>
      issues.map((i) => ({ id: i.id, identifier: i.identifier, updatedAt: i.updatedAt })),
    fetchIssueUpdatedAt: async () => '2026-03-25T10:00:00.000Z',
    updateIssue: async () => new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// NF1: Pull performance — 500 issues under 5 minutes
// ---------------------------------------------------------------------------

describe('NF1: Pull performance', () => {
  it('NF1: pulls 500 issues within 60 seconds (mocked API)', async () => {
    // Generate 500 mock issues
    const issues = Array.from({ length: 500 }, (_, i) => makeIssue(i));
    const client = makeMockClient(issues);

    // Write config for the test directory
    await writeConfig(testDir, {
      version: 1,
      kbDir: './kb',
      workspace: 'test-org',
      lastSyncedAt: null,
    });

    const start = performance.now();
    await executePull(testDir, { force: false }, client);
    const elapsed = performance.now() - start;

    // Verify files were written
    const kbDir = join(testDir, 'kb', 'ENG');
    const files = await readdir(kbDir);
    expect(files.length).toBe(500);

    // Performance threshold: local processing should complete well under 60s
    // (The 5-min NF1 budget includes real API latency; local should be fast)
    expect(elapsed).toBeLessThan(60_000);
    console.log(`NF1 benchmark: 500 issues pulled in ${(elapsed / 1000).toFixed(2)}s`);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// NF2: Push performance — 10 issues under 30 seconds
// ---------------------------------------------------------------------------

describe('NF2: Push performance', () => {
  it('NF2: pushes 10 modified issues within 10 seconds (mocked API)', async () => {
    const issues = Array.from({ length: 10 }, (_, i) => makeIssue(i));
    const client = makeMockClient(issues);

    // Set up config and state as if we already pulled
    await writeConfig(testDir, {
      version: 1,
      kbDir: './kb',
      workspace: 'test-org',
      lastSyncedAt: '2026-03-25T09:00:00.000Z',
    });

    // Write initial files and build state
    const state: SyncState = { issues: {} };
    for (const issue of issues) {
      const md = linearToMarkdown(issue);
      const filePath = join(testDir, 'kb', 'ENG', `${issue.identifier}-issue-number-${issue.identifier.toLowerCase().replace('eng-', '')}-with-a-reasonably-long-title-for-realism.md`);
      const content = await writeMarkdownFile(filePath, md);
      // Store an OLD hash so files appear modified
      state.issues[issue.id] = {
        updatedAt: issue.updatedAt,
        contentHash: hashContent(content + 'old'),
      };
    }
    await writeState(testDir, state);

    const start = performance.now();
    await executePush(testDir, { dryRun: false, force: true }, client);
    const elapsed = performance.now() - start;

    // Performance threshold: local processing should be well under 10s
    expect(elapsed).toBeLessThan(10_000);
    console.log(`NF2 benchmark: 10 issues pushed in ${(elapsed / 1000).toFixed(2)}s`);
  }, 30_000);
});
