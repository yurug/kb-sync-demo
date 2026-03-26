// Tests for src/core/mapper.ts — push direction (MarkdownIssue -> IssueUpdateInput)

import { describe, it, expect } from 'vitest';
import { markdownToLinearUpdate } from '../../src/core/mapper.js';
import type { MarkdownIssue, ReferenceData } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['team-1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map([
      ['user-1', 'Alice Smith'],
      ['user-2', 'Bob Jones'],
    ]),
    states: new Map([
      ['state-1', 'In Progress'],
      ['state-2', 'Done'],
      ['state-3', 'Backlog'],
    ]),
    labels: new Map([
      ['label-1', 'bug'],
      ['label-2', 'feature'],
    ]),
    projects: new Map([
      ['proj-1', 'Q1 Sprint'],
    ]),
  };
}

function makeMarkdownIssue(overrides: Partial<MarkdownIssue> = {}): MarkdownIssue {
  return {
    id: 'issue-uuid-1',
    identifier: 'ENG-1',
    title: 'Fix login bug',
    status: 'In Progress',
    priority: 2,
    assignee: 'Alice Smith',
    labels: ['bug'],
    team: 'Engineering',
    project: 'Q1 Sprint',
    url: 'https://linear.app/test/issue/ENG-1',
    createdAt: '2026-03-20T09:00:00.000Z',
    updatedAt: '2026-03-25T10:00:00.000Z',
    body: 'The login page crashes on submit.',
    extraFields: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// P7: Pushable vs read-only field separation
// ---------------------------------------------------------------------------

describe('P7: Pushable vs read-only field separation', () => {
  it('P7: resolves pushable fields correctly', () => {
    const result = markdownToLinearUpdate(makeMarkdownIssue(), makeRefData());
    expect(result.errors).toHaveLength(0);
    expect(result.input.title).toBe('Fix login bug');
    expect(result.input.description).toBe('The login page crashes on submit.');
    expect(result.input.priority).toBe(2);
    expect(result.input.stateId).toBe('state-1');
    expect(result.input.assigneeId).toBe('user-1');
    expect(result.input.labelIds).toEqual(['label-1']);
    expect(result.input.projectId).toBe('proj-1');
  });

  it('P7: read-only fields (id, identifier, url, etc.) are not in output', () => {
    const result = markdownToLinearUpdate(makeMarkdownIssue(), makeRefData());
    const inputKeys = Object.keys(result.input);
    // These read-only fields should NOT appear in the update input
    expect(inputKeys).not.toContain('id');
    expect(inputKeys).not.toContain('identifier');
    expect(inputKeys).not.toContain('url');
    expect(inputKeys).not.toContain('createdAt');
    expect(inputKeys).not.toContain('updatedAt');
    expect(inputKeys).not.toContain('team');
  });

  it('P7: null assignee produces null assigneeId (unassign)', () => {
    const result = markdownToLinearUpdate(
      makeMarkdownIssue({ assignee: null }),
      makeRefData(),
    );
    expect(result.errors).toHaveLength(0);
    expect(result.input.assigneeId).toBeNull();
  });

  it('P7: null project produces null projectId', () => {
    const result = markdownToLinearUpdate(
      makeMarkdownIssue({ project: null }),
      makeRefData(),
    );
    expect(result.errors).toHaveLength(0);
    expect(result.input.projectId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P8: Field validation before push
// ---------------------------------------------------------------------------

describe('P8: Field validation before push', () => {
  it('T6: invalid status produces error with valid alternatives', () => {
    const result = markdownToLinearUpdate(
      makeMarkdownIssue({ status: 'Donee' }),
      makeRefData(),
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('unknown status "Donee"');
    expect(result.errors[0]).toContain('Valid:');
    // Check that valid alternatives are listed
    expect(result.errors[0]).toContain('In Progress');
    expect(result.errors[0]).toContain('Done');
    expect(result.errors[0]).toContain('Backlog');
  });

  it('T18: priority out of range produces error', () => {
    const result = markdownToLinearUpdate(
      makeMarkdownIssue({ priority: 5 }),
      makeRefData(),
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('priority must be 0-4');
  });

  it('T18: negative priority produces error', () => {
    const result = markdownToLinearUpdate(
      makeMarkdownIssue({ priority: -1 }),
      makeRefData(),
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('priority must be 0-4');
  });

  it('P8: unknown assignee produces error with valid alternatives', () => {
    const result = markdownToLinearUpdate(
      makeMarkdownIssue({ assignee: 'Unknown Person' }),
      makeRefData(),
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('unknown assignee "Unknown Person"');
    expect(result.errors[0]).toContain('Valid:');
  });

  it('P8: unknown label produces error with valid alternatives', () => {
    const result = markdownToLinearUpdate(
      makeMarkdownIssue({ labels: ['nonexistent-label'] }),
      makeRefData(),
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('unknown label "nonexistent-label"');
    expect(result.errors[0]).toContain('Valid:');
  });

  it('P8: unknown project produces error with valid alternatives', () => {
    const result = markdownToLinearUpdate(
      makeMarkdownIssue({ project: 'Ghost Project' }),
      makeRefData(),
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('unknown project "Ghost Project"');
    expect(result.errors[0]).toContain('Valid:');
  });

  it('P8: multiple errors are accumulated', () => {
    const result = markdownToLinearUpdate(
      makeMarkdownIssue({ status: 'Bad', assignee: 'Nobody', priority: 99 }),
      makeRefData(),
    );
    // Should have at least 3 errors (priority, status, assignee)
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// T5: Assignee display name collision
// ---------------------------------------------------------------------------

describe('T5: Assignee display name collision', () => {
  it('T5: ambiguous assignee (multiple users with same name) produces error', () => {
    const refData = makeRefData();
    // Add a second user with the same display name as the first
    refData.users.set('user-3', 'Alice Smith');

    const result = markdownToLinearUpdate(makeMarkdownIssue(), refData);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).toContainEqual(
      expect.stringContaining('matches multiple users'),
    );
  });
});

// ---------------------------------------------------------------------------
// P1: Roundtrip fidelity (full cycle)
// ---------------------------------------------------------------------------

describe('P1: Roundtrip fidelity (push direction)', () => {
  it('P1: valid issue produces no validation errors', () => {
    const result = markdownToLinearUpdate(makeMarkdownIssue(), makeRefData());
    expect(result.errors).toHaveLength(0);
  });

  it('P1: empty body maps to empty description', () => {
    const result = markdownToLinearUpdate(
      makeMarkdownIssue({ body: '' }),
      makeRefData(),
    );
    expect(result.input.description).toBe('');
  });

  it('P1: empty labels produce empty labelIds array', () => {
    const result = markdownToLinearUpdate(
      makeMarkdownIssue({ labels: [] }),
      makeRefData(),
    );
    expect(result.input.labelIds).toEqual([]);
  });
});
