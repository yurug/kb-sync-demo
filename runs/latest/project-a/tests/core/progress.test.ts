// Tests for src/core/progress.ts — spinner-based progress feedback

import { describe, it, expect } from 'vitest';
import { createProgress, createSilentProgress } from '../../src/core/progress.js';

describe('NF6: Progress feedback', () => {
  it('NF6: createProgress returns a ProgressReporter with all methods', () => {
    const p = createProgress('test');
    expect(typeof p.update).toBe('function');
    expect(typeof p.succeed).toBe('function');
    expect(typeof p.fail).toBe('function');
    expect(typeof p.stop).toBe('function');
    // Clean up the spinner
    p.stop();
  });

  it('NF6: update changes spinner text without error', () => {
    const p = createProgress('starting...');
    p.update('in progress...');
    p.succeed('done');
    // No error means it works
  });

  it('NF6: fail stops spinner with failure indicator', () => {
    const p = createProgress('starting...');
    p.fail('something went wrong');
    // No error means it works
  });

  it('NF6: createSilentProgress is a no-op', () => {
    const p = createSilentProgress();
    p.update('ignored');
    p.succeed('ignored');
    p.fail('ignored');
    p.stop();
    // All no-ops — no error
  });
});
