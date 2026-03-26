import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, configExists } from '../src/config.js';
import { KbSyncConfig } from '../src/types.js';

describe('config', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'kb-sync-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should report config does not exist in empty dir', async () => {
    expect(await configExists(tempDir)).toBe(false);
  });

  it('should save and load config', async () => {
    const config: KbSyncConfig = {
      linearApiKey: 'test-key',
      teamId: 'team-123',
      kbDir: 'kb',
    };

    await saveConfig(config, tempDir);
    expect(await configExists(tempDir)).toBe(true);

    const loaded = await loadConfig(tempDir);
    expect(loaded).toEqual(config);
  });

  it('should throw on missing config', async () => {
    await expect(loadConfig(tempDir)).rejects.toThrow('Config file not found');
  });

  it('should save config as formatted JSON', async () => {
    const config: KbSyncConfig = {
      linearApiKey: 'key',
      teamId: 'team',
      kbDir: 'kb',
    };
    await saveConfig(config, tempDir);
    const raw = await readFile(join(tempDir, '.kb-sync.json'), 'utf-8');
    expect(raw).toContain('\n');
    expect(raw.endsWith('\n')).toBe(true);
  });
});
