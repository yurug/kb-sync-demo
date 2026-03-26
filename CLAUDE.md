# kb-sync-demo

This repository is a pedagogical demo for the talk "Stop Pedaling: First Principles for Agentic Development". It demonstrates the difference between building software with and without a proper harness.

## Structure

```
├── kb/                  # Knowledge base for THIS project (meta-level)
├── judge/               # Validation, metrics, dashboard, report scripts
├── project-a/           # Reference implementation (finished, with full harness)
├── project-b/           # Full harness, no code (agent builds during demo)
├── project-c/           # No harness, just a prompt (agent builds during demo)
├── run-experiment.sh    # Launches B and C in parallel, collects metrics
└── README.md            # Explains the experiment
```

## The Product: kb-sync

A TypeScript CLI tool that bidirectionally syncs a local knowledge base (directory of markdown files with YAML frontmatter) with Linear (project management tool).

## Principles

This project follows Spec-Driven Agentic Development:
1. Spec before code — read kb/spec.md and kb/properties.md before implementing
2. Architecture before implementation — read kb/architecture.md
3. Fix the harness, not the output — when something is wrong, improve the spec/skills/tests
4. Iterate and validate — use Ralph Loops (implement → audit → fix → repeat)
5. Knowledge base is more important than source code

## Build Order

Phase 1: Project A (reference implementation)
Phase 2: Skills (all 11)
Phase 3: Project B harness (kb/ + CLAUDE.md + skills, no code)
Phase 4: Project C (minimal CLAUDE.md)
Phase 5: Judge + metrics + dashboard + run script
Phase 6: README.md

## Tech Stack

- TypeScript, Node.js 20
- Linear SDK (@linear/sdk)
- gray-matter (frontmatter parsing)
- commander (CLI framework)
- vitest (testing)
- c8 (coverage)
- eslint (linting)
