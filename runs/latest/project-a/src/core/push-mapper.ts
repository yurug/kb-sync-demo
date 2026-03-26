// Module: push-mapper -- MarkdownIssue -> IssueUpdateInput conversion
//
// This module handles the push direction mapping: converting a local
// MarkdownIssue back into a Linear IssueUpdateInput. It resolves
// human-readable names (status, assignee, labels, project) back to
// Linear UUIDs and validates all pushable fields.
// It implements: P7 (pushable vs read-only), P8 (field validation).
// Key design decisions: name→ID reverse lookup, T5 assignee collision detection.

import type { MarkdownIssue, ReferenceData } from '../types.js';
import type { IssueUpdateInput } from '../linear/types.js';

/**
 * Result of validating a MarkdownIssue for push.
 * If errors is non-empty, the issue should be skipped.
 */
export interface PushValidationResult {
  /** The resolved update input (may be partial if errors exist) */
  readonly input: IssueUpdateInput;
  /** Validation errors — non-empty means this issue should be skipped */
  readonly errors: string[];
}

/**
 * Convert a MarkdownIssue to a Linear IssueUpdateInput, resolving
 * human-readable names back to Linear UUIDs using the reference data maps.
 * Only pushable fields are included (P7). Read-only fields are ignored.
 *
 * @param issue - Parsed markdown issue
 * @param refData - Bulk-fetched reference maps for name->ID resolution
 * @returns Object with resolved update input and any validation errors
 * @invariant P7 — only pushable fields are included in the output
 * @invariant P8 — invalid fields are reported, not silently dropped
 */
export function markdownToLinearUpdate(
  issue: MarkdownIssue,
  refData: ReferenceData,
): PushValidationResult {
  const errors: string[] = [];
  const input: Record<string, unknown> = {};

  // Title — always pushable, no validation needed beyond non-empty
  input['title'] = issue.title;

  // Description — body maps to Linear's description field
  input['description'] = issue.body || '';

  // Priority — must be 0-4 (T18)
  if (issue.priority < 0 || issue.priority > 4) {
    errors.push(`priority must be 0-4, got ${issue.priority}`);
  } else {
    input['priority'] = issue.priority;
  }

  // Status -> stateId — resolve name to ID
  const stateId = resolveNameToId(issue.status, refData.states);
  if (stateId === null) {
    const valid = [...refData.states.values()].sort().join(', ');
    errors.push(`unknown status "${issue.status}". Valid: ${valid}`);
  } else {
    input['stateId'] = stateId;
  }

  // Assignee -> assigneeId — resolve name to ID (T5: collision detection)
  if (issue.assignee === null) {
    input['assigneeId'] = null;
  } else {
    const result = resolveAssignee(issue.assignee, refData.users);
    if (result.error) {
      errors.push(result.error);
    } else {
      input['assigneeId'] = result.id;
    }
  }

  // Labels -> labelIds — resolve each name to ID
  const labelIds: string[] = [];
  for (const labelName of issue.labels) {
    const labelId = resolveNameToId(labelName, refData.labels);
    if (labelId === null) {
      const valid = [...refData.labels.values()].sort().join(', ');
      errors.push(`unknown label "${labelName}". Valid: ${valid}`);
    } else {
      labelIds.push(labelId);
    }
  }
  if (errors.length === 0 || labelIds.length > 0) {
    input['labelIds'] = labelIds;
  }

  // Project -> projectId — resolve name to ID
  if (issue.project === null) {
    input['projectId'] = null;
  } else {
    const projectId = resolveNameToId(issue.project, refData.projects);
    if (projectId === null) {
      const valid = [...refData.projects.values()].sort().join(', ');
      errors.push(`unknown project "${issue.project}". Valid: ${valid}`);
    } else {
      input['projectId'] = projectId;
    }
  }

  return { input: input as unknown as IssueUpdateInput, errors };
}

/**
 * Resolve a human-readable name to its Linear UUID.
 * The map is id->name, so we reverse-search.
 */
function resolveNameToId(name: string, idToName: Map<string, string>): string | null {
  for (const [id, n] of idToName) {
    if (n === name) return id;
  }
  return null;
}

/**
 * Resolve an assignee display name to a user ID, detecting collisions (T5).
 */
function resolveAssignee(
  name: string,
  users: Map<string, string>,
): { id: string | null; error?: string } {
  const matches: string[] = [];
  for (const [id, displayName] of users) {
    if (displayName === name) matches.push(id);
  }

  if (matches.length === 0) {
    const valid = [...new Set(users.values())].sort().join(', ');
    return { id: null, error: `unknown assignee "${name}". Valid: ${valid}` };
  }
  if (matches.length > 1) {
    return { id: null, error: `assignee "${name}" matches multiple users` };
  }
  return { id: matches[0] };
}
