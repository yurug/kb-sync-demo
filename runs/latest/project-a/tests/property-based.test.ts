// Property-based tests — randomized inputs for critical invariants

import { describe, it, expect } from 'vitest';
import { linearToMarkdown, slugify } from '../src/core/mapper.js';
import { markdownToLinearUpdate } from '../src/core/push-mapper.js';
import { serializeMarkdownIssue } from '../src/fs/writer.js';
import { parseMarkdownContent } from '../src/fs/reader.js';
import { hashContent } from '../src/core/hasher.js';
import type { LinearIssue, ReferenceData } from '../src/types.js';

// ---------------------------------------------------------------------------
// Random generators
// ---------------------------------------------------------------------------

function randomString(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_./!@#$%()';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function randomPriority(): number {
  return Math.floor(Math.random() * 5);
}

function randomLinearIssue(): LinearIssue {
  const statuses = ['Todo', 'In Progress', 'Done', 'Backlog'];
  const assignees = ['Alice Smith', 'Bob Jones', null];
  const labels = ['bug', 'feature', 'urgent', 'docs'];
  const numLabels = Math.floor(Math.random() * 3);
  const selectedLabels = labels.slice(0, numLabels);

  return {
    id: randomUUID(),
    identifier: `ENG-${Math.floor(Math.random() * 9999)}`,
    title: randomString(10 + Math.floor(Math.random() * 50)),
    description: Math.random() > 0.2 ? randomString(50 + Math.floor(Math.random() * 500)) : null,
    priority: randomPriority(),
    statusName: statuses[Math.floor(Math.random() * statuses.length)],
    assigneeName: assignees[Math.floor(Math.random() * assignees.length)],
    labelNames: selectedLabels,
    teamKey: 'ENG',
    teamName: 'Engineering',
    projectName: Math.random() > 0.5 ? 'Q1 Sprint' : null,
    url: `https://linear.app/test/issue/ENG-${Math.floor(Math.random() * 9999)}`,
    createdAt: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['team-1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map([['user-1', 'Alice Smith'], ['user-2', 'Bob Jones']]),
    states: new Map([
      ['state-1', 'Todo'], ['state-2', 'In Progress'],
      ['state-3', 'Done'], ['state-4', 'Backlog'],
    ]),
    labels: new Map([
      ['label-1', 'bug'], ['label-2', 'feature'],
      ['label-3', 'urgent'], ['label-4', 'docs'],
    ]),
    projects: new Map([['proj-1', 'Q1 Sprint']]),
  };
}

// ---------------------------------------------------------------------------
// P1: Roundtrip fidelity — property-based
// ---------------------------------------------------------------------------

describe('P1: Roundtrip fidelity (property-based)', () => {
  const NUM_ITERATIONS = 50;

  it(`P1: pull->serialize->parse roundtrip preserves all fields (${NUM_ITERATIONS} random issues)`, () => {
    for (let i = 0; i < NUM_ITERATIONS; i++) {
      const issue = randomLinearIssue();
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
    }
  });

  it(`P1: pull->push with no edits produces zero validation errors (${NUM_ITERATIONS} random issues)`, () => {
    const refData = makeRefData();
    for (let i = 0; i < NUM_ITERATIONS; i++) {
      const issue = randomLinearIssue();
      const md = linearToMarkdown(issue);
      const serialized = serializeMarkdownIssue(md);
      const parsed = parseMarkdownContent(serialized);
      const result = markdownToLinearUpdate(parsed, refData);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('P1: priority is always a number after roundtrip (never coerced to string)', () => {
    for (let i = 0; i < 20; i++) {
      const p = randomPriority();
      const issue = randomLinearIssue();
      (issue as any).priority = p;
      const md = linearToMarkdown(issue);
      const serialized = serializeMarkdownIssue(md);
      const parsed = parseMarkdownContent(serialized);
      expect(typeof parsed.priority).toBe('number');
      expect(parsed.priority).toBe(p);
    }
  });
});

// ---------------------------------------------------------------------------
// Slugify — property-based
// ---------------------------------------------------------------------------

describe('Slugify (property-based)', () => {
  it('slugify always produces lowercase output', () => {
    for (let i = 0; i < 50; i++) {
      const input = randomString(20 + Math.floor(Math.random() * 80));
      const slug = slugify(input);
      expect(slug).toBe(slug.toLowerCase());
    }
  });

  it('slugify output never exceeds 80 characters', () => {
    for (let i = 0; i < 50; i++) {
      const input = randomString(50 + Math.floor(Math.random() * 200));
      const slug = slugify(input);
      expect(slug.length).toBeLessThanOrEqual(80);
    }
  });

  it('slugify output contains only [a-z0-9-]', () => {
    for (let i = 0; i < 50; i++) {
      const input = randomString(30);
      const slug = slugify(input);
      expect(slug).toMatch(/^[a-z0-9-]*$/);
    }
  });

  it('slugify never has consecutive hyphens', () => {
    for (let i = 0; i < 50; i++) {
      const input = randomString(30);
      const slug = slugify(input);
      expect(slug).not.toContain('--');
    }
  });

  it('slugify never has trailing hyphens', () => {
    for (let i = 0; i < 50; i++) {
      const input = randomString(30);
      const slug = slugify(input);
      if (slug.length > 0) {
        expect(slug.endsWith('-')).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Hash — property-based
// ---------------------------------------------------------------------------

describe('Hash determinism (property-based)', () => {
  it('same content always produces same hash', () => {
    for (let i = 0; i < 30; i++) {
      const content = randomString(100 + Math.floor(Math.random() * 500));
      expect(hashContent(content)).toBe(hashContent(content));
    }
  });

  it('different content produces different hashes (with very high probability)', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const content = randomString(50) + String(i);
      hashes.add(hashContent(content));
    }
    // All should be unique (collision probability negligible with SHA-256)
    expect(hashes.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// NF8: Idempotency — property-based
// ---------------------------------------------------------------------------

describe('NF8: Idempotency (property-based)', () => {
  it('NF8: serialize is deterministic for any random issue', () => {
    for (let i = 0; i < 30; i++) {
      const issue = randomLinearIssue();
      const md = linearToMarkdown(issue);
      const s1 = serializeMarkdownIssue(md);
      const s2 = serializeMarkdownIssue(md);
      expect(s1).toBe(s2);
    }
  });

  it('NF8: serialize->parse->serialize is stable (double roundtrip)', () => {
    for (let i = 0; i < 30; i++) {
      const issue = randomLinearIssue();
      const md = linearToMarkdown(issue);
      // First roundtrip: serialize -> parse (gray-matter trims trailing whitespace from body)
      const s1 = serializeMarkdownIssue(md);
      const p1 = parseMarkdownContent(s1);
      // After first parse, body is trimmed. Second serialize uses that trimmed body.
      const s2 = serializeMarkdownIssue(p1);
      const p2 = parseMarkdownContent(s2);
      const s3 = serializeMarkdownIssue(p2);
      // Second and third serializations should be stable
      expect(s2).toBe(s3);
    }
  });
});
