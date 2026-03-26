// Module: resolver -- Join raw IssueNodes with ReferenceData maps
//
// This module resolves raw GraphQL issue nodes (with relation IDs) into
// fully-resolved LinearIssue objects (with human-readable names). Also
// provides the mutation field builder for push operations.
// It implements: ADR-002 (bulk-fetch-then-join resolution step).
// Key design decisions: pure functions, no API calls, no side effects.

import type { ReferenceData, LinearIssue } from '../types.js';
import type { IssueNode, IssueUpdateInput } from './types.js';

/** UUID v4 format regex — used to validate IDs before embedding in GraphQL mutations. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate UUID format to prevent GraphQL injection.
 * All IDs embedded into raw GraphQL strings must pass through this guard.
 *
 * @param id - String to validate as UUID
 * @returns The validated UUID string (pass-through)
 * @throws {Error} When the string is not a valid UUID format
 */
function assertUUID(id: string): string {
  if (!UUID_RE.test(id)) throw new Error(`Invalid UUID: ${id}`);
  return id;
}

/**
 * Resolve a raw IssueNode (with relation IDs) into a fully-resolved
 * LinearIssue (with human-readable names) using the reference data maps.
 *
 * @param node - Raw issue from GraphQL
 * @param refData - Bulk-fetched reference maps
 * @returns Fully resolved LinearIssue
 */
export function resolveIssueNode(node: IssueNode, refData: ReferenceData): LinearIssue {
  const team = refData.teams.get(node.team.id);
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    description: node.description,
    priority: node.priority,
    // Resolve state ID to name, fallback to "Unknown" if deleted
    statusName: refData.states.get(node.state.id) ?? 'Unknown',
    // Resolve assignee ID to name, null if unassigned
    assigneeName: node.assignee ? (refData.users.get(node.assignee.id) ?? 'Unknown') : null,
    // Resolve label IDs to names, filter out deleted labels, sort alphabetically
    labelNames: node.labels.nodes
      .map((l) => refData.labels.get(l.id))
      .filter((name): name is string => name !== undefined)
      .sort(),
    // Team key and name from reference data
    teamKey: team?.key ?? 'UNKNOWN',
    teamName: team?.name ?? 'Unknown',
    // Resolve project ID to name, null if not in a project
    projectName: node.project ? (refData.projects.get(node.project.id) ?? null) : null,
    url: node.url,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

/**
 * Build GraphQL mutation field string from an IssueUpdateInput.
 * Omits undefined fields so Linear only updates what changed.
 *
 * @param input - Issue update input with optional fields
 * @returns GraphQL field string for the mutation input object
 */
export function buildMutationFields(input: IssueUpdateInput): string {
  const parts: string[] = [];

  if (input.title !== undefined) {
    parts.push(`title: ${JSON.stringify(input.title)}`);
  }
  if (input.description !== undefined) {
    parts.push(`description: ${JSON.stringify(input.description)}`);
  }
  if (input.stateId !== undefined) {
    parts.push(`stateId: "${assertUUID(input.stateId)}"`);
  }
  if (input.priority !== undefined) {
    parts.push(`priority: ${input.priority}`);
  }
  // assigneeId: null unassigns, string assigns, undefined = no change
  if (input.assigneeId !== undefined) {
    if (input.assigneeId === null) {
      parts.push('assigneeId: null');
    } else {
      parts.push(`assigneeId: "${assertUUID(input.assigneeId)}"`);
    }
  }
  if (input.labelIds !== undefined) {
    const ids = input.labelIds.map((id) => `"${assertUUID(id)}"`).join(', ');
    parts.push(`labelIds: [${ids}]`);
  }
  // projectId: null removes from project, string sets project
  if (input.projectId !== undefined) {
    if (input.projectId === null) {
      parts.push('projectId: null');
    } else {
      parts.push(`projectId: "${assertUUID(input.projectId)}"`);
    }
  }

  return parts.join(', ');
}
