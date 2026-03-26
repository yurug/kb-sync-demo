// Tests for src/linear/issue-fetcher.ts — GraphQL-based issue fetching

import { describe, it, expect, vi } from 'vitest';
import { fetchAndResolveIssues, fetchIssueIdList } from '../../src/linear/issue-fetcher.js';
import type { ReferenceData } from '../../src/types.js';
import type { IssueNode } from '../../src/linear/types.js';

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['team-1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map([['user-1', 'Alice']]),
    states: new Map([['state-1', 'In Progress']]),
    labels: new Map([['label-1', 'bug']]),
    projects: new Map([['proj-1', 'Q1 Sprint']]),
  };
}

function makeIssueNode(overrides: Partial<IssueNode> = {}): IssueNode {
  return {
    id: 'node-1', identifier: 'ENG-1', title: 'Test', description: 'Body',
    priority: 2, url: 'https://linear.app/ENG-1',
    createdAt: '2026-03-20T09:00:00.000Z', updatedAt: '2026-03-25T10:00:00.000Z',
    team: { id: 'team-1' }, assignee: { id: 'user-1' },
    state: { id: 'state-1' }, project: { id: 'proj-1' },
    labels: { nodes: [{ id: 'label-1' }] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// fetchAndResolveIssues
// ---------------------------------------------------------------------------

describe('fetchAndResolveIssues', () => {
  it('fetches and resolves a single page of issues', async () => {
    const rawQuery = vi.fn().mockResolvedValue({
      issues: {
        nodes: [makeIssueNode()],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const [issues, complete] = await fetchAndResolveIssues(
      rawQuery, makeRefData(), ['team-1'],
    );

    expect(issues.length).toBe(1);
    expect(issues[0].identifier).toBe('ENG-1');
    expect(issues[0].statusName).toBe('In Progress');
    expect(complete).toBe(true);
    expect(rawQuery).toHaveBeenCalledOnce();
  });

  it('paginates through multiple pages', async () => {
    const rawQuery = vi.fn()
      .mockResolvedValueOnce({
        issues: {
          nodes: [makeIssueNode({ id: 'n1', identifier: 'ENG-1' })],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      })
      .mockResolvedValueOnce({
        issues: {
          nodes: [makeIssueNode({ id: 'n2', identifier: 'ENG-2' })],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const [issues, complete] = await fetchAndResolveIssues(
      rawQuery, makeRefData(), ['team-1'],
    );

    expect(issues.length).toBe(2);
    expect(complete).toBe(true);
    expect(rawQuery).toHaveBeenCalledTimes(2);
    // Second call should include the cursor
    const secondQuery = rawQuery.mock.calls[1][0] as string;
    expect(secondQuery).toContain('cursor-1');
  });

  it('passes since filter for incremental sync', async () => {
    const rawQuery = vi.fn().mockResolvedValue({
      issues: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await fetchAndResolveIssues(rawQuery, makeRefData(), ['team-1'], '2026-03-24T00:00:00.000Z');

    const query = rawQuery.mock.calls[0][0] as string;
    expect(query).toContain('updatedAt');
    expect(query).toContain('2026-03-24');
  });

  it('returns empty array for no issues', async () => {
    const rawQuery = vi.fn().mockResolvedValue({
      issues: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const [issues, complete] = await fetchAndResolveIssues(
      rawQuery, makeRefData(), ['team-1'],
    );

    expect(issues).toEqual([]);
    expect(complete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchIssueIdList
// ---------------------------------------------------------------------------

describe('fetchIssueIdList', () => {
  it('fetches just issue IDs', async () => {
    const rawQuery = vi.fn().mockResolvedValue({
      issues: {
        nodes: [{ id: 'id-1' }, { id: 'id-2' }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const ids = await fetchIssueIdList(rawQuery, ['team-1']);
    expect(ids).toEqual(['id-1', 'id-2']);
  });

  it('paginates through multiple pages for IDs', async () => {
    const rawQuery = vi.fn()
      .mockResolvedValueOnce({
        issues: {
          nodes: [{ id: 'id-1' }],
          pageInfo: { hasNextPage: true, endCursor: 'c1' },
        },
      })
      .mockResolvedValueOnce({
        issues: {
          nodes: [{ id: 'id-2' }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const ids = await fetchIssueIdList(rawQuery, ['team-1']);
    expect(ids).toEqual(['id-1', 'id-2']);
    expect(rawQuery).toHaveBeenCalledTimes(2);
  });

  it('returns empty for workspace with no issues', async () => {
    const rawQuery = vi.fn().mockResolvedValue({
      issues: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const ids = await fetchIssueIdList(rawQuery, ['team-1']);
    expect(ids).toEqual([]);
  });
});
