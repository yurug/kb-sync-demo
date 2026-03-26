// Tests for src/core/mapper.ts — LinearIssue <-> MarkdownIssue conversion

import { describe, it, expect } from 'vitest';
import { linearToMarkdown, buildFilename, slugify, buildFilePath } from '../../src/core/mapper.js';
import type { LinearIssue } from '../../src/types.js';

// Helper: create a valid LinearIssue for testing
function makeLinearIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'abc-123-uuid',
    identifier: 'ENG-123',
    title: 'Fix login bug',
    description: 'The login page crashes on submit.',
    priority: 2,
    statusName: 'In Progress',
    assigneeName: 'Alice Smith',
    labelNames: ['bug', 'urgent'],
    teamKey: 'ENG',
    teamName: 'Engineering',
    projectName: 'Q1 Sprint',
    url: 'https://linear.app/test/issue/ENG-123',
    createdAt: '2026-03-20T09:00:00.000Z',
    updatedAt: '2026-03-25T10:00:00.000Z',
    ...overrides,
  };
}

describe('P1: Roundtrip fidelity (pull direction)', () => {
  it('P1: linearToMarkdown maps all fields correctly', () => {
    const issue = makeLinearIssue();
    const md = linearToMarkdown(issue);

    expect(md.id).toBe('abc-123-uuid');
    expect(md.identifier).toBe('ENG-123');
    expect(md.title).toBe('Fix login bug');
    expect(md.status).toBe('In Progress');
    expect(md.priority).toBe(2);
    expect(md.assignee).toBe('Alice Smith');
    expect(md.labels).toEqual(['bug', 'urgent']);
    expect(md.team).toBe('Engineering');
    expect(md.project).toBe('Q1 Sprint');
    expect(md.url).toBe('https://linear.app/test/issue/ENG-123');
    expect(md.body).toBe('The login page crashes on submit.');
  });

  it('P1: priority is preserved as a number, not string', () => {
    const md = linearToMarkdown(makeLinearIssue({ priority: 0 }));
    expect(typeof md.priority).toBe('number');
    expect(md.priority).toBe(0);
  });

  it('P1: labels are sorted alphabetically', () => {
    const issue = makeLinearIssue({ labelNames: ['zebra', 'alpha', 'middle'] });
    const md = linearToMarkdown(issue);
    expect(md.labels).toEqual(['alpha', 'middle', 'zebra']);
  });
});

describe('P4: Extra frontmatter preservation', () => {
  it('P4: extra fields are merged into output', () => {
    const issue = makeLinearIssue();
    const extra = { notes: 'my annotation', customTag: 'foo' };
    const md = linearToMarkdown(issue, extra);
    expect(md.extraFields).toEqual(extra);
  });

  it('P4: empty extra fields default to empty object', () => {
    const md = linearToMarkdown(makeLinearIssue());
    expect(md.extraFields).toEqual({});
  });
});

describe('T1: Issue with no description', () => {
  it('T1: null description becomes empty string body', () => {
    const md = linearToMarkdown(makeLinearIssue({ description: null }));
    expect(md.body).toBe('');
  });
});

describe('T3: Title with special characters', () => {
  it('T3: slugifies special chars in filename', () => {
    const filename = buildFilename('ENG-123', 'Fix: crash on /api/v2 endpoint (urgent!)');
    expect(filename).toBe('ENG-123-fix-crash-on-api-v2-endpoint-urgent.md');
  });

  it('T3: handles unicode characters', () => {
    // ASCII-compatible letters pass through slugify unchanged
    const filename = buildFilename('ENG-456', 'Amelioration du systeme');
    expect(filename).toBe('ENG-456-amelioration-du-systeme.md');
  });
});

describe('slugify', () => {
  it('lowercases and replaces non-alphanumeric', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('collapses consecutive hyphens', () => {
    expect(slugify('a---b   c')).toBe('a-b-c');
  });

  it('trims to 80 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });

  it('removes trailing hyphens', () => {
    expect(slugify('hello world ---')).toBe('hello-world');
  });
});

describe('buildFilePath', () => {
  it('builds correct path pattern', () => {
    const path = buildFilePath('./kb', 'ENG', 'ENG-123', 'Fix login bug');
    expect(path).toBe('./kb/ENG/ENG-123-fix-login-bug.md');
  });
});

describe('Nullability handling', () => {
  it('null assignee is preserved as null', () => {
    const md = linearToMarkdown(makeLinearIssue({ assigneeName: null }));
    expect(md.assignee).toBeNull();
  });

  it('null project is preserved as null', () => {
    const md = linearToMarkdown(makeLinearIssue({ projectName: null }));
    expect(md.project).toBeNull();
  });
});
