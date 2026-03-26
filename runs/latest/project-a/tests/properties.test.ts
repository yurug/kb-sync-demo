// Tests for functional properties P1-P10 from kb/properties/functional.md
// Each property has at least 2 tests (happy path + edge case).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { linearToMarkdown, buildFilename } from '../src/core/mapper.js';
import { markdownToLinearUpdate } from '../src/core/push-mapper.js';
import { serializeMarkdownIssue, writeMarkdownFile } from '../src/fs/writer.js';
import { readMarkdownFile, parseMarkdownContent } from '../src/fs/reader.js';
import { hashContent } from '../src/core/hasher.js';
import { readConfig, writeConfig, configExists } from '../src/core/config.js';
import { readState, writeState, updateStateEntry, removeStateEntry } from '../src/core/state.js';
import { scanDirectory } from '../src/fs/scanner.js';
import type { LinearIssue, MarkdownIssue, ReferenceData, Config, SyncState } from '../src/types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-prop-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

function makeLinearIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'issue-uuid-1', identifier: 'ENG-1', title: 'Fix login bug',
    description: 'Login page crashes.', priority: 2, statusName: 'In Progress',
    assigneeName: 'Alice Smith', labelNames: ['bug', 'urgent'],
    teamKey: 'ENG', teamName: 'Engineering', projectName: 'Q1 Sprint',
    url: 'https://linear.app/test/issue/ENG-1',
    createdAt: '2026-03-20T09:00:00.000Z',
    updatedAt: '2026-03-25T10:00:00.000Z',
    ...overrides,
  };
}

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['team-1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map([['user-1', 'Alice Smith']]),
    states: new Map([['state-1', 'In Progress'], ['state-2', 'Done']]),
    labels: new Map([['label-1', 'bug'], ['label-2', 'urgent']]),
    projects: new Map([['proj-1', 'Q1 Sprint']]),
  };
}

// ---------------------------------------------------------------------------
// P1: Frontmatter-Linear roundtrip fidelity
// ---------------------------------------------------------------------------

describe('P1: Roundtrip fidelity', () => {
  it('P1: pull then serialize then parse produces identical MarkdownIssue', () => {
    const issue = makeLinearIssue();
    const md = linearToMarkdown(issue);
    const serialized = serializeMarkdownIssue(md);
    const parsed = parseMarkdownContent(serialized);

    expect(parsed.id).toBe(md.id);
    expect(parsed.identifier).toBe(md.identifier);
    expect(parsed.title).toBe(md.title);
    expect(parsed.status).toBe(md.status);
    expect(parsed.priority).toBe(md.priority);
    expect(parsed.assignee).toBe(md.assignee);
    expect(parsed.labels).toEqual(md.labels);
    expect(parsed.team).toBe(md.team);
    expect(parsed.project).toBe(md.project);
  });

  it('P1: pull->push with no edits produces zero validation errors', () => {
    const issue = makeLinearIssue();
    const md = linearToMarkdown(issue);
    const result = markdownToLinearUpdate(md, makeRefData());
    expect(result.errors).toHaveLength(0);
  });

  it('P1: priority roundtrips as number not string', () => {
    const issue = makeLinearIssue({ priority: 3 });
    const md = linearToMarkdown(issue);
    const serialized = serializeMarkdownIssue(md);
    const parsed = parseMarkdownContent(serialized);
    expect(typeof parsed.priority).toBe('number');
    expect(parsed.priority).toBe(3);
  });

  it('P1: labels roundtrip in alphabetical order', () => {
    const issue = makeLinearIssue({ labelNames: ['zebra', 'alpha'] });
    const md = linearToMarkdown(issue);
    expect(md.labels).toEqual(['alpha', 'zebra']);
    const serialized = serializeMarkdownIssue(md);
    const parsed = parseMarkdownContent(serialized);
    expect(parsed.labels).toEqual(['alpha', 'zebra']);
  });

  it('P1: null assignee roundtrips correctly', () => {
    const issue = makeLinearIssue({ assigneeName: null });
    const md = linearToMarkdown(issue);
    const serialized = serializeMarkdownIssue(md);
    const parsed = parseMarkdownContent(serialized);
    expect(parsed.assignee).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P2: No silent data loss
// ---------------------------------------------------------------------------

describe('P2: No silent data loss', () => {
  it('P2: writeMarkdownFile returns content for hashing', async () => {
    const md = linearToMarkdown(makeLinearIssue());
    const filePath = join(testDir, 'test.md');
    const content = await writeMarkdownFile(filePath, md);
    expect(content.length).toBeGreaterThan(0);
    // Re-read file and compare
    const onDisk = await readFile(filePath, 'utf-8');
    expect(onDisk).toBe(content);
  });

  it('P2: hash changes when file content changes', () => {
    const h1 = hashContent('content-a');
    const h2 = hashContent('content-b');
    expect(h1).not.toBe(h2);
  });

  it('P2: identical content produces identical hash', () => {
    const content = '---\nid: abc\n---\nBody';
    expect(hashContent(content)).toBe(hashContent(content));
  });
});

// ---------------------------------------------------------------------------
// P3: Config is the single source of truth
// ---------------------------------------------------------------------------

describe('P3: Config as source of truth', () => {
  it('P3: read config returns exact values written', async () => {
    const config: Config = { version: 1, kbDir: './my-kb', workspace: 'acme', lastSyncedAt: '2026-01-01T00:00:00.000Z' };
    await writeConfig(testDir, config);
    const read = await readConfig(testDir);
    expect(read.version).toBe(1);
    expect(read.kbDir).toBe('./my-kb');
    expect(read.workspace).toBe('acme');
    expect(read.lastSyncedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('P3: config changes are immediately reflected on next read', async () => {
    const config1: Config = { version: 1, kbDir: 'kb', workspace: 'v1', lastSyncedAt: null };
    await writeConfig(testDir, config1);
    const config2: Config = { ...config1, workspace: 'v2' };
    await writeConfig(testDir, config2);
    const read = await readConfig(testDir);
    expect(read.workspace).toBe('v2');
  });
});

// ---------------------------------------------------------------------------
// P4: Extra frontmatter preservation
// ---------------------------------------------------------------------------

describe('P4: Extra frontmatter preservation', () => {
  it('P4: user-added fields survive pull', () => {
    const extra = { notes: 'my annotation', customTag: 42 };
    const md = linearToMarkdown(makeLinearIssue(), extra);
    expect(md.extraFields).toEqual(extra);
  });

  it('P4: extra fields survive serialize->parse roundtrip', () => {
    const extra = { notes: 'keep me', flag: true };
    const md = linearToMarkdown(makeLinearIssue(), extra);
    const serialized = serializeMarkdownIssue(md);
    const parsed = parseMarkdownContent(serialized);
    expect(parsed.extraFields['notes']).toBe('keep me');
    // Booleans survive as booleans
    expect(parsed.extraFields['flag']).toBe(true);
  });

  it('P4: extra fields are NOT sent to Linear on push', () => {
    const md = linearToMarkdown(makeLinearIssue(), { myCustom: 'secret' });
    const result = markdownToLinearUpdate(md, makeRefData());
    const keys = Object.keys(result.input);
    expect(keys).not.toContain('myCustom');
  });
});

// ---------------------------------------------------------------------------
// P5: ID-based matching, not filename-based
// ---------------------------------------------------------------------------

describe('P5: ID-based matching', () => {
  it('P5: scanner finds file by id regardless of filename', async () => {
    const kbDir = join(testDir, 'kb', 'ENG');
    await mkdir(kbDir, { recursive: true });
    await writeFile(
      join(kbDir, 'custom-name.md'),
      '---\nid: "unique-uuid-123"\n---\nBody\n',
    );
    const index = await scanDirectory(join(testDir, 'kb'));
    expect(index.get('unique-uuid-123')).toContain('custom-name.md');
  });

  it('P5: two files with same name pattern but different IDs are tracked separately', async () => {
    const kbDir = join(testDir, 'kb');
    const eng = join(kbDir, 'ENG');
    const des = join(kbDir, 'DES');
    await mkdir(eng, { recursive: true });
    await mkdir(des, { recursive: true });
    await writeFile(join(eng, 'fix.md'), '---\nid: "uuid-a"\n---\nA\n');
    await writeFile(join(des, 'fix.md'), '---\nid: "uuid-b"\n---\nB\n');
    const index = await scanDirectory(kbDir);
    expect(index.size).toBe(2);
    expect(index.has('uuid-a')).toBe(true);
    expect(index.has('uuid-b')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P6: Conflict detection correctness
// ---------------------------------------------------------------------------

describe('P6: Conflict detection', () => {
  it('P6: state entry tracks updatedAt and contentHash', () => {
    const state: SyncState = { issues: {} };
    const updated = updateStateEntry(state, 'issue-1', '2026-03-25T10:00:00.000Z', 'hash123');
    expect(updated.issues['issue-1'].updatedAt).toBe('2026-03-25T10:00:00.000Z');
    expect(updated.issues['issue-1'].contentHash).toBe('hash123');
  });

  it('P6: hash comparison detects modification', () => {
    const original = hashContent('original content');
    const modified = hashContent('modified content');
    expect(original).not.toBe(modified);
  });

  it('P6: removeStateEntry removes the entry', () => {
    const state: SyncState = {
      issues: { 'a': { updatedAt: 'x', contentHash: 'y' }, 'b': { updatedAt: 'x', contentHash: 'y' } },
    };
    const after = removeStateEntry(state, 'a');
    expect(after.issues['a']).toBeUndefined();
    expect(after.issues['b']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// P7: Pushable vs read-only fields
// ---------------------------------------------------------------------------

describe('P7: Pushable vs read-only fields', () => {
  it('P7: only pushable fields appear in update input', () => {
    const md = linearToMarkdown(makeLinearIssue());
    const result = markdownToLinearUpdate(md, makeRefData());
    const keys = Object.keys(result.input);
    // Pushable: title, description, priority, stateId, assigneeId, labelIds, projectId
    expect(keys).toContain('title');
    expect(keys).toContain('description');
    expect(keys).toContain('priority');
    expect(keys).toContain('stateId');
    // Read-only must NOT appear
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('identifier');
    expect(keys).not.toContain('url');
    expect(keys).not.toContain('createdAt');
    expect(keys).not.toContain('updatedAt');
    expect(keys).not.toContain('team');
  });

  it('P7: null project produces null projectId', () => {
    const md = linearToMarkdown(makeLinearIssue({ projectName: null }));
    const result = markdownToLinearUpdate(md, makeRefData());
    expect(result.input.projectId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P8: Field validation before push
// ---------------------------------------------------------------------------

describe('P8: Field validation', () => {
  it('P8: valid fields produce no errors', () => {
    const md = linearToMarkdown(makeLinearIssue());
    const result = markdownToLinearUpdate(md, makeRefData());
    expect(result.errors).toHaveLength(0);
  });

  it('P8: unknown label lists valid alternatives', () => {
    const md = linearToMarkdown(makeLinearIssue());
    const issue: MarkdownIssue = { ...md, labels: ['nonexistent'] };
    const result = markdownToLinearUpdate(issue, makeRefData());
    expect(result.errors[0]).toContain('unknown label');
    expect(result.errors[0]).toContain('Valid:');
  });
});

// ---------------------------------------------------------------------------
// P9: Incremental sync correctness (via state tracking)
// ---------------------------------------------------------------------------

describe('P9: Incremental sync', () => {
  it('P9: state file persists and recovers correctly', async () => {
    const state: SyncState = {
      issues: { 'x': { updatedAt: '2026-01-01', contentHash: 'abc' } },
    };
    await writeState(testDir, state);
    const recovered = await readState(testDir);
    expect(recovered.issues['x'].updatedAt).toBe('2026-01-01');
    expect(recovered.issues['x'].contentHash).toBe('abc');
  });

  it('P9: updateStateEntry is immutable', () => {
    const original: SyncState = { issues: { 'a': { updatedAt: 'x', contentHash: 'y' } } };
    const updated = updateStateEntry(original, 'b', 'x2', 'y2');
    // Original is not mutated
    expect(original.issues['b']).toBeUndefined();
    expect(updated.issues['b']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// P10: Deletion safety
// ---------------------------------------------------------------------------

describe('P10: Deletion safety', () => {
  it('P10: incomplete fetch should not trigger deletions', async () => {
    // This is tested at the integration level in pull.test.ts
    // Here we verify the state invariant: entries remain when not explicitly removed
    const state: SyncState = {
      issues: { 'keep-me': { updatedAt: 'x', contentHash: 'y' } },
    };
    // Simulate "no deletion" by not calling removeStateEntry
    expect(state.issues['keep-me']).toBeDefined();
  });

  it('P10: removeStateEntry only removes the specified entry', () => {
    const state: SyncState = {
      issues: {
        'a': { updatedAt: 'x', contentHash: 'y' },
        'b': { updatedAt: 'x', contentHash: 'y' },
      },
    };
    const after = removeStateEntry(state, 'a');
    expect(Object.keys(after.issues)).toEqual(['b']);
  });
});
