---
id: code-style
domain: conventions
last-updated: 2026-03-25
related: [arch-overview, error-handling-conv, testing-strategy]
---

# Code Style Conventions

## One-liner
Naming, file structure, literate programming, and patterns to follow or avoid.

## Scope
Covers: TypeScript style rules, file/function size limits, documentation requirements. Does NOT cover: error handling (see `error-handling.md`), testing (see `testing-strategy.md`).

---

## File structure

- **Entry point:** `src/index.ts` — starts with `#!/usr/bin/env node`.
- **Max file length:** 200 lines. Split by concern if exceeded.
- **Max function length:** 30 lines. Extract helpers if exceeded.
- **One module per file.** No barrel exports (index.ts re-exports).

## File header (required)

Every source file starts with:
```typescript
// Module: <name> -- <one-line purpose>
//
// This module is responsible for <what it does and why>.
// It implements <spec features / properties>.
// Key design decisions: <DI pattern, error handling, etc.>
```

## Function documentation (required for public functions)

```typescript
/**
 * Brief description of what this function does.
 *
 * @param config - Sync configuration (must have been validated)
 * @param options - Pull options including --force and --team flags
 * @returns Array of written file paths
 * @throws {ApiError} When Linear API is unreachable after retries
 * @throws {ConfigError} When config file is invalid
 * @invariant P2 — ensures no data loss by checking local mods before overwrite
 * @example
 * const files = await pull(config, { force: false, team: 'Engineering' });
 */
```

## Inline comments

Comment **why**, not what. Required for:
- Every conditional branch: why this case exists
- Every algorithm step: what it accomplishes in the larger flow
- Every implicit assumption: what the code takes for granted
- Every trade-off: why this approach over the alternative
- Every magic value: why this number/threshold

**Target: comment ratio >= 20%** (including JSDoc).

## Naming conventions

| Entity           | Convention         | Example                    |
|------------------|--------------------|----------------------------|
| Files            | kebab-case         | `sync-engine.ts`           |
| Interfaces       | PascalCase         | `LinearClient`             |
| Classes          | PascalCase         | `LinearClientImpl`         |
| Functions        | camelCase          | `fetchReferenceData`       |
| Constants        | UPPER_SNAKE_CASE   | `MAX_RETRIES`              |
| Type aliases     | PascalCase         | `IssueUpdateInput`         |
| Enum values      | PascalCase         | `Priority.High`            |

## TypeScript rules (non-negotiable)

- **ESM project:** `package.json` has `"type": "module"`.
- **Imports use `.js` extension:** `import { foo } from './bar.js'` (even though source is `.ts`).
- **tsconfig:** `"module": "nodenext"`, `"moduleResolution": "nodenext"`.
- **No `any` types.** Use `unknown` + type guards.
- **Strict mode:** all strict checks enabled in tsconfig.

## Patterns to follow

- DI via interfaces (ADR-001).
- Bulk-fetch-then-join for API calls (ADR-002).
- Typed errors with `userMessage` (see `error-handling.md`).
- Explicit return types on public functions.

## Patterns to avoid

- `vi.mock()` — use DI instead.
- Direct `fs` imports in `core/` — use `FileReader`/`FileWriter` interfaces.
- Direct `@linear/sdk` imports in `core/` — use `LinearClient` interface.
- `Promise.all` for paginated API calls — serialize to avoid bursting.
- Accessing lazy-loaded fields on Linear SDK objects.

## Agent notes
> After every code change, run `npx tsc --noEmit` to verify compilation.
> After implementing commands, verify with `npx tsx src/index.ts --help`.
> The `.js` extension in imports is the #1 cause of build failures for ESM projects.

## Related files
- `../architecture/overview.md` — module structure these rules apply to
- `error-handling.md` — error-specific conventions
- `testing-strategy.md` — test-specific conventions
