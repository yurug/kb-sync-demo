// Tests for src/linear/resolver.ts — issue node resolution and mutation builder

import { describe, it, expect } from 'vitest';
import { resolveIssueNode, buildMutationFields } from '../../src/linear/resolver.js';
import type { ReferenceData } from '../../src/types.js';
import type { IssueNode, IssueUpdateInput } from '../../src/linear/types.js';

function makeRefData(): ReferenceData {
  return {
    teams: new Map([['team-1', { key: 'ENG', name: 'Engineering' }]]),
    users: new Map([['user-1', 'Alice Smith']]),
    states: new Map([['state-1', 'In Progress'], ['state-2', 'Done']]),
    labels: new Map([['label-1', 'bug'], ['label-2', 'feature']]),
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
// resolveIssueNode
// ---------------------------------------------------------------------------

describe('resolveIssueNode', () => {
  it('resolves all relation IDs to names', () => {
    const resolved = resolveIssueNode(makeIssueNode(), makeRefData());
    expect(resolved.statusName).toBe('In Progress');
    expect(resolved.assigneeName).toBe('Alice Smith');
    expect(resolved.teamKey).toBe('ENG');
    expect(resolved.teamName).toBe('Engineering');
    expect(resolved.projectName).toBe('Q1 Sprint');
    expect(resolved.labelNames).toEqual(['bug']);
  });

  it('handles null assignee', () => {
    const node = makeIssueNode({ assignee: null });
    const resolved = resolveIssueNode(node, makeRefData());
    expect(resolved.assigneeName).toBeNull();
  });

  it('handles null project', () => {
    const node = makeIssueNode({ project: null });
    const resolved = resolveIssueNode(node, makeRefData());
    expect(resolved.projectName).toBeNull();
  });

  it('handles unknown state ID gracefully', () => {
    const node = makeIssueNode({ state: { id: 'unknown' } });
    const resolved = resolveIssueNode(node, makeRefData());
    expect(resolved.statusName).toBe('Unknown');
  });

  it('handles unknown team ID gracefully', () => {
    const node = makeIssueNode({ team: { id: 'unknown-team' } });
    const resolved = resolveIssueNode(node, makeRefData());
    expect(resolved.teamKey).toBe('UNKNOWN');
    expect(resolved.teamName).toBe('Unknown');
  });

  it('filters out deleted labels', () => {
    const node = makeIssueNode({ labels: { nodes: [{ id: 'label-1' }, { id: 'deleted' }] } });
    const resolved = resolveIssueNode(node, makeRefData());
    expect(resolved.labelNames).toEqual(['bug']);
  });

  it('sorts label names alphabetically', () => {
    const node = makeIssueNode({ labels: { nodes: [{ id: 'label-2' }, { id: 'label-1' }] } });
    const resolved = resolveIssueNode(node, makeRefData());
    expect(resolved.labelNames).toEqual(['bug', 'feature']);
  });
});

// ---------------------------------------------------------------------------
// buildMutationFields
// ---------------------------------------------------------------------------

describe('buildMutationFields', () => {
  it('builds field string for all fields', () => {
    const s1 = 'a0000000-0000-0000-0000-000000000001';
    const u1 = 'b0000000-0000-0000-0000-000000000001';
    const l1 = 'c0000000-0000-0000-0000-000000000001';
    const l2 = 'c0000000-0000-0000-0000-000000000002';
    const p1 = 'd0000000-0000-0000-0000-000000000001';
    const input: IssueUpdateInput = {
      title: 'New title', description: 'Desc', stateId: s1,
      priority: 3, assigneeId: u1, labelIds: [l1, l2], projectId: p1,
    };
    const fields = buildMutationFields(input);
    expect(fields).toContain('title: "New title"');
    expect(fields).toContain('description: "Desc"');
    expect(fields).toContain(`stateId: "${s1}"`);
    expect(fields).toContain('priority: 3');
    expect(fields).toContain(`assigneeId: "${u1}"`);
    expect(fields).toContain(`labelIds: ["${l1}", "${l2}"]`);
    expect(fields).toContain(`projectId: "${p1}"`);
  });

  it('omits undefined fields', () => {
    const input: IssueUpdateInput = { title: 'Only title' };
    const fields = buildMutationFields(input);
    expect(fields).toBe('title: "Only title"');
    expect(fields).not.toContain('stateId');
  });

  it('handles null assigneeId (unassign)', () => {
    const input: IssueUpdateInput = { assigneeId: null };
    const fields = buildMutationFields(input);
    expect(fields).toContain('assigneeId: null');
  });

  it('handles null projectId (remove from project)', () => {
    const input: IssueUpdateInput = { projectId: null };
    const fields = buildMutationFields(input);
    expect(fields).toContain('projectId: null');
  });

  it('handles empty labelIds array', () => {
    const input: IssueUpdateInput = { labelIds: [] };
    const fields = buildMutationFields(input);
    expect(fields).toContain('labelIds: []');
  });
});
