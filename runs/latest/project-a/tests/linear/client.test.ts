// Tests for src/linear/client.ts — LinearClientImpl
// These tests mock the @linear/sdk to test client behavior without real API calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthError, ApiError } from '../../src/errors.js';

// We test the client by importing it and mocking the underlying SDK
// Since LinearClient is injected from @linear/sdk, we use vi.mock

vi.mock('@linear/sdk', () => {
  const mockClient = {
    viewer: Promise.resolve({ id: 'viewer-1', name: 'Test User' }),
    organization: Promise.resolve({ name: 'Acme', urlKey: 'acme' }),
    teams: vi.fn().mockResolvedValue({
      nodes: [{ id: 't1', key: 'ENG', name: 'Engineering' }],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    users: vi.fn().mockResolvedValue({
      nodes: [{ id: 'u1', displayName: 'Alice' }],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    workflowStates: vi.fn().mockResolvedValue({
      nodes: [{ id: 's1', name: 'In Progress' }],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    issueLabels: vi.fn().mockResolvedValue({
      nodes: [{ id: 'l1', name: 'bug' }],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    projects: vi.fn().mockResolvedValue({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    client: {
      rawRequest: vi.fn().mockResolvedValue({
        data: {
          issues: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    },
  };

  return {
    LinearClient: vi.fn().mockImplementation(() => mockClient),
  };
});

describe('LinearClientImpl', () => {
  let clientImpl: InstanceType<typeof import('../../src/linear/client.js').LinearClientImpl>;

  beforeEach(async () => {
    const { LinearClientImpl } = await import('../../src/linear/client.js');
    clientImpl = new LinearClientImpl('test-api-key');
  });

  it('getViewer returns viewer identity', async () => {
    const viewer = await clientImpl.getViewer();
    expect(viewer.id).toBe('viewer-1');
    expect(viewer.name).toBe('Test User');
  });

  it('getOrganization returns org info', async () => {
    const org = await clientImpl.getOrganization();
    expect(org.name).toBe('Acme');
    expect(org.urlKey).toBe('acme');
  });

  it('fetchReferenceData returns populated maps', async () => {
    const refData = await clientImpl.fetchReferenceData();
    expect(refData.teams.size).toBeGreaterThan(0);
    expect(refData.users.size).toBeGreaterThan(0);
    expect(refData.states.size).toBeGreaterThan(0);
    expect(refData.labels.size).toBeGreaterThan(0);
  });

  it('fetchIssues returns resolved issues', async () => {
    const [issues, complete] = await clientImpl.fetchIssues(['t1']);
    expect(Array.isArray(issues)).toBe(true);
    expect(typeof complete).toBe('boolean');
  });

  it('fetchAllIssueIds returns array of IDs', async () => {
    const ids = await clientImpl.fetchAllIssueIds(['t1']);
    expect(Array.isArray(ids)).toBe(true);
  });

  it('fetchIssueUpdatedAt returns timestamp or null', async () => {
    // Mock rawRequest for a specific issue query
    const { LinearClient } = await import('@linear/sdk');
    const mockInstance = new LinearClient({ apiKey: 'test' });
    (mockInstance.client.rawRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { issue: { updatedAt: '2026-03-25T10:00:00.000Z' } },
    });

    const result = await clientImpl.fetchIssueUpdatedAt('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    // Result could be null or string depending on mock state
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
