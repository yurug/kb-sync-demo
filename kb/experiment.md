# The Experiment

## Thesis

A project built with a proper harness (knowledge base, skills, CLAUDE.md, deterministic validation) produces significantly better output than one built with a single prompt — using the same model, same dependencies, same starting config.

## Methodology

Two AI agents build the same product (a CLI tool that syncs markdown with Linear) in parallel:

| Variable | Project A (harness) | Project B (no harness) |
|----------|---------------------|------------------------|
| Knowledge base | Agent builds an agent-optimized KB from scratch (spec, properties, ADRs, external SDK research) | None |
| Skills | 14 skills across 3 categories (auditors, managers, executors) | None |
| CLAUDE.md | Spec-driven methodology + quality standards + 6-phase build process | One-paragraph product description |
| Build process | Multi-phase: ambiguity resolution → KB creation → planning → Ralph Loops → quality audits → KB sync | Single `claude -p` call |
| Feedback loop | Deterministic checks after every iteration (compilation, tests, CLI smoke tests, ESM imports, quality standards) | None (agent self-manages) |

### Controlled variables
- Same `package.json` (identical dependencies and versions)
- Same `tsconfig.json` (same TypeScript config)
- Same `eslint.config.mjs` (same linting rules)
- Same model (whatever Claude version is current)
- Same `--dangerously-skip-permissions` flag

### Measured outcomes
- Validation score (X/N deterministic checks)
- Test count and coverage
- Code structure (module count, file count, lines of code)
- Quality indicators (comment ratio, JSDoc, @invariant refs, property-tagged tests)
- Duration and commit count

## Latest Results

Project A: **34/34** (100%) — 3357 LOC, 314 tests, 86% coverage, 33% comment ratio
Project B: **17/30** (56%) — 478 LOC, 18 tests, 20% coverage, 0% comment ratio

See `runs/20260325-173135/report.txt` for the full comparison.

## What the experiment does NOT prove

- That this methodology is optimal (it's one approach among many)
- That skills are necessary (the KB and CLAUDE.md do most of the heavy lifting)
- That the specific product matters (any product would show the same pattern)
- That human review is unnecessary (the harness complements human review, it doesn't replace it)
- That more time = better code (the harness uses ~80 minutes, but it uses them *productively*)
