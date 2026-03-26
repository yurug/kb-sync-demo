---
id: kb-index
domain: meta
last-updated: 2026-03-26
related: [glossary, by-task]
---

# kb-sync Knowledge Base

**kb-sync** is a TypeScript CLI tool that bidirectionally syncs a local knowledge base (directory of markdown files with YAML frontmatter) with Linear issues. It supports `init`, `pull`, `push`, and `status` commands, with conflict detection, incremental sync, and rate-limit-aware API access.

## How to use this KB

1. **Start here** — read this file for orientation and quick-load bundles.
2. **Navigate by task** — use `indexes/by-task.md` to find exactly what to load for your current goal.
3. **Look up terms** — `GLOSSARY.md` defines every domain-specific term.
4. **Dive into specifics** — each subdirectory has its own `INDEX.md` routing table.

## Quick-load bundles

| Goal                        | Load these files (in order)                                                                                                        |
|-----------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| Understand the product      | `domain/prd.md` → `GLOSSARY.md`                                                                                                   |
| Implement a sync feature    | `spec/data-model.md` → `spec/algorithms.md` → `external/linear-sdk.md` → `architecture/overview.md` → `conventions/code-style.md` |
| Implement a CLI command     | `domain/prd.md` → `spec/api-contracts.md` → `spec/config-and-formats.md` → `architecture/overview.md`                             |
| Write tests                 | `conventions/testing-strategy.md` → `properties/functional.md` → `properties/edge-cases.md` → `external/linear-sdk.md`            |
| Audit code quality          | `runbooks/audit-checklist.md` → `properties/functional.md` → `properties/non-functional.md` → `conventions/code-style.md`         |
| Debug API issues            | `external/linear-sdk.md` → `spec/error-taxonomy.md` → `conventions/error-handling.md`                                             |
| Understand sync conflicts   | `spec/algorithms.md` → `spec/data-model.md` → `properties/edge-cases.md`                                                         |
| Plan implementation         | `plan.md` → `architecture/overview.md` → `architecture/decisions/INDEX.md`                                                        |

## File count

44 files across 12 directories (including indexes and reports).

## Directory map

| Directory              | Purpose                                         |
|------------------------|-------------------------------------------------|
| `indexes/`             | Task-based navigation (routing table)           |
| `domain/`              | Product requirements (the "what" and "why")     |
| `spec/`                | Technical specification (the "how", precisely)  |
| `properties/`          | Invariants, NFRs, edge cases (the "always")     |
| `architecture/`        | Module structure, DI, ADRs (the "shape")        |
| `external/`            | Third-party SDK/API runtime behavior            |
| `conventions/`         | Code style, error handling, testing rules        |
| `runbooks/`            | Checklists for audits and operations             |
| `reports/`             | Generated audit/quality reports (initially empty)|
