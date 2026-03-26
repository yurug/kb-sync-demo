import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { issueToMarkdown, writeIssueFile, readIssueFiles } from '../src/markdown.js';
import { IssueFrontmatter } from '../src/types.js';

const sampleFrontmatter: IssueFrontmatter = {
  id: 'issue-123',
  title: 'Fix login bug',
  status: 'In Progress',
  priority: 2,
  assignee: 'Alice',
  labels: ['bug', 'auth'],
  updatedAt: '2024-01-15T10:00:00.000Z',
  createdAt: '2024-01-10T08:00:00.000Z',
  url: 'https://linear.app/team/issue/ABC-123',
};

describe('markdown', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'kb-sync-md-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('issueToMarkdown', () => {
    it('should generate valid frontmatter markdown', () => {
      const md = issueToMarkdown(sampleFrontmatter, 'Some description');
      expect(md).toContain('---');
      expect(md).toContain('title: Fix login bug');
      expect(md).toContain('id: issue-123');
      expect(md).toContain('Some description');
    });

    it('should work with empty body', () => {
      const md = issueToMarkdown(sampleFrontmatter);
      expect(md).toContain('---');
      expect(md).toContain('title: Fix login bug');
    });
  });

  describe('writeIssueFile / readIssueFiles', () => {
    it('should write and read back an issue file', async () => {
      const kbDir = join(tempDir, 'kb');
      await writeIssueFile(kbDir, sampleFrontmatter, 'Bug description here');

      const issues = await readIssueFiles(kbDir);
      expect(issues).toHaveLength(1);
      expect(issues[0].frontmatter.id).toBe('issue-123');
      expect(issues[0].frontmatter.title).toBe('Fix login bug');
      expect(issues[0].content).toBe('Bug description here');
    });

    it('should create the kb directory if it does not exist', async () => {
      const kbDir = join(tempDir, 'nested', 'kb');
      await writeIssueFile(kbDir, sampleFrontmatter);

      const issues = await readIssueFiles(kbDir);
      expect(issues).toHaveLength(1);
    });

    it('should return empty array for non-existent directory', async () => {
      const issues = await readIssueFiles(join(tempDir, 'nope'));
      expect(issues).toEqual([]);
    });

    it('should slugify the filename', async () => {
      const kbDir = join(tempDir, 'kb');
      const filePath = await writeIssueFile(kbDir, sampleFrontmatter);
      expect(filePath).toContain('fix-login-bug.md');
    });
  });
});
