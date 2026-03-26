---
id: ux-audit
domain: reports
last-updated: 2026-03-25
related: [non-functional-props, api-contracts, error-taxonomy]
---

# UX Audit Report

## One-liner
Review of help text, error messages, colored output, progress indicators, exit codes, and dry-run labeling.

---

## Findings

### UX-1: Unexpected error shows full error object with stack trace [HIGH]

**Location:** `src/index.ts:57`
**Description:** `console.error('Unexpected error:', error)` dumps the full Error object including stack trace. Per NF5, users should never see stack traces.
**Fix:** Print `Unexpected error: <message>. This is a bug — please report it.`
**Severity:** HIGH (NF5 violation)

### UX-2: Push dry-run items show "[updated]" instead of "[dry-run]" [MEDIUM]

**Location:** `src/core/sync-engine.ts:155`
**Description:** In dry-run mode, processed files get `status: 'pushed'` which is rendered as `[updated]` in green. Users may not realize these are dry-run results without reading the summary line.
**Fix:** Use a distinct status like `'dry-run'` and render it differently (e.g., cyan `[dry-run]`).
**Severity:** MEDIUM

### UX-3: Push command has no "no changes" message [MEDIUM]

**Location:** `src/core/sync-engine.ts:67-68`
**Description:** When no modified files are found, `executePushLogic` returns an empty result silently. The push command shows `Push complete. 0 updated, 0 conflicts, 0 skipped.` which is fine but per the spec, this should be an info message.
**Fix:** Add explicit "No modified files to push." message when nothing is modified.
**Severity:** MEDIUM

### UX-4: Pull local-mod warning uses console.error but is not an error [LOW]

**Location:** `src/commands/pull.ts:56`
**Description:** Local modification warning is printed via `console.error()` which goes to stderr. This is correct for error-like messages, but the message itself doesn't use chalk coloring for visibility.
**Fix:** Use chalk.yellow for the warning message.
**Severity:** LOW

### UX-5: Help text and command descriptions [PASS]

**Description:** All 4 commands have proper descriptions. Options have help text. `--help` works correctly for all commands (verified by tests).
**Status:** PASS

### UX-6: Exit codes match spec [PASS]

**Description:** Exit 0 for success, 1 for errors, 2 for conflicts on push. Matches api-contracts.md.
**Status:** PASS

### UX-7: Progress indicators present [PASS]

**Description:** Pull and push commands use ora spinners. Status messages update during operations.
**Status:** PASS - NF6 compliant.

### UX-8: Colored output [PASS]

**Description:** Push uses chalk for colored status labels. Status command uses chalk for section headers and change categories.
**Status:** PASS

---

## Summary

| ID   | Severity | Status   |
|------|----------|----------|
| UX-1 | HIGH     | TO FIX   |
| UX-2 | MEDIUM   | TO FIX   |
| UX-3 | MEDIUM   | TO FIX   |
| UX-4 | LOW      | TO FIX   |
| UX-5 | PASS     | OK       |
| UX-6 | PASS     | OK       |
| UX-7 | PASS     | OK       |
| UX-8 | PASS     | OK       |
