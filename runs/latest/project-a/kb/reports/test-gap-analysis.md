---
id: test-gap-analysis
domain: reports
last-updated: 2026-03-25
related: [functional-props, non-functional-props, edge-cases, testing-strategy]
---

# Test Gap Analysis

## Summary

- **Source files:** 26
- **Test files:** 24
- **Existing tests:** 271 (all passing)
- **Source files missing dedicated test files:** 2 (ref-data.ts, pull-helpers.ts, status-formatter.ts)
- **Average tests per source file:** ~10.4 (target: >= 3) - MET

## Property Coverage (P1-P10)

| Property | Tested? | Happy Path | Edge Case | Gaps |
|----------|---------|------------|-----------|------|
| P1: Roundtrip fidelity | Yes | 5+ tests | Yes (null, labels) | Missing: property-based test with randomized issues |
| P2: No data loss | Yes | 3 tests | Partial | Missing: pull with local mods aborts test, deleted files go to trash (integration) |
| P3: Config source of truth | Yes | 3+ tests | Yes | Adequate |
| P4: Extra frontmatter | Yes | 4+ tests | Yes | Adequate |
| P5: ID-based matching | Yes | 3+ tests | T17 covered | Adequate |
| P6: Conflict detection | Yes | 4+ tests | --force override | Missing: "neither changed" case explicitly |
| P7: Pushable vs read-only | Yes | 3+ tests | null cases | Adequate |
| P8: Field validation | Yes | 6+ tests | T6, T18 covered | Adequate |
| P9: Incremental sync | Yes | 2 tests | - | Missing: compare incremental vs full pull result |
| P10: Deletion safety | Yes | 2 tests | Incomplete fetch | Missing: partial fetch failure on specific page, verify no files deleted |

## Edge Case Coverage (T1-T20)

| Edge Case | Tested? | Gaps |
|-----------|---------|------|
| T1: No description | Yes (3 tests) | - |
| T2: Long description >100KB | Yes (3 tests) | - |
| T3: Special chars in title | Yes (4 tests) | - |
| T4: Title collision | Yes (1 test) | - |
| T5: Assignee collision | Yes (2 tests) | - |
| T6: Invalid status | Yes (2+ tests) | - |
| T7: Missing id field | Yes (2 tests) | - |
| T8: Empty workspace | Yes (2 tests) | - |
| T9: First sync | Yes (1 test) | - |
| T10: Corrupted state | Yes (3 tests) | - |
| T11: Malformed config | Yes (5+ tests) | - |
| T12: Expired API key | Yes (3 tests) | - |
| T13: Network failure | Yes (2 tests) | Missing: pagination stops, no deletions occur |
| T14: Rate limit | Yes (4 tests) | Missing: mock 429 on page 3, verify eventual success |
| T15: Concurrent pull/push | N/A (out of scope) | - |
| T16: kbDir doesn't exist | Yes (2 tests) | - |
| T17: File renamed | Yes (2 tests) | - |
| T18: Priority out of range | Yes (3 tests) | - |
| T19: Unicode in names | Yes (2 tests) | - |
| T20: Config exists on init | Yes (3 tests) | - |

## Error Type Coverage

| Error Type | Tested? | Gaps |
|------------|---------|------|
| KbSyncError | Yes | - |
| ConfigError | Yes (5+ tests) | - |
| AuthError | Yes (3+ tests) | - |
| ApiError | Yes (2+ tests) | Missing: all-retries-exhausted path with sequence |
| FileSystemError | Yes (2 tests) | Missing: write failure test |
| ConflictError | Yes (2+ tests) | - |
| ValidationError | Yes (3+ tests) | - |

## Missing Test Categories

### 1. Unit Tests (missing source file coverage)
- `src/linear/ref-data.ts` - no dedicated test file
- `src/commands/pull-helpers.ts` - no dedicated test file
- `src/commands/status-formatter.ts` - no dedicated test file

### 2. Integration Tests
- No integration tests with real Linear API (requires LINEAR_API_KEY)
- Missing: init connects and verifies workspace
- Missing: pull fetches at least one issue

### 3. End-to-End Tests
- No full CLI workflow test: init -> pull -> modify -> push -> verify
- Missing: dry-run workflow
- Missing: status after modifications

### 4. Property-Based Tests
- No randomized input tests
- Missing: P1 roundtrip with random valid issues
- Missing: slugify with random Unicode strings

### 5. Specific Gaps
- T13: No test that pagination stops and no deletions occur after network failure on page N
- T14: No test mocking 429 on a specific page then succeeding after backoff
- NF8: No test verifying pull twice writes zero files on second run (idempotency at command level)
- P10: No test for partial fetch failure with specific page failure causing fetchWasComplete=false

## Recommended New Test Files

1. `tests/linear/ref-data.test.ts` - unit tests for fetchAllReferenceData
2. `tests/commands/pull-helpers.test.ts` - unit tests for detectLocalMods, detectAndTrashDeleted
3. `tests/commands/status-formatter.test.ts` - unit tests for printSection
4. `tests/integration.test.ts` - real Linear API integration tests
5. `tests/e2e.test.ts` - full CLI workflow end-to-end tests
6. `tests/property-based.test.ts` - randomized property-based tests
