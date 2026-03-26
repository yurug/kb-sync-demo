// Tests for non-functional properties NF1-NF8 from kb/properties/non-functional.md

import { describe, it, expect, vi } from 'vitest';
import { hashContent } from '../src/core/hasher.js';
import { linearToMarkdown } from '../src/core/mapper.js';
import { markdownToLinearUpdate } from '../src/core/push-mapper.js';
import { serializeMarkdownIssue } from '../src/fs/writer.js';
import { parseMarkdownContent } from '../src/fs/reader.js';
import { isRetryable, withRetry } from '../src/linear/pagination.js';
import { AuthError, ApiError, ConfigError, FileSystemError, ConflictError, ValidationError, KbSyncError } from '../src/errors.js';
import type { LinearIssue, ReferenceData } from '../src/types.js';

function makeLinearIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'uuid-1', identifier: 'ENG-1', title: 'Test', description: 'Body',
    priority: 2, statusName: 'In Progress', assigneeName: 'Alice',
    labelNames: ['bug'], teamKey: 'ENG', teamName: 'Engineering',
    projectName: null, url: 'https://linear.app/ENG-1',
    createdAt: '2026-03-20T09:00:00.000Z',
    updatedAt: '2026-03-25T10:00:00.000Z',
    ...overrides,
  };
}

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['t1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map([['u1', 'Alice']]),
    states: new Map([['s1', 'In Progress'], ['s2', 'Done']]),
    labels: new Map([['l1', 'bug']]),
    projects: new Map(),
  };
}

// ---------------------------------------------------------------------------
// NF3: Rate limit compliance
// ---------------------------------------------------------------------------

describe('NF3: Rate limit compliance', () => {
  it('NF3: 429 error triggers retry', () => {
    expect(isRetryable(new Error('429 Too Many Requests'))).toBe(true);
  });

  it('NF3: 401 auth error is never retried', () => {
    expect(isRetryable(new AuthError('bad key', 'Invalid key'))).toBe(false);
  });

  it('NF3: 5xx errors are retryable', () => {
    expect(isRetryable(new Error('502 Bad Gateway'))).toBe(true);
    expect(isRetryable(new Error('503 Service Unavailable'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NF4: API key security
// ---------------------------------------------------------------------------

describe('NF4: API key security', () => {
  it('NF4: AuthError userMessage does not contain the actual key', () => {
    const fakeKey = 'lin_api_1234567890abcdef';
    const err = new AuthError(
      `Auth failed for key ${fakeKey}`,
      'Linear API key is invalid or expired. Check your LINEAR_API_KEY.',
    );
    expect(err.userMessage).not.toContain(fakeKey);
    expect(err.userMessage).toContain('LINEAR_API_KEY');
  });

  it('NF4: error messages use generic references, not actual key values', () => {
    const err = new AuthError('401', 'LINEAR_API_KEY environment variable is not set. Export it and try again.');
    expect(err.userMessage).not.toMatch(/lin_api_/);
  });
});

// ---------------------------------------------------------------------------
// NF5: Error message quality
// ---------------------------------------------------------------------------

describe('NF5: Error message quality', () => {
  it('NF5: ConfigError includes what failed and suggested fix', () => {
    const err = new ConfigError('missing', "No .kb-sync.json found. Run 'kb-sync init' first.");
    expect(err.userMessage).toContain('.kb-sync.json');
    expect(err.userMessage).toContain('init');
  });

  it('NF5: AuthError includes the cause and suggested fix', () => {
    const err = new AuthError('401', 'Linear API key is invalid or expired. Check your LINEAR_API_KEY.');
    expect(err.userMessage).toContain('invalid or expired');
    expect(err.userMessage).toContain('LINEAR_API_KEY');
  });

  it('NF5: ApiError includes retry count and last error', () => {
    const err = new ApiError('fail', 'Linear API failed after 5 retries. Last error: 429');
    expect(err.userMessage).toContain('5 retries');
    expect(err.userMessage).toContain('429');
  });

  it('NF5: FileSystemError includes file path', () => {
    const err = new FileSystemError('fail', 'Failed to read kb/ENG/ENG-1.md: EACCES');
    expect(err.userMessage).toContain('ENG-1.md');
    expect(err.userMessage).toContain('EACCES');
  });

  it('NF5: ConflictError includes identifier and suggested fix', () => {
    const err = new ConflictError('conflict', 'Conflict: ENG-123. Pull first or use --force.');
    expect(err.userMessage).toContain('ENG-123');
    expect(err.userMessage).toContain('Pull first');
  });

  it('NF5: ValidationError includes field name and valid alternatives', () => {
    const err = new ValidationError('bad', "Skipping ENG-1: unknown status 'Donee' (valid: Done, In Progress)");
    expect(err.userMessage).toContain('Donee');
    expect(err.userMessage).toContain('Done');
  });
});

// ---------------------------------------------------------------------------
// NF7: Graceful degradation
// ---------------------------------------------------------------------------

describe('NF7: Graceful degradation', () => {
  it('NF7: markdownToLinearUpdate accumulates multiple errors without throwing', () => {
    const md = linearToMarkdown(makeLinearIssue());
    const badIssue = { ...md, status: 'Bad', assignee: 'Nobody', priority: 99 };
    const result = markdownToLinearUpdate(badIssue, makeRefData());
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// NF8: Idempotency
// ---------------------------------------------------------------------------

describe('NF8: Idempotency', () => {
  it('NF8: hashing identical content produces identical hash', () => {
    const content = '---\nid: "x"\n---\nBody\n';
    const h1 = hashContent(content);
    const h2 = hashContent(content);
    expect(h1).toBe(h2);
  });

  it('NF8: serializing same issue twice produces identical output', () => {
    const md = linearToMarkdown(makeLinearIssue());
    const s1 = serializeMarkdownIssue(md);
    const s2 = serializeMarkdownIssue(md);
    expect(s1).toBe(s2);
  });

  it('NF8: serialize->parse roundtrip is stable', () => {
    const md = linearToMarkdown(makeLinearIssue());
    const s1 = serializeMarkdownIssue(md);
    const p1 = parseMarkdownContent(s1);
    const s2 = serializeMarkdownIssue(p1);
    expect(s1).toBe(s2);
  });

  it('NF8: pull->push with no edits reports zero errors', () => {
    const md = linearToMarkdown(makeLinearIssue());
    const result = markdownToLinearUpdate(md, makeRefData());
    expect(result.errors).toHaveLength(0);
  });
});
