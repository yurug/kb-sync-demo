// Module: reader -- Parse markdown files with frontmatter using gray-matter
//
// This module reads local markdown files and parses them into MarkdownIssue
// objects. It uses the gray-matter library for YAML frontmatter extraction.
// Extra frontmatter fields (user-added) are separated from standard fields
// to support P4 (extra frontmatter preservation).
// It implements: P4, P5 (ID-based matching via parsed id field).
// Key design decisions: gray-matter for parsing, explicit field extraction.

import { readFile } from 'node:fs/promises';
import matter from 'gray-matter';
import type { MarkdownIssue } from '../types.js';
import { FRONTMATTER_FIELD_ORDER } from '../types.js';
import { FileSystemError } from '../errors.js';

/** Set of standard frontmatter field names for quick lookup. */
const STANDARD_FIELDS = new Set<string>(FRONTMATTER_FIELD_ORDER);

/**
 * Read and parse a markdown file into a MarkdownIssue.
 *
 * @param filePath - Absolute or relative path to the .md file
 * @returns Parsed MarkdownIssue with standard and extra fields separated
 * @throws {FileSystemError} When the file cannot be read
 * @invariant P4 — extra fields are extracted into extraFields, never discarded
 * @example
 * const issue = await readMarkdownFile('kb/ENG/ENG-123-fix-login.md');
 * console.log(issue.id, issue.title, issue.extraFields);
 */
export async function readMarkdownFile(filePath: string): Promise<MarkdownIssue> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    throw new FileSystemError(
      `Failed to read ${filePath}: ${(err as Error).message}`,
      `Failed to read ${filePath}: ${(err as Error).message}`,
      { cause: err as Error },
    );
  }

  return parseMarkdownContent(raw);
}

/**
 * Parse raw markdown content (with frontmatter) into a MarkdownIssue.
 * Separates standard fields from user-added extra fields.
 *
 * @param content - Raw file content including YAML frontmatter
 * @returns Parsed MarkdownIssue
 */
export function parseMarkdownContent(content: string): MarkdownIssue {
  const { data, content: body } = matter(content);

  // Separate standard fields from extra user-added fields
  const extraFields: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (!STANDARD_FIELDS.has(key)) {
      extraFields[key] = data[key];
    }
  }

  return {
    id: String(data['id'] ?? ''),
    identifier: String(data['identifier'] ?? ''),
    title: String(data['title'] ?? ''),
    status: String(data['status'] ?? ''),
    priority: typeof data['priority'] === 'number' ? data['priority'] : 0,
    assignee: data['assignee'] != null ? String(data['assignee']) : null,
    labels: Array.isArray(data['labels']) ? data['labels'].map(String) : [],
    team: String(data['team'] ?? ''),
    project: data['project'] != null ? String(data['project']) : null,
    url: String(data['url'] ?? ''),
    createdAt: String(data['createdAt'] ?? ''),
    updatedAt: String(data['updatedAt'] ?? ''),
    body: body.trim(),
    extraFields,
  };
}
