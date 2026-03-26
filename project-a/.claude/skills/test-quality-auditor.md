---
name: test-quality-auditor
description: Audit test suite for multi-level coverage, property traceability, edge cases, and test quality. Fill all gaps.
user_invocable: true
---

# Test Quality Auditor

## What to do

1. Read `kb/properties/` files — every property (P, NF, T) must be tested.
2. Read `kb/spec/` files — every feature must have corresponding tests.
3. Read all test files.
4. Read all source files to identify untested paths.

### Test Level Coverage

Check that ALL levels exist:

**Unit tests** — for every source file `src/X/Y.ts`, there must be `tests/X/Y.test.ts`:
- Test individual functions in isolation
- Mock all dependencies
- Cover happy path + error paths

**Integration tests** — test module interactions:
- Sync engine + file system + mapper working together
- Pull/push flows with mocked API but real file operations (temp dirs)
- Config loading + API client initialization

**End-to-end tests** — test complete CLI commands:
- Full workflow: init → pull → modify file → push → verify
- Status command showing correct states after various operations
- Dry-run producing correct preview

**Property-based tests** — for critical invariants:
- Roundtrip: for any valid issue data, pull then push produces identical state
- Idempotency: running any command twice produces identical result
- Bijection: for any valid frontmatter, mapping to Linear and back preserves all fields
- Use randomized inputs where possible

**Edge case tests** — every T-entry from kb/properties/ files:
- Empty inputs (no files, no issues, empty workspace)
- Unicode in all text fields
- Very long descriptions
- Malformed frontmatter
- Missing required fields
- Concurrent modification scenarios

**Error path tests** — every custom error type:
- Verify error is thrown with correct type
- Verify userMessage is human-readable
- Verify no stack traces leak to user output

### Property Traceability

For each property in kb/properties/ files:
- List which test(s) verify it
- Each property must have at least 2 tests (happy path + edge case)
- Test names must start with the property ID: `"P4: mapping preserves all fields"`
- Group related tests in describe blocks: `describe("P2: No data loss")`

Create a traceability matrix:
```
| Property | Tests | Coverage |
|----------|-------|----------|
| P1 | roundtrip.test.ts:L15, roundtrip.test.ts:L42 | 2 tests |
| P2 | conflict.test.ts:L8, conflict.test.ts:L25 | 2 tests |
...
```

### Test Quality

- Assertions must be specific: `expect(result.title).toBe("Expected Title")` not just `expect(result).toBeTruthy()`
- Each test tests ONE thing
- Test names describe the behavior being verified, not the implementation
- Shared fixtures in tests/fixtures/ — no inline large data blobs
- Typed mocks that match the real interface

### Metrics

- Target: coverage >= 80%
- Target: at least 3 tests per source file on average
- Target: 0 properties without tests

## Output

Write to `kb/reports/test-quality-audit.md` with:
1. Test level coverage (which levels exist, which are missing)
2. Property traceability matrix
3. Specific gaps with suggested tests
Then WRITE the missing tests. Do not just report — fix.
