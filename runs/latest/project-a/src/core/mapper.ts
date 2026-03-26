// Module: mapper -- Converts between LinearIssue and MarkdownIssue
//
// This module handles the transformation between the Linear API's data format
// and the local markdown file format. For Step 1, only the pull direction
// (LinearIssue -> MarkdownIssue) is implemented. Push direction comes in Step 2.
// It implements: P1 (roundtrip fidelity), P4 (extra frontmatter preservation).
// Key design decisions: explicit field mapping (no dynamic copying), canonical
// field order for stable serialization.

import type { LinearIssue, MarkdownIssue } from '../types.js';

// Re-export push-direction mapping from the dedicated module
export { markdownToLinearUpdate } from './push-mapper.js';
export type { PushValidationResult } from './push-mapper.js';

/**
 * Convert a LinearIssue (from API) to a MarkdownIssue (for local file).
 * Pull direction: Linear is authoritative.
 *
 * @param issue - Linear issue with all relations resolved to names
 * @param extraFields - User-added frontmatter fields to preserve (from existing file)
 * @returns MarkdownIssue ready to be serialized to a file
 * @invariant P1 — mapping must be lossless so pull->push produces zero mutations
 * @invariant P4 — extraFields are merged in, never lost
 * @example
 * const md = linearToMarkdown(issue, { notes: 'my annotation' });
 */
export function linearToMarkdown(
  issue: LinearIssue,
  extraFields: Record<string, unknown> = {},
): MarkdownIssue {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    status: issue.statusName,
    // priority is a number 0-4, preserved as-is for roundtrip fidelity
    priority: issue.priority,
    assignee: issue.assigneeName,
    // labels are sorted alphabetically for stable output
    labels: [...issue.labelNames].sort(),
    team: issue.teamName,
    project: issue.projectName,
    url: issue.url,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    // null description becomes empty string for the file body
    body: issue.description ?? '',
    // Preserve any user-added frontmatter fields
    extraFields,
  };
}

/**
 * Build a filesystem-safe filename from issue metadata.
 * Pattern: <identifier>-<slugified-title>.md
 *
 * @param identifier - Issue identifier (e.g., "ENG-123")
 * @param title - Issue title to slugify
 * @returns Slugified filename (without directory path)
 * @invariant P5 — identifier prefix guarantees uniqueness
 * @example
 * buildFilename('ENG-123', 'Fix: crash on /api/v2 (urgent!)')
 * // => 'ENG-123-fix-crash-on-api-v2-urgent.md'
 */
export function buildFilename(identifier: string, title: string): string {
  const slug = slugify(title);
  return `${identifier}-${slug}.md`;
}

/**
 * Slugify a title string for use in filenames.
 * Rules (from data-model.md):
 * 1. Lowercase
 * 2. Replace non-alphanumeric with hyphens
 * 3. Collapse consecutive hyphens
 * 4. Trim to 80 characters
 * 5. Remove trailing hyphens
 *
 * @param title - Raw title string
 * @returns Filesystem-safe slug
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // non-alphanumeric -> hyphens
    .replace(/-+/g, '-')          // collapse consecutive hyphens
    .slice(0, 80)                 // max 80 characters
    .replace(/-$/, '');           // remove trailing hyphen
}

/**
 * Build the full relative file path for a given issue.
 * Pattern: <kbDir>/<teamKey>/<identifier>-<slug>.md
 *
 * @param kbDir - Knowledge base directory path
 * @param teamKey - Team key (e.g., "ENG")
 * @param identifier - Issue identifier (e.g., "ENG-123")
 * @param title - Issue title (will be slugified)
 * @returns Full relative path for the markdown file
 */
export function buildFilePath(
  kbDir: string,
  teamKey: string,
  identifier: string,
  title: string,
): string {
  const filename = buildFilename(identifier, title);
  return `${kbDir}/${teamKey}/${filename}`;
}

