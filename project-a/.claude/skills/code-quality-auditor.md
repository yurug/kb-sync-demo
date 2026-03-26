---
name: code-quality-auditor
description: Audit source code for literate programming quality, contracts, architecture compliance, and code clarity. Fix all findings.
user_invocable: true
---

# Code Quality Auditor

## What to do

1. Read all source files in `src/`.
2. Read `kb/architecture/overview.md` for the expected module structure and design patterns.
3. Read `CLAUDE.md` for the mandatory quality standards.
4. Evaluate every file against the criteria below.

### Literate Programming (the most important criterion)

For each file, check:
- Does it have a file header explaining what the module does, why it exists, and what spec features it implements?
- Does every public function have complete JSDoc (@param with meaning, @returns, @throws, @invariant)?
- Does every conditional branch have a comment explaining WHY this case exists?
- Does every algorithm step have a comment explaining WHAT it accomplishes?
- Are implicit assumptions documented? (e.g., "we assume the config has been validated at this point")
- Are trade-offs documented? (e.g., "we use last-modified-wins instead of three-way merge because...")
- Are magic values explained? (e.g., "50 items per page — Linear API maximum")
- Would someone unfamiliar with the codebase understand the intent by reading the code?

Common failures:
- `@param config - the config` — this is useless. Say what the config must contain and how it's used.
- `// loop through items` — this describes WHAT, not WHY. Say why we're iterating and what we expect to find.
- No comment on error handling branches — explain what error condition this catches and how recovery works.
- No comment on early returns — explain what shortcut this is and why it's safe.

### Contracts
- Are preconditions documented in @param? ("must be a non-empty string", "must have been validated")
- Are postconditions documented? ("returns a sorted array", "never returns null")
- Does every function that can fail document its error types in @throws?

### Architecture
- Does the module structure match `kb/architecture/overview.md`?
- Is dependency injection used consistently?
- Are module boundaries respected (no reaching into other module internals)?
- No circular imports?

### Code Clarity
- Functions < 30 lines? Files < 200 lines?
- No `any` types?
- Meaningful variable names?
- No dead code, no commented-out code?

### Comment Ratio
- Target: >= 20% (comments + JSDoc lines / total lines)
- Compute and report the actual ratio.

## Output

Write to `kb/reports/code-quality-audit.md` with specific findings citing file:line.
Then FIX every finding. Do not just report — fix.
