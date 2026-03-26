// Module: scanner -- Scan kbDir for markdown files and build id->path index
//
// This module walks the knowledge base directory, parses each markdown file's
// frontmatter to extract the `id` field, and builds a Map<id, path> index.
// This index is critical for P5 (ID-based matching) — files are found by
// their frontmatter id, not by filename.
// It implements: P5 (ID-based matching, not filename-based).
// Key design decisions: only reads frontmatter (not full body) for speed,
// skips files without `id` field silently.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';

/**
 * Scan a directory recursively for .md files and build an id→path index.
 * Only files with a valid `id` frontmatter field are included.
 *
 * @param dir - Root directory to scan (the kbDir)
 * @returns Map from issue UUID to file path
 * @invariant P5 — enables finding files by id, not by filename
 * @example
 * const index = await scanDirectory('kb');
 * const filePath = index.get('abc-123-uuid'); // => 'kb/ENG/ENG-123-fix.md'
 */
export async function scanDirectory(dir: string): Promise<Map<string, string>> {
  const idToPath = new Map<string, string>();

  // Walk directory tree to find all .md files
  const mdFiles = await findMarkdownFiles(dir);

  // Parse frontmatter of each file to extract the id
  for (const filePath of mdFiles) {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const { data } = matter(raw);
      const id = data['id'];
      // Only index files that have a valid string id
      if (typeof id === 'string' && id.length > 0) {
        idToPath.set(id, filePath);
      }
    } catch {
      // Skip files that can't be read or parsed — don't block the scan
    }
  }

  return idToPath;
}

/**
 * Recursively find all .md files in a directory.
 *
 * @param dir - Directory to search
 * @returns Array of absolute or relative file paths
 */
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // Directory doesn't exist — return empty (T16: kbDir doesn't exist yet)
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Recurse into subdirectories (team directories)
      const subFiles = await findMarkdownFiles(fullPath);
      results.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}
