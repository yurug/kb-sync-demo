import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import matter from 'gray-matter';
import { IssueFrontmatter, LocalIssue } from './types.js';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export function issueToMarkdown(fm: IssueFrontmatter, body: string = ''): string {
  const doc = matter.stringify(body || '', fm);
  return doc;
}

export async function writeIssueFile(
  kbDir: string,
  fm: IssueFrontmatter,
  body: string = '',
): Promise<string> {
  await mkdir(kbDir, { recursive: true });
  const filename = `${slugify(fm.title)}.md`;
  const filePath = join(kbDir, filename);
  const content = issueToMarkdown(fm, body);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

export async function readIssueFiles(kbDir: string): Promise<LocalIssue[]> {
  const absDir = resolve(kbDir);
  let entries: string[];
  try {
    entries = await readdir(absDir);
  } catch {
    return [];
  }

  const mdFiles = entries.filter(f => f.endsWith('.md'));
  const issues: LocalIssue[] = [];

  for (const file of mdFiles) {
    const filePath = join(absDir, file);
    const raw = await readFile(filePath, 'utf-8');
    const { data, content } = matter(raw);
    issues.push({
      frontmatter: data as IssueFrontmatter,
      content: content.trim(),
      filePath,
    });
  }

  return issues;
}
