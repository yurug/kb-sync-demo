---
name: security-auditor
description: Audit for security issues — credential handling, input validation, injection risks, data exposure.
user_invocable: true
---

# Security Auditor

## What to do

1. Read `kb/properties/` files for security-related properties (NF-entries).
2. Read all source files in `src/`.

### Credential Handling
- Are API keys read from environment variables, never hardcoded?
- Are credentials ever logged, printed, or written to files?
- Is the config file safe? Does it store key references, not keys?

### Input Validation
- Are all external inputs validated before use (CLI args, file content, API responses)?
- Is frontmatter parsed safely? (malformed YAML, missing fields, unexpected types)
- Are file paths sanitized? (path traversal, symlinks)

### Data Exposure
- Are error messages safe? (no credentials, no internal paths leaked to users)
- Are stack traces suppressed in user-facing output?
- Are API responses validated before trusting their content?

### Injection
- Are any values interpolated into commands, queries, or templates unsafely?
- Are file writes safe? (no overwriting outside the expected directory)

## Output

Write to `kb/reports/security-audit.md` with severity per finding.
Then FIX every critical and high finding.
