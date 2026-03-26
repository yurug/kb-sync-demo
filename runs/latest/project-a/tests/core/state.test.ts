// Tests for src/core/state.ts — sync state read/write/update

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readState, writeState, updateStateEntry, removeStateEntry } from '../../src/core/state.js';
import type { SyncState } from '../../src/types.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'kb-sync-state-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

describe('P6: State tracking for conflict detection', () => {
  it('P6: readState returns empty state when file is missing (T9)', async () => {
    const state = await readState(testDir);
    expect(state.issues).toEqual({});
  });

  it('P6: readState parses a valid state file', async () => {
    const stateData: SyncState = {
      issues: {
        'abc-123': { updatedAt: '2026-01-01T00:00:00.000Z', contentHash: 'aaa' },
      },
    };
    await writeFile(join(testDir, '.kb-sync-state.json'), JSON.stringify(stateData));
    const result = await readState(testDir);
    expect(result.issues['abc-123'].updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.issues['abc-123'].contentHash).toBe('aaa');
  });

  it('P6: writeState -> readState roundtrip', async () => {
    const state: SyncState = {
      issues: {
        'id-1': { updatedAt: '2026-03-25T10:00:00.000Z', contentHash: 'h1' },
        'id-2': { updatedAt: '2026-03-25T11:00:00.000Z', contentHash: 'h2' },
      },
    };
    await writeState(testDir, state);
    const result = await readState(testDir);
    expect(result).toEqual(state);
  });
});

describe('T10: Corrupted state file', () => {
  it('T10: returns empty state on invalid JSON', async () => {
    await writeFile(join(testDir, '.kb-sync-state.json'), 'not json at all!!!');
    const state = await readState(testDir);
    expect(state.issues).toEqual({});
  });

  it('T10: returns empty state on unexpected structure', async () => {
    await writeFile(join(testDir, '.kb-sync-state.json'), JSON.stringify({ foo: 'bar' }));
    const state = await readState(testDir);
    expect(state.issues).toEqual({});
  });
});

describe('updateStateEntry', () => {
  it('adds a new entry immutably', () => {
    const state: SyncState = { issues: {} };
    const updated = updateStateEntry(state, 'abc', '2026-01-01T00:00:00Z', 'hash1');
    expect(updated.issues['abc']).toEqual({
      updatedAt: '2026-01-01T00:00:00Z',
      contentHash: 'hash1',
    });
    // Original unchanged
    expect(state.issues['abc']).toBeUndefined();
  });

  it('updates an existing entry immutably', () => {
    const state: SyncState = {
      issues: { 'abc': { updatedAt: 'old', contentHash: 'old' } },
    };
    const updated = updateStateEntry(state, 'abc', 'new', 'new-hash');
    expect(updated.issues['abc'].updatedAt).toBe('new');
    expect(state.issues['abc'].updatedAt).toBe('old');
  });
});

describe('removeStateEntry', () => {
  it('removes an entry immutably', () => {
    const state: SyncState = {
      issues: {
        'a': { updatedAt: 't1', contentHash: 'h1' },
        'b': { updatedAt: 't2', contentHash: 'h2' },
      },
    };
    const updated = removeStateEntry(state, 'a');
    expect(updated.issues['a']).toBeUndefined();
    expect(updated.issues['b']).toBeDefined();
    // Original unchanged
    expect(state.issues['a']).toBeDefined();
  });
});
