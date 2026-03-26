// Tests for src/fs/reader.ts — markdown file parsing

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readMarkdownFile, parseMarkdownContent } from '../../src/fs/reader.js';
import { FileSystemError } from '../../src/errors.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-reader-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

const SAMPLE_MD = `---
id: "abc-123"
identifier: "ENG-123"
title: "Fix login bug"
status: "In Progress"
priority: 2
assignee: "Alice Smith"
labels: ["bug", "urgent"]
team: "Engineering"
project: "Q1 Sprint"
url: "https://linear.app/test/issue/ENG-123"
createdAt: "2026-03-20T09:00:00.000Z"
updatedAt: "2026-03-25T10:00:00.000Z"
---

The login page crashes on submit.`;

describe('P4: Extra frontmatter preservation', () => {
  it('P4: separates standard fields from extra user fields', () => {
    const content = SAMPLE_MD.replace('---\n\n', 'notes: "my annotation"\ncustomTag: "foo"\n---\n\n');
    const issue = parseMarkdownContent(content);
    expect(issue.extraFields['notes']).toBe('my annotation');
    expect(issue.extraFields['customTag']).toBe('foo');
    // Standard fields not in extraFields
    expect(issue.extraFields['id']).toBeUndefined();
    expect(issue.extraFields['title']).toBeUndefined();
  });

  it('P4: empty extra fields when no custom fields present', () => {
    const issue = parseMarkdownContent(SAMPLE_MD);
    expect(Object.keys(issue.extraFields)).toHaveLength(0);
  });
});

describe('Markdown parsing', () => {
  it('parses all standard frontmatter fields', () => {
    const issue = parseMarkdownContent(SAMPLE_MD);
    expect(issue.id).toBe('abc-123');
    expect(issue.identifier).toBe('ENG-123');
    expect(issue.title).toBe('Fix login bug');
    expect(issue.status).toBe('In Progress');
    expect(issue.priority).toBe(2);
    expect(issue.assignee).toBe('Alice Smith');
    expect(issue.labels).toEqual(['bug', 'urgent']);
    expect(issue.team).toBe('Engineering');
    expect(issue.project).toBe('Q1 Sprint');
    expect(issue.url).toBe('https://linear.app/test/issue/ENG-123');
    expect(issue.body).toBe('The login page crashes on submit.');
  });

  it('handles null assignee', () => {
    const content = SAMPLE_MD.replace('assignee: "Alice Smith"', 'assignee: null');
    const issue = parseMarkdownContent(content);
    expect(issue.assignee).toBeNull();
  });

  it('handles empty labels array', () => {
    const content = SAMPLE_MD.replace('labels: ["bug", "urgent"]', 'labels: []');
    const issue = parseMarkdownContent(content);
    expect(issue.labels).toEqual([]);
  });
});

describe('T1: Issue with no description', () => {
  it('T1: empty body when no content after frontmatter', () => {
    const content = `---
id: "abc"
identifier: "ENG-1"
title: "No desc"
status: "Todo"
priority: 0
assignee: null
labels: []
team: "ENG"
project: null
url: "https://linear.app/x/1"
createdAt: "2026-01-01T00:00:00Z"
updatedAt: "2026-01-01T00:00:00Z"
---
`;
    const issue = parseMarkdownContent(content);
    expect(issue.body).toBe('');
  });
});

describe('readMarkdownFile', () => {
  it('reads and parses a file from disk', async () => {
    const filePath = join(testDir, 'test.md');
    await writeFile(filePath, SAMPLE_MD);
    const issue = await readMarkdownFile(filePath);
    expect(issue.id).toBe('abc-123');
    expect(issue.title).toBe('Fix login bug');
  });

  it('throws FileSystemError for non-existent file', async () => {
    await expect(readMarkdownFile(join(testDir, 'nope.md'))).rejects.toThrow(FileSystemError);
  });
});
