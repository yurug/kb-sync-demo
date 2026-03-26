// Tests for src/index.ts — CLI entry point
// Tests the error handler and command registration without actually running commander.

import { describe, it, expect, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const projectRoot = join(import.meta.dirname, '..');

describe('CLI entry point', () => {
  it('--help prints usage with all 4 commands', () => {
    const output = execSync('npx tsx src/index.ts --help', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(output).toContain('kb-sync');
    expect(output).toContain('init');
    expect(output).toContain('pull');
    expect(output).toContain('push');
    expect(output).toContain('status');
  });

  it('--version prints the version', () => {
    const output = execSync('npx tsx src/index.ts --version', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(output.trim()).toBe('0.1.0');
  });

  it('init --help shows init command description', () => {
    const output = execSync('npx tsx src/index.ts init --help', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(output).toContain('init');
    expect(output).toContain('Initialize');
  });

  it('pull --help shows --team and --force options', () => {
    const output = execSync('npx tsx src/index.ts pull --help', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(output).toContain('--team');
    expect(output).toContain('--force');
  });

  it('push --help shows --dry-run and --force options', () => {
    const output = execSync('npx tsx src/index.ts push --help', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(output).toContain('--dry-run');
    expect(output).toContain('--force');
  });

  it('exits with error when LINEAR_API_KEY is not set', () => {
    try {
      execSync('npx tsx src/index.ts init', {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 10000,
        env: { ...process.env, LINEAR_API_KEY: '' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const e = err as { stderr: string; status: number };
      expect(e.stderr).toContain('LINEAR_API_KEY');
    }
  });
});
