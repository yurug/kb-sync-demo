---
id: by-task
domain: meta
last-updated: 2026-03-25
related: [kb-index]
---

# Task Index

## One-liner
Routing table: given your current task, here are the exact files to load in order.

## Scope
Covers all common agent tasks: implement, audit, debug, test, add command, understand product. Does NOT contain the content itself — follow the file references.

---

## Implement a sync feature (pull/push/status logic)

**Load order:**
1. `../spec/data-model.md` — understand entities, fields, types
2. `../spec/algorithms.md` — sync protocol, state machine, conflict detection
3. `../external/linear-sdk.md` — API behavior, lazy-loading traps, rate limits
4. `../architecture/overview.md` — module boundaries, DI pattern, where code goes
5. `../conventions/code-style.md` — naming, file structure, comment requirements
6. `../properties/functional.md` — invariants this code must satisfy

**Key questions this answers:**
- What data flows through the system and in what format?
- What is the exact sync algorithm step by step?
- How do I call Linear without blowing the rate limit?
- Which module owns this logic?

---

## Implement a CLI command

**Load order:**
1. `../domain/prd.md` — user stories, command specs, expected behavior
2. `../spec/api-contracts.md` — inputs, outputs, error codes for each command
3. `../spec/config-and-formats.md` — config schema, file format details
4. `../architecture/overview.md` — where commands live, DI wiring
5. `../spec/error-taxonomy.md` — which errors to throw and when

**Key questions this answers:**
- What should this command do from the user's perspective?
- What are the exact inputs, outputs, and exit codes?
- How do I wire up dependencies?

---

## Write or update tests

**Load order:**
1. `../conventions/testing-strategy.md` — test levels, mocking rules, coverage targets
2. `../properties/functional.md` — invariants to verify (P1, P2, ...)
3. `../properties/edge-cases.md` — boundary conditions to test (T1, T2, ...)
4. `../properties/non-functional.md` — performance/security criteria (NF1, NF2, ...)
5. `../external/linear-sdk.md` — how to mock Linear correctly, integration test rules

**Key questions this answers:**
- What properties must my tests verify?
- What edge cases must have dedicated tests?
- How do I mock external dependencies correctly?
- What coverage target must I hit?

---

## Audit code quality

**Load order:**
1. `../runbooks/audit-checklist.md` — step-by-step audit process
2. `../properties/functional.md` — check all invariants are enforced
3. `../properties/non-functional.md` — check measurable criteria
4. `../conventions/code-style.md` — verify literate programming standards
5. `../conventions/error-handling.md` — verify error hierarchy and messages
6. `../architecture/overview.md` — verify module boundaries and DI

**Key questions this answers:**
- Is every property covered by code and tests?
- Does the code meet literate programming standards?
- Are error messages helpful and specific?
- Are module boundaries respected?

---

## Debug API or sync issues

**Load order:**
1. `../external/linear-sdk.md` — SDK behavior, lazy-loading, pagination, rate limits
2. `../spec/error-taxonomy.md` — which error type this is, what triggers it
3. `../conventions/error-handling.md` — how errors propagate, where to add logging
4. `../spec/algorithms.md` — expected sync flow (compare against actual)
5. `../spec/data-model.md` — field types and constraints (for data issues)

**Key questions this answers:**
- Is this a rate limit, pagination, or lazy-loading issue?
- What error type should this produce?
- What is the expected behavior at this point in the sync flow?

---

## Understand the product (onboarding)

**Load order:**
1. `../domain/prd.md` — what the product does and why
2. `../GLOSSARY.md` — domain terminology
3. `../architecture/overview.md` — high-level system shape
4. `../spec/data-model.md` — core data structures

**Key questions this answers:**
- What problem does kb-sync solve?
- What commands does it support?
- How is the codebase organized?

## Agent notes
> This is the primary navigation file. Load it whenever you start a new task type.
> If your task doesn't fit a category above, start with `../INDEX.md` quick-load bundles.

## Related files
- `../INDEX.md` — master entry point with quick-load bundles
