// Module: writer -- Write markdown files with canonical frontmatter field order
//
// This module serializes MarkdownIssue objects to markdown files with YAML
// frontmatter. It enforces the canonical field order from config-and-formats.md
// and appends extra user fields after the standard ones.
// It implements: P4 (extra fields appended), P1 (canonical ordering for stability).
// Key design decisions: manual frontmatter serialization (not gray-matter's dump)
// to enforce field order; extra fields in alphabetical order.

import { writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { MarkdownIssue } from '../types.js';
import { FRONTMATTER_FIELD_ORDER } from '../types.js';
import { FileSystemError } from '../errors.js';

/**
 * Write a MarkdownIssue to a file with canonical frontmatter field order.
 * Creates parent directories as needed.
 *
 * @param filePath - Destination file path
 * @param issue - MarkdownIssue to serialize
 * @returns The serialized file content (for hashing)
 * @throws {FileSystemError} When directory creation or file write fails
 * @invariant P1 — canonical field order ensures stable serialization
 * @invariant P4 — extra fields are appended after standard fields
 * @example
 * const content = await writeMarkdownFile('kb/ENG/ENG-123-fix.md', issue);
 */
export async function writeMarkdownFile(
  filePath: string,
  issue: MarkdownIssue,
): Promise<string> {
  const content = serializeMarkdownIssue(issue);

  try {
    // Ensure parent directory exists
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
  } catch (err: unknown) {
    throw new FileSystemError(
      `Failed to write ${filePath}: ${(err as Error).message}`,
      `Failed to write ${filePath}: ${(err as Error).message}`,
      { cause: err as Error },
    );
  }

  return content;
}

/**
 * Serialize a MarkdownIssue to a markdown string with YAML frontmatter.
 * Enforces canonical field order, appends extra fields alphabetically.
 *
 * @param issue - The issue to serialize
 * @returns Complete markdown file content
 */
export function serializeMarkdownIssue(issue: MarkdownIssue): string {
  const lines: string[] = ['---'];

  // Standard fields in canonical order
  const fieldValues: Record<string, unknown> = {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee,
    labels: issue.labels,
    team: issue.team,
    project: issue.project,
    url: issue.url,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };

  for (const field of FRONTMATTER_FIELD_ORDER) {
    lines.push(serializeField(field, fieldValues[field]));
  }

  // Extra user fields in alphabetical order
  const extraKeys = Object.keys(issue.extraFields).sort();
  for (const key of extraKeys) {
    lines.push(serializeField(key, issue.extraFields[key]));
  }

  lines.push('---');

  // Body: empty line then content, or just empty line for no description
  if (issue.body.length > 0) {
    lines.push('', issue.body);
  }

  // Ensure trailing newline
  return lines.join('\n') + '\n';
}

/**
 * Serialize a single frontmatter field to a YAML line.
 * Handles strings (quoted), numbers, arrays, null, and booleans.
 *
 * @param key - Field name
 * @param value - Field value
 * @returns YAML line (e.g., 'title: "Fix login bug"')
 */
function serializeField(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return `${key}: null`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${key}: ${value}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `${key}: []`;
    // Inline array for short lists, YAML flow style
    const items = value.map((v) => `"${String(v)}"`).join(', ');
    return `${key}: [${items}]`;
  }
  // String — always quote to avoid YAML parsing issues.
  // Escape backslashes and double quotes to prevent YAML injection and preserve roundtrip fidelity (P1).
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${key}: "${escaped}"`;
}

/**
 * Move a file to the trash directory (soft delete).
 * Preserves the filename for recovery.
 *
 * @param filePath - Source file path
 * @param trashDir - Trash directory path (e.g., ".kb-sync-trash/")
 * @throws {FileSystemError} When move fails
 * @invariant P2 — soft delete prevents data loss
 * @invariant P10 — deleted issues are recoverable
 */
export async function moveToTrash(
  filePath: string,
  trashDir: string,
): Promise<void> {
  try {
    await mkdir(trashDir, { recursive: true });
    const filename = filePath.split('/').pop() ?? filePath;
    const dest = join(trashDir, filename);
    await rename(filePath, dest);
  } catch (err: unknown) {
    throw new FileSystemError(
      `Failed to move ${filePath} to trash: ${(err as Error).message}`,
      `Failed to move ${filePath} to trash: ${(err as Error).message}`,
      { cause: err as Error },
    );
  }
}
