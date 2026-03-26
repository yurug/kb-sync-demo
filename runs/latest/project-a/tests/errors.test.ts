// Tests for src/errors.ts — error hierarchy and userMessage behavior

import { describe, it, expect } from 'vitest';
import {
  KbSyncError,
  ConfigError,
  AuthError,
  ApiError,
  FileSystemError,
  ConflictError,
  ValidationError,
} from '../src/errors.js';

describe('KbSyncError hierarchy', () => {
  it('KbSyncError has message and userMessage', () => {
    const err = new KbSyncError('technical detail', 'User-facing message');
    expect(err.message).toBe('technical detail');
    expect(err.userMessage).toBe('User-facing message');
    expect(err.name).toBe('KbSyncError');
    expect(err).toBeInstanceOf(Error);
  });

  it('KbSyncError preserves cause chain', () => {
    const cause = new Error('original');
    const err = new KbSyncError('wrapped', 'user msg', { cause });
    expect((err as unknown as { cause: Error }).cause).toBe(cause);
  });

  it('all subtypes extend KbSyncError', () => {
    const errors = [
      new ConfigError('m', 'u'),
      new AuthError('m', 'u'),
      new ApiError('m', 'u'),
      new FileSystemError('m', 'u'),
      new ConflictError('m', 'u'),
      new ValidationError('m', 'u'),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(KbSyncError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});

describe('ConfigError', () => {
  it('has correct name and userMessage', () => {
    const err = new ConfigError(
      'Missing version',
      '.kb-sync.json is invalid: missing required field \'version\'.',
    );
    expect(err.name).toBe('ConfigError');
    expect(err.userMessage).toContain('missing required field');
  });

  it('T20: config already exists userMessage', () => {
    const err = new ConfigError(
      'Config already exists',
      '.kb-sync.json already exists. Delete it first to re-initialize.',
    );
    expect(err.userMessage).toContain('already exists');
    expect(err.userMessage).toContain('Delete it first');
  });
});

describe('AuthError', () => {
  it('has correct name and userMessage for missing key', () => {
    const err = new AuthError(
      'LINEAR_API_KEY not set',
      'LINEAR_API_KEY environment variable is not set. Export it and try again.',
    );
    expect(err.name).toBe('AuthError');
    expect(err.userMessage).toContain('LINEAR_API_KEY');
    expect(err.userMessage).toContain('Export it');
  });

  it('T12: invalid API key userMessage', () => {
    const err = new AuthError(
      'API key invalid',
      'Linear API key is invalid or expired. Check your LINEAR_API_KEY.',
    );
    expect(err.userMessage).toContain('invalid or expired');
  });
});

describe('ApiError', () => {
  it('has correct name and preserves cause', () => {
    const cause = new Error('network timeout');
    const err = new ApiError('timeout', 'Linear API request timed out.', { cause });
    expect(err.name).toBe('ApiError');
    expect((err as unknown as { cause: Error }).cause).toBe(cause);
  });

  it('rate limit userMessage includes retry info', () => {
    const err = new ApiError(
      'Rate limited',
      'Linear API failed after 5 retries. Last error: 429 Too Many Requests',
    );
    expect(err.userMessage).toContain('5 retries');
  });
});

describe('FileSystemError', () => {
  it('includes file path in userMessage', () => {
    const err = new FileSystemError(
      'EACCES',
      'Failed to read kb/ENG/ENG-123-fix-login.md: EACCES permission denied',
    );
    expect(err.name).toBe('FileSystemError');
    expect(err.userMessage).toContain('ENG-123');
  });
});

describe('ConflictError', () => {
  it('conflict userMessage includes identifier', () => {
    const err = new ConflictError(
      'Conflict on ENG-123',
      'Conflict: ENG-123 was modified on Linear since last sync. Pull first or use --force.',
    );
    expect(err.name).toBe('ConflictError');
    expect(err.userMessage).toContain('ENG-123');
    expect(err.userMessage).toContain('Pull first');
  });
});

describe('ValidationError', () => {
  it('T6: invalid status userMessage includes valid alternatives', () => {
    const err = new ValidationError(
      'Unknown status',
      'Skipping ENG-123: unknown status \'Donee\' (valid: Todo, In Progress, Done, Cancelled)',
    );
    expect(err.name).toBe('ValidationError');
    expect(err.userMessage).toContain('Donee');
    expect(err.userMessage).toContain('valid:');
  });

  it('T7: missing id userMessage', () => {
    const err = new ValidationError(
      'Missing id',
      'Skipping kb/ENG/ENG-123.md: missing required field \'id\'',
    );
    expect(err.userMessage).toContain('missing required field');
  });
});
