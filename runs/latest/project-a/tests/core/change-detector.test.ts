// Tests for src/core/change-detector.ts — local modification detection

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findModifiedFiles } from '../../src/core/change-detector.js';
import { hashContent } from '../../src/core/hasher.js';
import type { SyncState } from '../../src/types.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-cd-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

async function writeIssueFile(dir: string, filename: string, id: string, body: string = 'Body'): Promise<string> {
  const subdir = join(dir, 'ENG');
  await mkdir(subdir, { recursive: true });
  const content = `---\nid: "${id}"\nidentifier: "ENG-1"\ntitle: "Test"\nstatus: "Done"\npriority: 1\nassignee: null\nlabels: []\nteam: "Engineering"\nproject: null\nurl: ""\ncreatedAt: ""\nupdatedAt: ""\n---\n\n${body}\n`;
  await writeFile(join(subdir, filename), content);
  return content;
}

describe('findModifiedFiles', () => {
  it('detects files with changed hashes', async () => {
    const kbDir = testDir;
    const content = await writeIssueFile(kbDir, 'ENG-1-test.md', 'issue-1');
    const oldHash = hashContent('something different');
    const state: SyncState = {
      issues: { 'issue-1': { updatedAt: '2026-01-01', contentHash: oldHash } },
    };
    const modified = await findModifiedFiles(kbDir, state);
    expect(modified.length).toBe(1);
    expect(modified[0].issue.id).toBe('issue-1');
  });

  it('skips files with matching hashes (no modification)', async () => {
    const kbDir = testDir;
    const content = await writeIssueFile(kbDir, 'ENG-1-test.md', 'issue-1');
    const state: SyncState = {
      issues: { 'issue-1': { updatedAt: '2026-01-01', contentHash: hashContent(content) } },
    };
    const modified = await findModifiedFiles(kbDir, state);
    expect(modified.length).toBe(0);
  });

  it('T7: skips files without id field', async () => {
    const subdir = join(testDir, 'ENG');
    await mkdir(subdir, { recursive: true });
    await writeFile(join(subdir, 'no-id.md'), '---\ntitle: "No ID"\n---\nBody\n');
    const state: SyncState = { issues: {} };
    const modified = await findModifiedFiles(testDir, state);
    expect(modified.length).toBe(0);
  });

  it('skips files not tracked in state', async () => {
    await writeIssueFile(testDir, 'new.md', 'new-issue');
    const state: SyncState = { issues: {} };
    const modified = await findModifiedFiles(testDir, state);
    expect(modified.length).toBe(0);
  });

  it('filters to specific target files', async () => {
    const kbDir = testDir;
    await writeIssueFile(kbDir, 'ENG-1.md', 'issue-1');
    await writeIssueFile(kbDir, 'ENG-2.md', 'issue-2');
    const state: SyncState = {
      issues: {
        'issue-1': { updatedAt: 'x', contentHash: 'old' },
        'issue-2': { updatedAt: 'x', contentHash: 'old' },
      },
    };
    const modified = await findModifiedFiles(kbDir, state, [join(kbDir, 'ENG', 'ENG-1.md')]);
    expect(modified.length).toBe(1);
    expect(modified[0].issue.id).toBe('issue-1');
  });
});
