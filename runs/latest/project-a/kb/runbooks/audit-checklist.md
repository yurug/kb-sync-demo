---
id: audit-checklist
domain: runbooks
last-updated: 2026-03-25
related: [functional-props, non-functional-props, code-style, testing-strategy]
---

# Audit Checklist

## One-liner
Step-by-step checklist for auditing code quality against KB standards.

## Scope
Covers: structured audit process for code, tests, and documentation. Does NOT cover: what the standards are (see referenced files).

---

## 1. Literate Programming

- [ ] Every source file has a file header comment (module name, purpose, responsibilities).
- [ ] Every public function has JSDoc with `@param`, `@returns`, `@throws`, `@invariant`.
- [ ] Inline comments explain WHY for conditionals, algorithm steps, assumptions, trade-offs.
- [ ] Comment ratio >= 20% (count comment lines / total lines).
- [ ] No commented-out code left in.

**Reference:** `../conventions/code-style.md`

## 2. Architecture

- [ ] Entry point is `src/index.ts` with `#!/usr/bin/env node` on line 1.
- [ ] `package.json` build script includes `chmod +x dist/index.js`.
- [ ] No circular imports (check with `npx madge --circular src/`).
- [ ] All files under 200 lines, all functions under 30 lines.
- [ ] Dependencies flow downward per `../architecture/overview.md`.
- [ ] `core/` never imports `@linear/sdk` or `fs` directly — only through interfaces.

**Reference:** `../architecture/overview.md`

## 3. TypeScript & ESM

- [ ] All imports use `.js` extension for relative paths.
- [ ] `package.json` has `"type": "module"`.
- [ ] `tsconfig.json` has `"module": "nodenext"`.
- [ ] No `any` types in source code (search: `:\s*any` and `as any`).
- [ ] `npx tsc --noEmit` passes with zero errors.
- [ ] `npx tsx src/index.ts --help` prints help with all 4 commands.

**Reference:** `../conventions/code-style.md`

## 4. Error Handling

- [ ] All errors extend `KbSyncError` hierarchy.
- [ ] Every error has a specific `userMessage` (not generic).
- [ ] `cause` is always chained when wrapping errors.
- [ ] API key never appears in error messages, logs, or files.
- [ ] Per-file errors (ValidationError) skip the file, don't abort the command.
- [ ] Exit codes match spec: 0 success, 1 error, 2 conflicts.

**Reference:** `../spec/error-taxonomy.md`, `../conventions/error-handling.md`

## 5. Functional Properties

- [ ] P1: Roundtrip fidelity — pull→push with no edits produces zero mutations.
- [ ] P2: No silent data loss — local mods warned, deletions go to trash.
- [ ] P3: Config is single source of truth.
- [ ] P4: Extra frontmatter preserved on pull.
- [ ] P5: ID-based matching, not filename-based.
- [ ] P6: Conflict detection correctness.
- [ ] P7: Pushable vs read-only field separation.
- [ ] P8: Field validation before push.
- [ ] P9: Incremental sync correctness.
- [ ] P10: Deletion safety (gated on complete fetch).

**Reference:** `../properties/functional.md`

## 6. Non-Functional Properties

- [ ] NF3: Rate limit compliance — no lazy-loading, bulk-fetch-then-join used.
- [ ] NF4: API key never in output.
- [ ] NF5: Error messages include actual cause + suggested fix.
- [ ] NF6: Progress feedback for operations > 2s.
- [ ] NF7: Per-file failures don't abort batch operations.
- [ ] NF8: Idempotency — double-run produces no side effects.

**Reference:** `../properties/non-functional.md`

## 7. Testing

- [ ] Coverage >= 80%.
- [ ] At least 3 tests per source file on average.
- [ ] Every property P1-P10 covered by >= 2 tests.
- [ ] Every edge case T1-T20 has a dedicated test.
- [ ] Every error type has a test verifying `userMessage`.
- [ ] At least one integration test with real Linear API.
- [ ] Integration tests are READ-ONLY (no mutations).
- [ ] Mocks use DI, not `vi.mock()`.
- [ ] Test names include property/edge case IDs.

**Reference:** `../conventions/testing-strategy.md`

## 8. Product Behavior (manual verification)

- [ ] `kb-sync init` creates `.kb-sync.json` with correct workspace.
- [ ] `kb-sync pull` fetches ALL issues from ALL teams by default.
- [ ] `kb-sync pull --team X` restricts to that team.
- [ ] `kb-sync push --dry-run` shows what would change.
- [ ] `kb-sync status` shows local + remote changes.
- [ ] Error messages show actual cause, not generic wrappers.

**Reference:** `../domain/prd.md`

## Agent notes
> Run this checklist after each implementation phase and before final delivery.
> Findings should be logged in `../reports/` as `audit-<date>.md`.
> Critical failures (data loss risk, build failures) block delivery. Style issues can be batched.

## Related files
- `../conventions/code-style.md` — literate programming standards
- `../conventions/testing-strategy.md` — test requirements
- `../properties/functional.md` — P1-P10 invariants
- `../properties/non-functional.md` — NF1-NF8 criteria
