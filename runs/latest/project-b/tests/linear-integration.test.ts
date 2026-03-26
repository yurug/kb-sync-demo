import { describe, it, expect } from 'vitest';
import { LinearClient } from '@linear/sdk';

/**
 * Integration test that hits the real Linear API.
 * Requires LINEAR_API_KEY env var to be set.
 * Read-only: never creates, updates, or deletes anything.
 */
describe('Linear API integration', () => {
  const apiKey = process.env.LINEAR_API_KEY;

  it.skipIf(!apiKey)('should authenticate and fetch the viewer', async () => {
    const client = new LinearClient({ apiKey: apiKey! });
    const viewer = await client.viewer;

    expect(viewer).toBeDefined();
    expect(viewer.id).toBeTruthy();
    expect(viewer.email).toBeTruthy();
  });

  it.skipIf(!apiKey)('should list teams (read-only)', async () => {
    const client = new LinearClient({ apiKey: apiKey! });
    const teams = await client.teams();

    expect(teams.nodes).toBeDefined();
    expect(Array.isArray(teams.nodes)).toBe(true);
    // User should have at least one team
    expect(teams.nodes.length).toBeGreaterThan(0);
    expect(teams.nodes[0].id).toBeTruthy();
    expect(teams.nodes[0].name).toBeTruthy();
  });

  it.skipIf(!apiKey)('should fetch issues from first team (read-only)', async () => {
    const client = new LinearClient({ apiKey: apiKey! });
    const teams = await client.teams();
    const team = teams.nodes[0];

    const issues = await team.issues({ first: 5 });
    expect(issues.nodes).toBeDefined();
    expect(Array.isArray(issues.nodes)).toBe(true);
    // Team may or may not have issues, but the query should work
  });
});
