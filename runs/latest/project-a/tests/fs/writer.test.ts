// Tests for src/fs/writer.ts — markdown file serialization and writing

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeMarkdownFile, serializeMarkdownIssue, moveToTrash } from '../../src/fs/writer.js';
import type { MarkdownIssue } from '../../src/types.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-writer-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

function makeIssue(overrides: Partial<MarkdownIssue> = {}): MarkdownIssue {
  return {
    id: 'abc-123',
    identifier: 'ENG-123',
    title: 'Fix login bug',
    status: 'In Progress',
    priority: 2,
    assignee: 'Alice Smith',
    labels: ['bug', 'urgent'],
    team: 'Engineering',
    project: 'Q1 Sprint',
    url: 'https://linear.app/test/issue/ENG-123',
    createdAt: '2026-03-20T09:00:00.000Z',
    updatedAt: '2026-03-25T10:00:00.000Z',
    body: 'The login page crashes on submit.',
    extraFields: {},
    ...overrides,
  };
}

describe('P1: Canonical frontmatter field order', () => {
  it('P1: fields are written in canonical order', () => {
    const content = serializeMarkdownIssue(makeIssue());
    const lines = content.split('\n');
    // First line is ---
    expect(lines[0]).toBe('---');
    expect(lines[1]).toMatch(/^id:/);
    expect(lines[2]).toMatch(/^identifier:/);
    expect(lines[3]).toMatch(/^title:/);
    expect(lines[4]).toMatch(/^status:/);
    expect(lines[5]).toMatch(/^priority:/);
    expect(lines[6]).toMatch(/^assignee:/);
    expect(lines[7]).toMatch(/^labels:/);
    expect(lines[8]).toMatch(/^team:/);
    expect(lines[9]).toMatch(/^project:/);
    expect(lines[10]).toMatch(/^url:/);
    expect(lines[11]).toMatch(/^createdAt:/);
    expect(lines[12]).toMatch(/^updatedAt:/);
    expect(lines[13]).toBe('---');
  });

  it('P1: priority is serialized as number, not string', () => {
    const content = serializeMarkdownIssue(makeIssue());
    expect(content).toContain('priority: 2');
    // Should not be quoted
    expect(content).not.toContain('priority: "2"');
  });
});

describe('P4: Extra fields appended after standard', () => {
  it('P4: extra fields are placed after standard fields', () => {
    const issue = makeIssue({ extraFields: { notes: 'annotation', zzz: 'last' } });
    const content = serializeMarkdownIssue(issue);
    const lines = content.split('\n');
    // Extra fields come after updatedAt (line 12) but before closing ---
    const notesIdx = lines.findIndex(l => l.startsWith('notes:'));
    const updatedIdx = lines.findIndex(l => l.startsWith('updatedAt:'));
    const closeIdx = lines.indexOf('---', 1);
    expect(notesIdx).toBeGreaterThan(updatedIdx);
    expect(notesIdx).toBeLessThan(closeIdx);
  });

  it('P4: extra fields are sorted alphabetically', () => {
    const issue = makeIssue({ extraFields: { zzz: 'z', aaa: 'a', mmm: 'm' } });
    const content = serializeMarkdownIssue(issue);
    const lines = content.split('\n');
    const aaaIdx = lines.findIndex(l => l.startsWith('aaa:'));
    const mmmIdx = lines.findIndex(l => l.startsWith('mmm:'));
    const zzzIdx = lines.findIndex(l => l.startsWith('zzz:'));
    expect(aaaIdx).toBeLessThan(mmmIdx);
    expect(mmmIdx).toBeLessThan(zzzIdx);
  });
});

describe('T1: Issue with no description', () => {
  it('T1: empty body produces frontmatter-only file', () => {
    const content = serializeMarkdownIssue(makeIssue({ body: '' }));
    // Should end with closing --- and newline
    expect(content.trimEnd()).toMatch(/---$/);
    // No blank line with body content
    const lines = content.split('\n');
    const closingIdx = lines.indexOf('---', 1);
    // After closing ---, there should be nothing (just trailing newline)
    expect(lines.slice(closingIdx + 1).filter(l => l.length > 0)).toHaveLength(0);
  });
});

describe('Serialization details', () => {
  it('null values serialize as "null"', () => {
    const content = serializeMarkdownIssue(makeIssue({ assignee: null }));
    expect(content).toContain('assignee: null');
  });

  it('arrays serialize in YAML flow style', () => {
    const content = serializeMarkdownIssue(makeIssue({ labels: ['bug', 'urgent'] }));
    expect(content).toContain('labels: ["bug", "urgent"]');
  });

  it('empty arrays serialize as []', () => {
    const content = serializeMarkdownIssue(makeIssue({ labels: [] }));
    expect(content).toContain('labels: []');
  });

  it('file ends with trailing newline', () => {
    const content = serializeMarkdownIssue(makeIssue());
    expect(content.endsWith('\n')).toBe(true);
  });
});

describe('writeMarkdownFile', () => {
  it('creates file and parent directories', async () => {
    const filePath = join(testDir, 'kb', 'ENG', 'ENG-123-fix.md');
    await writeMarkdownFile(filePath, makeIssue());
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('id: "abc-123"');
    expect(content).toContain('The login page crashes on submit.');
  });

  it('returns the written content', async () => {
    const filePath = join(testDir, 'test.md');
    const content = await writeMarkdownFile(filePath, makeIssue());
    expect(content).toContain('id: "abc-123"');
  });
});

describe('P2: moveToTrash (soft delete)', () => {
  it('P2/P10: moves file to trash directory', async () => {
    const { writeFile: wf } = await import('node:fs/promises');
    const filePath = join(testDir, 'file.md');
    await wf(filePath, 'content');

    const trashDir = join(testDir, '.kb-sync-trash');
    await moveToTrash(filePath, trashDir);

    // Original file is gone
    const { access } = await import('node:fs/promises');
    await expect(access(filePath)).rejects.toThrow();

    // File is in trash
    const trashContent = await readFile(join(trashDir, 'file.md'), 'utf-8');
    expect(trashContent).toBe('content');
  });
});
