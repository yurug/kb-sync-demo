---
id: adr-001
domain: architecture
last-updated: 2026-03-25
related: [arch-overview, adr-002, testing-strategy]
---

# ADR-001: Dependency Injection via Interfaces

**Status:** Accepted

## Context

kb-sync interacts with two external systems: the Linear API and the local filesystem. Both are side-effectful and slow. Unit tests need to run fast and without network access. We need a strategy for decoupling business logic from external I/O.

Options considered:
1. **Direct imports** — modules import and call the Linear SDK / fs directly. Tests use `vi.mock()`.
2. **DI via interfaces** — modules accept dependencies as parameters typed to interfaces. Tests pass mock implementations.
3. **Service locator** — a global registry that modules query for dependencies.

## Decision

Use **dependency injection via interfaces** (option 2).

- Define `LinearClient`, `FileReader`, and `FileWriter` as TypeScript interfaces.
- The sync engine and commands accept these as constructor/function parameters.
- The entry point (`src/index.ts`) creates concrete implementations and wires them.
- Tests create mock objects that implement the same interfaces.

## Consequences

**Positive:**
- Tests are fast, deterministic, and don't need `vi.mock()` magic.
- Mocks are type-checked — if the interface changes, mocks fail to compile.
- Easy to add alternative implementations (e.g., a dry-run writer that logs instead of writing).

**Negative:**
- Slightly more code — interfaces + wiring in entry point.
- Every new interface method must be added in 3 places: interface, implementation, mock.

## What this means for implementers

- Never import `@linear/sdk` directly in `core/` or `commands/`. Always go through `LinearClient`.
- Never import `fs` directly in `core/`. Always go through `FileReader`/`FileWriter`.
- When adding a new operation (e.g., `deleteIssue`), add it to the interface first, then implement.
- Test files should create their own mock objects matching the interface, not use `vi.mock()`.

## Related files
- `../overview.md` — module structure showing where interfaces are defined
- `../../conventions/testing-strategy.md` — how mocks work with DI
