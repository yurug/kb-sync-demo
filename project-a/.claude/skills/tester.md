---
name: tester
description: Continuously report the gap between implementation, spec, and PRD. Write and maintain tests.
user_invocable: true
---

# Tester

## What to do

1. Read `kb/spec/` files for feature requirements.
2. Read `kb/properties/` files for correctness properties and edge cases.
3. Read existing tests in the test directory.
4. Read existing code in `src/`.

### Gap Analysis
For each feature in the spec:
- Is it implemented? (check `src/`)
- Is it tested? (check the test directory)
- Does the test actually verify the spec behavior? (read the test logic)

For each property in `kb/properties/` files:
- Is there a test that verifies it?
- Is the test correct (does it actually check the invariant)?

For each edge case listed in `kb/properties/` files:
- Is there a test for it?

### Write Missing Tests
- Write tests for any gaps found
- Use descriptive test names that reference the property being tested
- Use the project's testing framework conventions
- Mock external API clients for unit tests
- Use real file system operations for integration tests (with temp directories)

### Test Organization
- One test file per source module (matching test file for each source file)
- Group tests by property or feature using the framework's grouping mechanism
- Put shared fixtures in a dedicated fixtures directory

## Output

Write to `kb/reports/test-gap-analysis.md` with the gap analysis.
Write new test files to the test directory.
