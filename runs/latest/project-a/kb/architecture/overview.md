---
id: arch-overview
domain: architecture
last-updated: 2026-03-26
related: [data-model, algorithms, adr-001, adr-002]
---

# Architecture Overview

## One-liner
Module structure, dependency graph, DI pattern, and error hierarchy for the kb-sync codebase.

## Scope
Covers: module responsibilities, dependency flow, DI interfaces, error base class. Does NOT cover: individual algorithm details (see `../spec/algorithms.md`), ADR rationale (see `decisions/`).

---

## Module structure

```
src/
  index.ts                — CLI entry point (commander setup, command registration)
  types.ts                — Shared type definitions (MarkdownIssue, Config, SyncState)
  errors.ts               — Error hierarchy (KbSyncError → subtypes)
  commands/
    init.ts               — init command handler
    pull.ts               — pull command handler (orchestrates pull flow)
    pull-helpers.ts       — Local-mod detection and soft-delete logic for pull
    push.ts               — push command handler (CLI concerns, exit codes)
    status.ts             — status command handler (local + remote change detection)
    status-formatter.ts   — Console output formatting with chalk colors
  core/
    sync-engine.ts        — Push orchestration: detect → conflict → validate → mutate
    mapper.ts             — LinearIssue → MarkdownIssue + filename/path building
    push-mapper.ts        — MarkdownIssue → IssueUpdateInput (name→ID resolution)
    change-detector.ts    — Find locally modified files via hash comparison
    config.ts             — Config read/write/validate (.kb-sync.json)
    state.ts              — State file read/write (.kb-sync-state.json)
    hasher.ts             — Content hashing (SHA-256)
    progress.ts           — Spinner/progress wrapper (ora) for NF6
  linear/
    client.ts             — LinearClientImpl (concrete, wires sub-modules)
    types.ts              — LinearClientInterface, IssueNode, IssueUpdateInput
    pagination.ts         — Cursor-based pagination with retry + throttle
    issue-fetcher.ts      — Raw GraphQL issue fetching (full, timestamps, IDs)
    ref-data.ts           — Bulk-fetch reference data (teams, users, states, etc.)
    resolver.ts           — IssueNode → LinearIssue resolution + mutation builder
  fs/
    reader.ts             — Read + parse markdown files (gray-matter)
    writer.ts             — Write markdown files (serialize frontmatter + body)
    scanner.ts            — Scan kbDir for all markdown files, index by ID
```

---

## Dependency graph

```
index.ts
  └─ commands/init.ts ─── core/config.ts, linear/client.ts (via interface)
  └─ commands/pull.ts ─── core/{config, state, mapper, hasher}, fs/{scanner, writer, reader}
  │    └─ commands/pull-helpers.ts ─── core/hasher, fs/writer
  └─ commands/push.ts ─── core/{config, sync-engine}
  │    └─ core/sync-engine.ts ─── core/{state, mapper, change-detector}
  │         └─ core/change-detector.ts ─── core/hasher, fs/{reader, scanner}
  │         └─ core/push-mapper.ts (name→ID resolution)
  └─ commands/status.ts ── core/{config, state, hasher}, fs/scanner
       └─ commands/status-formatter.ts (output only)

linear/client.ts (via LinearClientInterface)
  ├─ linear/ref-data.ts ─── @linear/sdk, linear/pagination.ts
  ├─ linear/issue-fetcher.ts ─── linear/pagination.ts, linear/resolver.ts
  └─ linear/resolver.ts (pure functions, no API calls)
```

**Rules:**
- Dependencies flow downward. No circular imports.
- Only the `push` command goes through `core/sync-engine.ts`; `pull` and `status` orchestrate directly.
- All commands receive the Linear client via DI (`LinearClientInterface`).
- `linear/` and `fs/` are leaf modules — they depend only on external packages and `types.ts`/`errors.ts`.

---

## Dependency Injection pattern

DI is applied to the Linear API client via the `LinearClientInterface`. All commands receive a `client: LinearClientInterface` parameter — tests inject mocks, production code injects `LinearClientImpl`.

```typescript
// Interface defined in linear/types.ts
interface LinearClientInterface {
  getViewer(): Promise<{ id: string; name: string }>;
  getOrganization(): Promise<{ name: string; urlKey: string }>;
  fetchReferenceData(): Promise<ReferenceData>;
  fetchIssues(teamIds: string[], since?: string, refData?: ReferenceData): Promise<[LinearIssue[], boolean]>;
  fetchAllIssueIds(teamIds: string[]): Promise<string[]>;
  fetchIssueTimestamps(teamIds: string[]): Promise<Array<{ id: string; identifier: string; updatedAt: string }>>;
  fetchIssueUpdatedAt(issueId: string): Promise<string | null>;
  updateIssue(issueId: string, input: IssueUpdateInput): Promise<string>;
}
```

**Note on fs/ modules:** `fs/reader.ts`, `fs/writer.ts`, and `fs/scanner.ts` export standalone functions (not interface-based classes). They are imported directly. DI is only used for the Linear client boundary.

**Why DI for Linear:** Unit tests inject mocks that implement `LinearClientInterface`. The sync engine doesn't know or care whether it's talking to real Linear or a mock. See `decisions/adr-001-dependency-injection.md`.

---

## Error hierarchy

```typescript
class KbSyncError extends Error {
  readonly userMessage: string;
  constructor(message: string, userMessage: string, options?: { cause?: Error });
}

class ConfigError extends KbSyncError {}
class AuthError extends KbSyncError {}
class ApiError extends KbSyncError {}
class FileSystemError extends KbSyncError {}
class ConflictError extends KbSyncError {}
class ValidationError extends KbSyncError {}
```

**Usage pattern:** Every function documents which error types it can throw via `@throws`. Commands catch `KbSyncError`, print `error.userMessage`, and exit with the appropriate code. Unexpected errors print the stack trace to stderr and exit 1.

---

## Entry point pattern

```typescript
// src/index.ts
#!/usr/bin/env node
import { Command } from 'commander';
// ... register commands
// ... top-level error handler wraps process.exitCode
```

The entry point creates concrete implementations, wires DI, and delegates to command handlers.

## Agent notes
> When adding a new module, place it in the correct directory per the structure above.
> Every new interface method must be added to both the interface and the mock in tests.
> The `scanner.ts` module is critical for P5 (ID-based matching) — it builds the id→path index.
> Max 30 lines per function, 200 lines per file. Split if exceeded.

## Related files
- `decisions/INDEX.md` — ADR list explaining why this architecture
- `../spec/data-model.md` — the types these modules operate on
- `../spec/algorithms.md` — the algorithms these modules implement
- `../conventions/code-style.md` — file and function size limits
