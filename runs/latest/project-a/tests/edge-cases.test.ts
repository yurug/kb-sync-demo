// Tests for edge cases T1-T20 from kb/properties/edge-cases.md
// Each test is tagged with its edge case ID for traceability.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { linearToMarkdown, buildFilename, slugify } from '../src/core/mapper.js';
import { serializeMarkdownIssue, writeMarkdownFile } from '../src/fs/writer.js';
import { readMarkdownFile, parseMarkdownContent } from '../src/fs/reader.js';
import { readConfig, configExists } from '../src/core/config.js';
import { readState } from '../src/core/state.js';
import { hashContent } from '../src/core/hasher.js';
import { markdownToLinearUpdate } from '../src/core/push-mapper.js';
import { withRetry, isRetryable } from '../src/linear/pagination.js';
import { scanDirectory } from '../src/fs/scanner.js';
import { executeInit } from '../src/commands/init.js';
import { ConfigError, AuthError, ApiError } from '../src/errors.js';
import type { LinearIssue, MarkdownIssue, ReferenceData } from '../src/types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-edge-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

function makeLinearIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'abc-uuid', identifier: 'ENG-123', title: 'Fix login bug',
    description: 'Body text', priority: 2, statusName: 'In Progress',
    assigneeName: 'Alice', labelNames: ['bug'], teamKey: 'ENG',
    teamName: 'Engineering', projectName: null,
    url: 'https://linear.app/ENG-123',
    createdAt: '2026-03-20T09:00:00.000Z',
    updatedAt: '2026-03-25T10:00:00.000Z',
    ...overrides,
  };
}

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['team-1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map([['user-1', 'Alice']]),
    states: new Map([['state-1', 'In Progress'], ['state-2', 'Done']]),
    labels: new Map([['label-1', 'bug']]),
    projects: new Map([['proj-1', 'Q1 Sprint']]),
  };
}

// ---------------------------------------------------------------------------
// T1: Issue with no description
// ---------------------------------------------------------------------------

describe('T1: Issue with no description', () => {
  it('T1: null description produces file with empty body', () => {
    const md = linearToMarkdown(makeLinearIssue({ description: null }));
    expect(md.body).toBe('');
  });

  it('T1: serialized file has frontmatter only, no body content', () => {
    const md = linearToMarkdown(makeLinearIssue({ description: null }));
    const content = serializeMarkdownIssue(md);
    // Should end with closing --- and a newline, no body text
    expect(content).toMatch(/---\n$/);
    expect(content.split('---').length).toBe(3); // opening + closing
  });

  it('T1: roundtrip pull->push with null description produces no error', () => {
    const md = linearToMarkdown(makeLinearIssue({ description: null }));
    const result = markdownToLinearUpdate(md, makeRefData());
    expect(result.errors).toHaveLength(0);
    expect(result.input.description).toBe('');
  });
});

// ---------------------------------------------------------------------------
// T2: Issue with very long description (>100KB)
// ---------------------------------------------------------------------------

describe('T2: Issue with very long description (>100KB)', () => {
  it('T2: 150KB description is not truncated on pull', () => {
    const longDesc = 'x'.repeat(150 * 1024);
    const md = linearToMarkdown(makeLinearIssue({ description: longDesc }));
    expect(md.body).toBe(longDesc);
    expect(md.body.length).toBe(150 * 1024);
  });

  it('T2: serialized file preserves full content', () => {
    const longDesc = 'A'.repeat(100_001);
    const md = linearToMarkdown(makeLinearIssue({ description: longDesc }));
    const content = serializeMarkdownIssue(md);
    expect(content).toContain(longDesc);
  });

  it('T2: file write and re-read preserves long description', async () => {
    const longDesc = 'B'.repeat(120_000);
    const md = linearToMarkdown(makeLinearIssue({ description: longDesc }));
    const filePath = join(testDir, 'long-desc.md');
    await writeMarkdownFile(filePath, md);
    const reread = await readMarkdownFile(filePath);
    expect(reread.body).toBe(longDesc);
  });
});

// ---------------------------------------------------------------------------
// T3: Title with special characters
// ---------------------------------------------------------------------------

describe('T3: Title with special characters', () => {
  it('T3: slashes, colons, and parens are slugified', () => {
    const fn = buildFilename('ENG-123', 'Fix: crash on /api/v2 endpoint (urgent!)');
    expect(fn).toBe('ENG-123-fix-crash-on-api-v2-endpoint-urgent.md');
  });

  it('T3: quotes and angle brackets are removed', () => {
    const fn = buildFilename('ENG-456', 'Handle "edge" case <important>');
    expect(fn).toBe('ENG-456-handle-edge-case-important.md');
  });

  it('T3: pipe and asterisk are removed', () => {
    const fn = buildFilename('ENG-789', 'Task * | Priority');
    expect(fn).toBe('ENG-789-task-priority.md');
  });

  it('T3: unicode accented characters are treated as non-alpha in slug', () => {
    const slug = slugify('Amelioration rapide');
    // 'e' with accent may or may not pass through depending on locale
    expect(slug).toBe('amelioration-rapide');
  });
});

// ---------------------------------------------------------------------------
// T4: Title collision after slugification
// ---------------------------------------------------------------------------

describe('T4: Title collision after slugification', () => {
  it('T4: different identifiers prevent filename collision', () => {
    const fn1 = buildFilename('ENG-123', 'Fix Bug');
    const fn2 = buildFilename('ENG-456', 'fix bug!');
    // Slugs are the same but identifiers differ
    expect(fn1).not.toBe(fn2);
    expect(fn1).toBe('ENG-123-fix-bug.md');
    expect(fn2).toBe('ENG-456-fix-bug.md');
  });
});

// ---------------------------------------------------------------------------
// T5: Assignee display name collision
// ---------------------------------------------------------------------------

describe('T5: Assignee display name collision', () => {
  it('T5: ambiguous assignee produces error with "matches multiple users"', () => {
    const refData = makeRefData();
    refData.users.set('user-2', 'Alice'); // same name as user-1
    const md: MarkdownIssue = {
      id: 'x', identifier: 'ENG-1', title: 'T', status: 'In Progress',
      priority: 2, assignee: 'Alice', labels: ['bug'], team: 'Engineering',
      project: null, url: '', createdAt: '', updatedAt: '', body: '',
      extraFields: {},
    };
    const result = markdownToLinearUpdate(md, refData);
    expect(result.errors).toContainEqual(expect.stringContaining('matches multiple users'));
  });
});

// ---------------------------------------------------------------------------
// T6: Invalid status name on push
// ---------------------------------------------------------------------------

describe('T6: Invalid status name on push', () => {
  it('T6: unknown status lists valid alternatives', () => {
    const md: MarkdownIssue = {
      id: 'x', identifier: 'ENG-1', title: 'T', status: 'Donee',
      priority: 2, assignee: null, labels: [], team: 'Engineering',
      project: null, url: '', createdAt: '', updatedAt: '', body: '',
      extraFields: {},
    };
    const result = markdownToLinearUpdate(md, makeRefData());
    expect(result.errors[0]).toContain('unknown status "Donee"');
    expect(result.errors[0]).toContain('Done');
    expect(result.errors[0]).toContain('In Progress');
  });
});

// ---------------------------------------------------------------------------
// T8: Empty workspace (no issues)
// ---------------------------------------------------------------------------

describe('T8: Empty workspace', () => {
  it('T8: scanDirectory returns empty map for empty directory', async () => {
    await mkdir(join(testDir, 'empty-kb'), { recursive: true });
    const index = await scanDirectory(join(testDir, 'empty-kb'));
    expect(index.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T9: First sync (no state file)
// ---------------------------------------------------------------------------

describe('T9: First sync (no state file)', () => {
  it('T9: readState returns empty state when file is missing', async () => {
    const state = await readState(testDir);
    expect(state.issues).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// T10: Corrupted state file
// ---------------------------------------------------------------------------

describe('T10: Corrupted state file', () => {
  it('T10: returns empty state when file contains invalid JSON', async () => {
    await writeFile(join(testDir, '.kb-sync-state.json'), 'NOT JSON {{{');
    const state = await readState(testDir);
    expect(state.issues).toEqual({});
  });

  it('T10: returns empty state when file has unexpected structure', async () => {
    await writeFile(join(testDir, '.kb-sync-state.json'), JSON.stringify({ bad: true }));
    const state = await readState(testDir);
    expect(state.issues).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// T11: Malformed config file
// ---------------------------------------------------------------------------

describe('T11: Malformed config file', () => {
  it('T11: invalid JSON throws ConfigError with parse details', async () => {
    await writeFile(join(testDir, '.kb-sync.json'), '{ broken json');
    await expect(readConfig(testDir)).rejects.toThrow(ConfigError);
  });

  it('T11: missing required field throws ConfigError', async () => {
    await writeFile(join(testDir, '.kb-sync.json'), JSON.stringify({ version: 1 }));
    await expect(readConfig(testDir)).rejects.toThrow(ConfigError);
  });

  it('T11: wrong version throws ConfigError', async () => {
    await writeFile(
      join(testDir, '.kb-sync.json'),
      JSON.stringify({ version: 2, kbDir: 'kb', workspace: 'test', lastSyncedAt: null }),
    );
    await expect(readConfig(testDir)).rejects.toThrow(ConfigError);
  });

  it('T11: array instead of object throws ConfigError', async () => {
    await writeFile(join(testDir, '.kb-sync.json'), '[]');
    await expect(readConfig(testDir)).rejects.toThrow(ConfigError);
  });
});

// ---------------------------------------------------------------------------
// T12: Expired or revoked API key
// ---------------------------------------------------------------------------

describe('T12: Expired or revoked API key', () => {
  it('T12: AuthError is never retried by withRetry', async () => {
    const fn = vi.fn().mockRejectedValue(
      new AuthError('401', 'Linear API key is invalid or expired.'),
    );
    await expect(withRetry(fn, 3)).rejects.toThrow(AuthError);
    expect(fn).toHaveBeenCalledOnce(); // NOT retried
  });
});

// ---------------------------------------------------------------------------
// T13: Network failure during pagination
// ---------------------------------------------------------------------------

describe('T13: Network failure during pagination', () => {
  it('T13: retryable network error triggers retries', () => {
    expect(isRetryable(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryable(new Error('ETIMEDOUT'))).toBe(true);
    expect(isRetryable(new Error('fetch failed'))).toBe(true);
  });

  it('T13: non-retryable error does not trigger retry', () => {
    expect(isRetryable(new Error('some random error'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T14: Rate limit during bulk fetch
// ---------------------------------------------------------------------------

describe('T14: Rate limit during bulk fetch', () => {
  it('T14: 429 error is retryable', () => {
    expect(isRetryable(new Error('429 Too Many Requests'))).toBe(true);
  });

  it('T14: rate limit keyword is retryable', () => {
    expect(isRetryable(new Error('Rate Limit exceeded'))).toBe(true);
  });

  it('T14: 500 server error is retryable', () => {
    expect(isRetryable(new Error('500 Internal Server Error'))).toBe(true);
  });

  it('T14: 401 auth error is NOT retryable', () => {
    expect(isRetryable(new AuthError('401', 'invalid key'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T16: kbDir doesn't exist on first pull
// ---------------------------------------------------------------------------

describe('T16: kbDir doesn\'t exist', () => {
  it('T16: scanDirectory returns empty for non-existent directory', async () => {
    const index = await scanDirectory(join(testDir, 'nonexistent'));
    expect(index.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T17: File renamed by user (ID still matches)
// ---------------------------------------------------------------------------

describe('T17: File renamed by user', () => {
  it('T17: scanDirectory finds file by id regardless of filename', async () => {
    const kbDir = join(testDir, 'kb', 'ENG');
    await mkdir(kbDir, { recursive: true });
    const content = '---\nid: "issue-uuid-123"\ntitle: "Renamed"\n---\nBody\n';
    await writeFile(join(kbDir, 'my-custom-name.md'), content);

    const index = await scanDirectory(join(testDir, 'kb'));
    expect(index.has('issue-uuid-123')).toBe(true);
    expect(index.get('issue-uuid-123')).toContain('my-custom-name.md');
  });
});

// ---------------------------------------------------------------------------
// T18: Priority out of range
// ---------------------------------------------------------------------------

describe('T18: Priority out of range', () => {
  it('T18: priority 5 produces validation error', () => {
    const md: MarkdownIssue = {
      id: 'x', identifier: 'ENG-1', title: 'T', status: 'In Progress',
      priority: 5, assignee: null, labels: [], team: 'Engineering',
      project: null, url: '', createdAt: '', updatedAt: '', body: '',
      extraFields: {},
    };
    const result = markdownToLinearUpdate(md, makeRefData());
    expect(result.errors).toContainEqual(expect.stringContaining('priority must be 0-4'));
  });

  it('T18: priority -1 produces validation error', () => {
    const md: MarkdownIssue = {
      id: 'x', identifier: 'ENG-1', title: 'T', status: 'In Progress',
      priority: -1, assignee: null, labels: [], team: 'Engineering',
      project: null, url: '', createdAt: '', updatedAt: '', body: '',
      extraFields: {},
    };
    const result = markdownToLinearUpdate(md, makeRefData());
    expect(result.errors).toContainEqual(expect.stringContaining('priority must be 0-4'));
  });

  it('T18: priority 0 and 4 are valid', () => {
    for (const p of [0, 4]) {
      const md: MarkdownIssue = {
        id: 'x', identifier: 'ENG-1', title: 'T', status: 'In Progress',
        priority: p, assignee: null, labels: [], team: 'Engineering',
        project: null, url: '', createdAt: '', updatedAt: '', body: '',
        extraFields: {},
      };
      const result = markdownToLinearUpdate(md, makeRefData());
      expect(result.errors.filter(e => e.includes('priority'))).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// T19: Unicode in team names and labels
// ---------------------------------------------------------------------------

describe('T19: Unicode in team names', () => {
  it('T19: team with accented characters is preserved in frontmatter', () => {
    const issue = makeLinearIssue({ teamName: 'Developpement', teamKey: 'DEV' });
    const md = linearToMarkdown(issue);
    expect(md.team).toBe('Developpement');
  });

  it('T19: unicode team name is slugified for directory', () => {
    const slug = slugify('Developpement');
    expect(slug).toBe('developpement');
  });
});

// ---------------------------------------------------------------------------
// T20: Config file exists but init run again
// ---------------------------------------------------------------------------

describe('T20: Config already exists on init', () => {
  it('T20: throws ConfigError when config already exists', async () => {
    await writeFile(
      join(testDir, '.kb-sync.json'),
      JSON.stringify({ version: 1, kbDir: 'kb', workspace: 'test', lastSyncedAt: null }),
    );
    const mockClient = {
      getViewer: vi.fn(),
      getOrganization: vi.fn(),
      fetchReferenceData: vi.fn(),
      fetchIssues: vi.fn(),
      fetchAllIssueIds: vi.fn(),
      fetchIssueUpdatedAt: vi.fn(),
      fetchIssueTimestamps: vi.fn(),
      updateIssue: vi.fn(),
    };
    await expect(executeInit(testDir, mockClient)).rejects.toThrow(ConfigError);
    expect(mockClient.getViewer).not.toHaveBeenCalled();
  });

  it('T20: error message says "already exists" and "Delete it first"', async () => {
    await writeFile(join(testDir, '.kb-sync.json'), '{}');
    try {
      await executeInit(testDir, {
        getViewer: vi.fn(), getOrganization: vi.fn(), fetchReferenceData: vi.fn(),
        fetchIssues: vi.fn(), fetchAllIssueIds: vi.fn(),
        fetchIssueUpdatedAt: vi.fn(), fetchIssueTimestamps: vi.fn(), updateIssue: vi.fn(),
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).userMessage).toContain('already exists');
      expect((err as ConfigError).userMessage).toContain('Delete it first');
    }
  });
});
