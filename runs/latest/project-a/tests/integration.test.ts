// Integration tests — real Linear API (READ-ONLY, requires LINEAR_API_KEY)
// These tests verify the real API works, not just mocks.
// Skipped automatically when LINEAR_API_KEY is not set.

import { describe, it, expect } from 'vitest';

const hasApiKey = !!process.env['LINEAR_API_KEY'];

describe.skipIf(!hasApiKey)('Integration: Real Linear API', () => {
  it('can connect and fetch viewer info', async () => {
    const { LinearClientImpl } = await import('../src/linear/client.js');
    const client = new LinearClientImpl(process.env['LINEAR_API_KEY']!);
    const viewer = await client.getViewer();
    expect(viewer.id).toBeDefined();
    expect(typeof viewer.id).toBe('string');
    expect(viewer.name).toBeDefined();
    expect(typeof viewer.name).toBe('string');
  });

  it('can fetch organization info', async () => {
    const { LinearClientImpl } = await import('../src/linear/client.js');
    const client = new LinearClientImpl(process.env['LINEAR_API_KEY']!);
    const org = await client.getOrganization();
    expect(org.name).toBeDefined();
    expect(org.urlKey).toBeDefined();
    expect(typeof org.urlKey).toBe('string');
  });

  it('can fetch reference data (teams, users, states)', async () => {
    const { LinearClientImpl } = await import('../src/linear/client.js');
    const client = new LinearClientImpl(process.env['LINEAR_API_KEY']!);
    const refData = await client.fetchReferenceData();
    expect(refData.teams.size).toBeGreaterThan(0);
    expect(refData.states.size).toBeGreaterThan(0);
  });

  it('can fetch issues from at least one team', async () => {
    const { LinearClientImpl } = await import('../src/linear/client.js');
    const client = new LinearClientImpl(process.env['LINEAR_API_KEY']!);
    const refData = await client.fetchReferenceData();
    const teamIds = [...refData.teams.keys()].slice(0, 1);
    const [issues, complete] = await client.fetchIssues(teamIds);
    expect(Array.isArray(issues)).toBe(true);
    expect(typeof complete).toBe('boolean');
    // If the workspace has issues, verify structure
    if (issues.length > 0) {
      expect(issues[0].id).toBeDefined();
      expect(issues[0].identifier).toBeDefined();
      expect(issues[0].title).toBeDefined();
      expect(typeof issues[0].priority).toBe('number');
    }
  });

  it('can fetch issue IDs list', async () => {
    const { LinearClientImpl } = await import('../src/linear/client.js');
    const client = new LinearClientImpl(process.env['LINEAR_API_KEY']!);
    const refData = await client.fetchReferenceData();
    const teamIds = [...refData.teams.keys()].slice(0, 1);
    const ids = await client.fetchAllIssueIds(teamIds);
    expect(Array.isArray(ids)).toBe(true);
  });
});

describe.skipIf(!hasApiKey)('Integration: Init with real API', () => {
  it('init can connect and verify the workspace', async () => {
    const { LinearClientImpl } = await import('../src/linear/client.js');
    const client = new LinearClientImpl(process.env['LINEAR_API_KEY']!);
    // Just verify we can connect — don't actually create config
    const viewer = await client.getViewer();
    const org = await client.getOrganization();
    expect(viewer.id).toBeDefined();
    expect(org.urlKey).toBeDefined();
  });
});
