// Tests for src/commands/status-formatter.ts — output formatting

import { describe, it, expect, vi } from 'vitest';
import { printSection } from '../../src/commands/status-formatter.js';
import chalk from 'chalk';

describe('printSection', () => {
  it('prints "No changes" when all entries are empty', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    printSection('Test', [{ label: 'Modified', items: [], color: chalk.yellow }]);
    const calls = consoleSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('No changes'))).toBe(true);
    consoleSpy.mockRestore();
  });

  it('prints items when present', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    printSection('Test', [{
      label: 'Modified',
      items: ['file1.md', 'file2.md'],
      color: chalk.yellow,
    }]);
    const calls = consoleSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('file1.md'))).toBe(true);
    expect(calls.some(c => c.includes('file2.md'))).toBe(true);
    consoleSpy.mockRestore();
  });

  it('truncates after 10 items with "... and N more"', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const items = Array.from({ length: 15 }, (_, i) => `file-${i}.md`);
    printSection('Test', [{ label: 'Modified', items, color: chalk.yellow }]);
    const calls = consoleSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('5 more'))).toBe(true);
    // First 10 shown
    expect(calls.some(c => c.includes('file-0.md'))).toBe(true);
    expect(calls.some(c => c.includes('file-9.md'))).toBe(true);
    // 11th not shown directly
    expect(calls.some(c => c === '    file-10.md')).toBe(false);
    consoleSpy.mockRestore();
  });

  it('prints count in label', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    printSection('Test', [{
      label: 'New',
      items: ['a.md', 'b.md', 'c.md'],
      color: chalk.green,
    }]);
    const calls = consoleSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('3'))).toBe(true);
    consoleSpy.mockRestore();
  });
});
