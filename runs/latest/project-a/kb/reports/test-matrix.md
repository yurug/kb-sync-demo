---
id: test-matrix
domain: reports
last-updated: 2026-03-25
related: [functional-props, non-functional-props, edge-cases]
---

# Test Matrix

## One-liner
Traceability matrix mapping every property and edge case to its covering tests.

## Summary

- **271 tests** across 24 test files
- **86.46% statement coverage** (target: >= 80%)
- All properties P1-P10, NF3-NF8, T1-T14, T16-T20 covered
- T15 (concurrent sync) documented as out of scope

---

## Functional Properties (P1-P10)

| Property | Description | Tests | Files |
|----------|-------------|-------|-------|
| P1 | Roundtrip fidelity | 5 | properties.test.ts, mapper.test.ts |
| P2 | No silent data loss | 3 | properties.test.ts, pull.test.ts |
| P3 | Config as source of truth | 5 | properties.test.ts, config.test.ts |
| P4 | Extra frontmatter preservation | 3 | properties.test.ts |
| P5 | ID-based matching | 2 | properties.test.ts |
| P6 | Conflict detection | 3 | properties.test.ts, state.test.ts |
| P7 | Pushable vs read-only fields | 4 | properties.test.ts, mapper-push.test.ts |
| P8 | Field validation before push | 4 | properties.test.ts, mapper-push.test.ts, push.test.ts |
| P9 | Incremental sync | 2 | properties.test.ts |
| P10 | Deletion safety | 2 | properties.test.ts |

## Non-Functional Properties (NF1-NF8)

| Property | Description | Tests | Files |
|----------|-------------|-------|-------|
| NF3 | Rate limit compliance | 5 | non-functional.test.ts, pagination.test.ts |
| NF4 | API key security | 2 | non-functional.test.ts |
| NF5 | Error message quality | 6 | non-functional.test.ts |
| NF6 | Progress feedback | 4 | progress.test.ts |
| NF7 | Graceful degradation | 1 | non-functional.test.ts |
| NF8 | Idempotency | 4 | non-functional.test.ts |

## Edge Cases (T1-T20)

| Edge Case | Description | Tests | Files |
|-----------|-------------|-------|-------|
| T1 | No description | 5 | edge-cases.test.ts, mapper.test.ts, reader.test.ts, writer.test.ts |
| T2 | Very long description | 3 | edge-cases.test.ts |
| T3 | Special chars in title | 5 | edge-cases.test.ts, mapper.test.ts |
| T4 | Title collision after slug | 1 | edge-cases.test.ts |
| T5 | Assignee name collision | 2 | edge-cases.test.ts, mapper-push.test.ts |
| T6 | Invalid status on push | 3 | edge-cases.test.ts, mapper-push.test.ts, push.test.ts |
| T7 | Missing id field | 2 | sync-engine.test.ts, change-detector.test.ts |
| T8 | Empty workspace | 2 | edge-cases.test.ts, pull.test.ts |
| T9 | First sync (no state) | 1 | edge-cases.test.ts |
| T10 | Corrupted state file | 3 | edge-cases.test.ts, state.test.ts |
| T11 | Malformed config | 6 | edge-cases.test.ts, config.test.ts |
| T12 | Expired API key | 3 | edge-cases.test.ts, errors.test.ts, init.test.ts |
| T13 | Network failure | 2 | edge-cases.test.ts |
| T14 | Rate limit during fetch | 4 | edge-cases.test.ts |
| T15 | Concurrent sync | — | Out of scope (documented) |
| T16 | kbDir doesn't exist | 2 | edge-cases.test.ts, scanner.test.ts |
| T17 | File renamed by user | 2 | edge-cases.test.ts, scanner.test.ts |
| T18 | Priority out of range | 4 | edge-cases.test.ts, mapper-push.test.ts |
| T19 | Unicode in team names | 2 | edge-cases.test.ts |
| T20 | Config already exists | 3 | edge-cases.test.ts, errors.test.ts, init.test.ts |

## Error Type Coverage

| Error Type | userMessage test | Cause chain test | File |
|------------|-----------------|------------------|------|
| ConfigError | errors.test.ts:55 | config.test.ts | errors.test.ts |
| AuthError | errors.test.ts:76 | non-functional.test.ts | errors.test.ts |
| ApiError | errors.test.ts:97 | pagination.test.ts | errors.test.ts |
| FileSystemError | errors.test.ts:108 | non-functional.test.ts | errors.test.ts |
| ConflictError | errors.test.ts:118 | non-functional.test.ts | errors.test.ts |
| ValidationError | errors.test.ts:126 | mapper-push.test.ts | errors.test.ts |

## Coverage by Source File

| Source File | Tests | Coverage |
|-------------|-------|----------|
| src/errors.ts | 6+ | 100% |
| src/types.ts | — | 100% (types only) |
| src/core/config.ts | 8 | 89% |
| src/core/state.ts | 6 | 100% |
| src/core/hasher.ts | 6 | 100% |
| src/core/mapper.ts | 8 | 100% |
| src/core/push-mapper.ts | 8 | 100% |
| src/core/change-detector.ts | 5 | 86% |
| src/core/sync-engine.ts | 12 | 100% |
| src/core/progress.ts | 4 | 100% |
| src/fs/reader.ts | 7 | 100% |
| src/fs/writer.ts | 6 | 85% |
| src/fs/scanner.ts | 5 | 97% |
| src/linear/client.ts | 4 | 58% |
| src/linear/pagination.ts | 15 | 97% |
| src/linear/issue-fetcher.ts | 4 | 100% |
| src/linear/resolver.ts | 4 | 100% |
| src/linear/ref-data.ts | — | 88% |
| src/commands/init.ts | 5 | 100% |
| src/commands/pull.ts | 13 | 88% |
| src/commands/push.ts | 5 | 100% |
| src/commands/status.ts | 4 | 97% |
| src/index.ts | 6 | 0% (entry point) |

## Agent notes
> This matrix was auto-generated during step 4 (Quality Audit).
> All P/NF/T references in test names are verified against the property definitions.
> T15 (concurrent sync) is intentionally excluded — see kb/properties/edge-cases.md.
