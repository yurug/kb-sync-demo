import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { KbSyncConfig, CONFIG_FILE } from './types.js';

export async function loadConfig(cwd: string = process.cwd()): Promise<KbSyncConfig> {
  const configPath = resolve(cwd, CONFIG_FILE);
  try {
    const raw = await readFile(configPath, 'utf-8');
    return JSON.parse(raw) as KbSyncConfig;
  } catch {
    throw new Error(
      `Config file not found: ${configPath}\nRun "kb-sync init" to create one.`
    );
  }
}

export async function saveConfig(config: KbSyncConfig, cwd: string = process.cwd()): Promise<void> {
  const configPath = resolve(cwd, CONFIG_FILE);
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export async function configExists(cwd: string = process.cwd()): Promise<boolean> {
  try {
    await access(resolve(cwd, CONFIG_FILE));
    return true;
  } catch {
    return false;
  }
}
