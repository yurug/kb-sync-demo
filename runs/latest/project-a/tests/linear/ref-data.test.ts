// Tests for src/linear/ref-data.ts — bulk reference data fetching

import { describe, it, expect, vi } from 'vitest';
import { fetchAllReferenceData } from '../../src/linear/ref-data.js';
import { ApiError } from '../../src/errors.js';

function makeMockLinearClient() {
  return {
    teams: vi.fn().mockResolvedValue({
      nodes: [
        { id: 't1', key: 'ENG', name: 'Engineering' },
        { id: 't2', key: 'DES', name: 'Design' },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    users: vi.fn().mockResolvedValue({
      nodes: [
        { id: 'u1', displayName: 'Alice Smith' },
        { id: 'u2', displayName: 'Bob Jones' },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    workflowStates: vi.fn().mockResolvedValue({
      nodes: [
        { id: 's1', name: 'In Progress' },
        { id: 's2', name: 'Done' },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    issueLabels: vi.fn().mockResolvedValue({
      nodes: [
        { id: 'l1', name: 'bug' },
        { id: 'l2', name: 'feature' },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    projects: vi.fn().mockResolvedValue({
      nodes: [{ id: 'p1', name: 'Q1 Sprint' }],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
  };
}

describe('fetchAllReferenceData', () => {
  it('ADR-002: builds complete reference data maps', async () => {
    const client = makeMockLinearClient();
    const refData = await fetchAllReferenceData(client as any);

    expect(refData.teams.size).toBe(2);
    expect(refData.teams.get('t1')).toEqual({ key: 'ENG', name: 'Engineering' });
    expect(refData.users.size).toBe(2);
    expect(refData.users.get('u1')).toBe('Alice Smith');
    expect(refData.states.size).toBe(2);
    expect(refData.states.get('s1')).toBe('In Progress');
    expect(refData.labels.size).toBe(2);
    expect(refData.labels.get('l1')).toBe('bug');
    expect(refData.projects.size).toBe(1);
    expect(refData.projects.get('p1')).toBe('Q1 Sprint');
  });

  it('NF3: paginates through multiple pages for teams', async () => {
    const client = makeMockLinearClient();
    client.teams
      .mockResolvedValueOnce({
        nodes: [{ id: 't1', key: 'ENG', name: 'Engineering' }],
        pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
      })
      .mockResolvedValueOnce({
        nodes: [{ id: 't2', key: 'DES', name: 'Design' }],
        pageInfo: { hasNextPage: false, endCursor: null },
      });

    const refData = await fetchAllReferenceData(client as any);
    expect(refData.teams.size).toBe(2);
    expect(client.teams).toHaveBeenCalledTimes(2);
  });

  it('handles empty entity lists', async () => {
    const client = makeMockLinearClient();
    client.projects.mockResolvedValue({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    const refData = await fetchAllReferenceData(client as any);
    expect(refData.projects.size).toBe(0);
  });

  it('wraps non-typed errors in ApiError', async () => {
    const client = makeMockLinearClient();
    client.teams.mockRejectedValue(new Error('Network failure'));

    await expect(fetchAllReferenceData(client as any)).rejects.toThrow(ApiError);
  });
});
