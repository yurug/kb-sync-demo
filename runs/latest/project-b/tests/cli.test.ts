import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

describe('CLI', () => {
  let tempDir: string;
  const tsxBin = join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const entryPoint = join(process.cwd(), 'src', 'index.ts');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'kb-sync-cli-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should show help', async () => {
    const { stdout } = await exec(tsxBin, [entryPoint, '--help']);
    expect(stdout).toContain('kb-sync');
    expect(stdout).toContain('init');
    expect(stdout).toContain('pull');
    expect(stdout).toContain('push');
    expect(stdout).toContain('status');
  });

  it('should show version', async () => {
    const { stdout } = await exec(tsxBin, [entryPoint, '--version']);
    expect(stdout.trim()).toBe('0.1.0');
  });

  it('should init a config file', async () => {
    await exec(tsxBin, [entryPoint, 'init', '--api-key', 'test-key', '--team-id', 'team-1'], {
      cwd: tempDir,
    });

    const configPath = join(tempDir, '.kb-sync.json');
    const raw = await readFile(configPath, 'utf-8');
    const config = JSON.parse(raw);

    expect(config.linearApiKey).toBe('test-key');
    expect(config.teamId).toBe('team-1');
    expect(config.kbDir).toBe('kb');

    // Verify kb directory was created
    await expect(access(join(tempDir, 'kb'))).resolves.toBeUndefined();
  });

  it('should fail init without team-id', async () => {
    try {
      await exec(tsxBin, [entryPoint, 'init', '--api-key', 'test-key'], {
        cwd: tempDir,
      });
      expect.unreachable('Should have thrown');
    } catch (error: unknown) {
      const execError = error as { code: number };
      expect(execError.code).not.toBe(0);
    }
  });

  it('should fail pull without config', async () => {
    try {
      await exec(tsxBin, [entryPoint, 'pull'], { cwd: tempDir });
      expect.unreachable('Should have thrown');
    } catch (error: unknown) {
      const execError = error as { stderr: string };
      expect(execError.stderr || '').toBeTruthy();
    }
  });
});
