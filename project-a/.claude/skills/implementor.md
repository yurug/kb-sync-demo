---
name: implementor
description: Take an implementation task, execute it with Ralph Loop (implement, audit, fix, repeat until green). Enforce literate programming and comprehensive testing.
user_invocable: true
---

# Implementor

## What to do

You implement a specific task using the Ralph Loop pattern.

### Input
The user gives you a task description (e.g., "implement feature X" or "implement the Y module").

### Build Strategy: Vertical Slice First

If you are implementing the first step of the plan, you MUST produce a running CLI by the end.
Do NOT build bottom-up (types → errors → config → ... → commands). Instead, build a thin vertical
slice: entry point + commands + minimal types + simplified implementations. Then deepen in later steps.

The litmus test: `npx tsx src/index.ts --help` must show commands. A project that compiles but has
no registered commands is a failure, even if the types and error hierarchy are perfect.

### Ralph Loop Process

**Step 1 — Understand**
- Read `kb/INDEX.md` first, then follow `kb/indexes/by-task.md#implement` to load the right files for this task
- Read existing code in `src/` to understand the current state
- Read `kb/external/` for third-party SDK behavior (request cost model, lazy-loading, rate limits)
- Identify which properties from `kb/properties/` this task relates to

**Step 2 — Implement with Literate Style**

Write code that reads like a technical document:

- File header: what the module does, why it exists, what spec features it implements
- Every public function: complete JSDoc with @param (meaning, not just type), @returns, @throws, @invariant
- Every conditional: WHY this branch exists
- Every algorithm step: WHAT it accomplishes in the flow
- Every implicit assumption: documented
- Every trade-off: documented
- Every magic value: explained

Follow architecture patterns from `kb/architecture/overview.md`:
- Dependency injection (interfaces as parameters)
- Custom error types with userMessage
- Explicit types (no `any`, use `unknown` and narrow)
- Functions < 30 lines, files < 200 lines

**Module system (build-critical):**
- ESM project: ALL relative imports MUST use `.js` extension (`import { foo } from './bar.js'`)
- src/index.ts MUST start with `#!/usr/bin/env node`
- chalk v5, ora v8 (ESM versions) — do NOT use v4/v5 (CommonJS, will crash at runtime)

**Step 3 — Write Comprehensive Tests**

For each source file, write tests at multiple levels:

- **Unit tests**: test each function in isolation with mocked deps
- **Integration tests**: test how this module interacts with others
- **Edge case tests**: every T-entry from kb/properties/ files relevant to this module
- **Error path tests**: verify every error type is thrown correctly
- **Property tests**: if this module enforces a property (P1-P10), write a test proving it

Name every test with property reference: `"P4: mapper preserves all Linear fields"`
Group tests by property: `describe("P2: No data loss")`
Assertions must be specific values, not just truthy/falsy.

**Step 4 — Validate (all three MUST pass)**
1. `npx tsc --noEmit` — must compile with zero errors
2. `npx vitest run` — all tests must pass
3. `npx tsx src/index.ts --help` — must print help with all registered commands
If any of these fail, do NOT proceed to Step 5. Fix the issue first.

**Step 5 — Self-Audit**
- Check comment ratio >= 20%
- Check every public function has complete JSDoc
- Check every conditional has a WHY comment
- Check test count: at least 3 tests per source file

**Step 6 — Iterate**
- If Step 4 or 5 found issues, fix them and repeat
- Maximum 5 iterations. If still failing, report the blockers.

**Step 7 — Commit**
- Commit with a descriptive message referencing which properties this change relates to

## Output

The implemented code in `src/` and tests, committed to git.
