// Tests for src/core/hasher.ts — content hashing

import { describe, it, expect } from 'vitest';
import { hashContent } from '../../src/core/hasher.js';

describe('P6: Content hashing for change detection', () => {
  it('P6: returns a 64-character hex string (SHA-256)', () => {
    const hash = hashContent('hello world');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('P6: same content produces same hash (deterministic)', () => {
    const content = '---\nid: abc\n---\nBody text here';
    expect(hashContent(content)).toBe(hashContent(content));
  });

  it('P6: different content produces different hash', () => {
    const hash1 = hashContent('version A');
    const hash2 = hashContent('version B');
    expect(hash1).not.toBe(hash2);
  });

  it('handles empty string', () => {
    const hash = hashContent('');
    expect(hash).toHaveLength(64);
  });

  it('handles unicode content', () => {
    const hash = hashContent('Developpement amelioration');
    expect(hash).toHaveLength(64);
  });

  it('whitespace differences produce different hashes', () => {
    const h1 = hashContent('hello world');
    const h2 = hashContent('hello  world');
    expect(h1).not.toBe(h2);
  });
});
