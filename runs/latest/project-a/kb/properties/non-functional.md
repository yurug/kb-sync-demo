---
id: non-functional-props
domain: properties
last-updated: 2026-03-25
related: [functional-props, edge-cases, linear-sdk]
---

# Non-Functional Properties

## One-liner
Measurable performance, security, reliability, and usability criteria.

## Scope
Covers: NFRs with measurable thresholds. Does NOT cover: functional invariants (see `functional.md`).

---

### NF1: Pull performance

**Statement:** Pull 500 issues from Linear in under 5 minutes on a standard broadband connection.

**Why:** Large workspaces need full pulls to be practical. Anything over 5 minutes feels broken.

**Measurement:** Time from command start to completion with 500-issue workspace.

**Architectural implication:** Requires bulk-fetch-then-join pattern. Sequential pagination with delay keeps rate-limit safety without sacrificing speed.

---

### NF2: Push performance

**Statement:** Push 10 modified issues in under 30 seconds.

**Why:** Push should feel near-instant for typical edit batches.

**Measurement:** Time from command start to completion with 10 modified files.

---

### NF3: Rate limit compliance

**Statement:** The tool never exceeds Linear's rate limit (~1500 requests/hour). If rate-limited (429), it retries with exponential backoff and never crashes.

**Why:** Rate limit violations cause 429 errors for the entire workspace, affecting other users and integrations.

**Measurement:** Monitor total API calls per pull. For 500 issues, must be < 100 calls (using bulk-fetch-then-join).

---

### NF4: API key security

**Statement:** The Linear API key never appears in config files, state files, log output, error messages, or markdown files.

**Why:** API keys grant full workspace access. Leaking them in committed files is a security incident.

**Test strategy:** Grep all output and written files for the API key value. Must never appear.

---

### NF5: Error message quality

**Statement:** Every error message includes: (a) what failed, (b) the actual error detail (not a generic wrapper), (c) a suggested fix when possible. Never print a stack trace to the user.

**Why:** Bad error messages waste the user's time. "Something went wrong" is a bug.

**Test strategy:** Every error type has a test verifying its `userMessage` contains specific actionable content.

---

### NF6: Progress feedback

**Statement:** Any operation taking > 2 seconds shows a progress indicator (spinner with status message). The user always knows what the tool is doing.

**Why:** Silent long-running operations feel like hangs. Users will Ctrl+C and retry.

**Measurement:** Manual verification during integration tests.

---

### NF7: Graceful degradation

**Statement:** A failure affecting one issue does not abort the entire operation. Invalid files are skipped with warnings; other files are processed normally.

**Why:** One bad markdown file shouldn't block syncing the other 499 issues.

**Test strategy:** Mix valid and invalid files. Verify valid files are processed and invalid files produce warnings.

---

### NF8: Idempotency

**Statement:** Running the same command twice with no intervening changes produces no side effects on the second run. Pull writes identical files; push sends no mutations.

**Why:** Users may accidentally double-run commands. Idempotency prevents unintended consequences.

**Test strategy:** Run pull twice. Verify second pull writes zero files. Run push twice (after first push). Verify second push sends zero API calls.

## Agent notes
> NF3 is enforced architecturally by the bulk-fetch-then-join pattern in `../external/linear-sdk.md`.
> NF4 must be verified by a dedicated test that injects a known key and greps all outputs.
> NF8 (idempotency) is closely related to P1 (roundtrip fidelity).

## Related files
- `functional.md` — correctness invariants
- `../external/linear-sdk.md` — rate limits and API call budgets
- `../spec/error-taxonomy.md` — error message standards
