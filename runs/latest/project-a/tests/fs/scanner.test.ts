// Tests for src/fs/scanner.ts — directory scanning and ID indexing

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanDirectory } from '../../src/fs/scanner.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-scanner-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

describe('P5: ID-based matching', () => {
  it('P5: builds id->path index from frontmatter', async () => {
    const kbDir = join(testDir, 'kb');
    const teamDir = join(kbDir, 'ENG');
    await mkdir(teamDir, { recursive: true });

    await writeFile(join(teamDir, 'ENG-1-foo.md'), '---\nid: "uuid-1"\n---\nBody');
    await writeFile(join(teamDir, 'ENG-2-bar.md'), '---\nid: "uuid-2"\n---\nBody');

    const index = await scanDirectory(kbDir);
    expect(index.size).toBe(2);
    expect(index.get('uuid-1')).toContain('ENG-1-foo.md');
    expect(index.get('uuid-2')).toContain('ENG-2-bar.md');
  });

  it('P5: finds files in nested team directories', async () => {
    const engDir = join(testDir, 'kb', 'ENG');
    const desDir = join(testDir, 'kb', 'DES');
    await mkdir(engDir, { recursive: true });
    await mkdir(desDir, { recursive: true });

    await writeFile(join(engDir, 'ENG-1.md'), '---\nid: "eng-uuid"\n---\n');
    await writeFile(join(desDir, 'DES-1.md'), '---\nid: "des-uuid"\n---\n');

    const index = await scanDirectory(join(testDir, 'kb'));
    expect(index.size).toBe(2);
    expect(index.has('eng-uuid')).toBe(true);
    expect(index.has('des-uuid')).toBe(true);
  });

  it('T17: renamed file still found by ID', async () => {
    const kbDir = join(testDir, 'kb', 'ENG');
    await mkdir(kbDir, { recursive: true });

    // File renamed by user, but id still matches
    await writeFile(join(kbDir, 'my-custom-name.md'), '---\nid: "uuid-123"\n---\nBody');

    const index = await scanDirectory(join(testDir, 'kb'));
    expect(index.get('uuid-123')).toContain('my-custom-name.md');
  });
});

describe('Scanner edge cases', () => {
  it('T16: returns empty map when directory does not exist', async () => {
    const index = await scanDirectory(join(testDir, 'nonexistent'));
    expect(index.size).toBe(0);
  });

  it('skips files without id field', async () => {
    const kbDir = join(testDir, 'kb');
    await mkdir(kbDir, { recursive: true });

    // File without id
    await writeFile(join(kbDir, 'no-id.md'), '---\ntitle: "No ID"\n---\nBody');
    // File with id
    await writeFile(join(kbDir, 'has-id.md'), '---\nid: "uuid-1"\n---\nBody');

    const index = await scanDirectory(kbDir);
    expect(index.size).toBe(1);
    expect(index.has('uuid-1')).toBe(true);
  });

  it('skips non-markdown files', async () => {
    const kbDir = join(testDir, 'kb');
    await mkdir(kbDir, { recursive: true });

    await writeFile(join(kbDir, 'readme.txt'), 'not markdown');
    await writeFile(join(kbDir, 'test.md'), '---\nid: "uuid-1"\n---\n');

    const index = await scanDirectory(kbDir);
    expect(index.size).toBe(1);
  });

  it('handles empty directory', async () => {
    const kbDir = join(testDir, 'kb');
    await mkdir(kbDir, { recursive: true });

    const index = await scanDirectory(kbDir);
    expect(index.size).toBe(0);
  });
});
