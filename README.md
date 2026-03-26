# kb-sync-demo

**Companion material for the talk: "Stop Pedaling: First Principles for Agentic Development"**

This repository demonstrates the difference between building software with and without a proper harness. Two AI agents build the same product from scratch — one guided by a methodology, the other given just a prompt.

## Results

We ran this experiment and scored both projects with a deterministic judge (`judge/validate.sh`). Here's what happened:

```
  METRIC                              PROJECT A       PROJECT B
  ─────────────────────────────────── ─────────────── ───────────────

  Validation
  Score                               34/34 (100%)    17/30 (56%)

  Code
  Lines of code                       3357            478
  Source files                        26              9
  Comment ratio %                     33              0

  Tests
  Test files                          31              4
  Tests passed                        314             18
  Coverage %                          86.5            20.63

  Efficiency
  Duration (seconds)                  ~4800 (~80min)  198 (~3min)
  Iterations (commits)                18              2
```

**Project A** (with harness) scores a perfect 34/34. It produces 26 source files with 33% comment ratio, 314 tests at 86% coverage, property-based tests, a full error hierarchy, and a specification-backed knowledge base.

**Project B** (no harness) scores 17/30. It runs in 3 minutes and produces working code — but with no comments, 18 tests, 20% coverage, no conflict detection, no pagination, and bare `throw new Error()` strings.

### What A has that B lacks

- **Conflict detection**: SHA-256 content hashing + remote timestamp comparison (vs. blind overwrite)
- **Bulk-fetch-then-join**: 6 total API calls via raw GraphQL (vs. O(N) lazy-loaded calls per issue)
- **Pagination with exponential backoff**: handles rate limits on large workspaces (vs. no pagination)
- **Typed error hierarchy** with `userMessage` + cause chains (vs. bare `throw new Error()`)
- **Property-based tests**: 50 randomized issues for roundtrip invariants (vs. only concrete examples)
- **Literate programming**: every file has a module header, every function has JSDoc with `@invariant` tags
- **Full knowledge base**: spec, 10 functional properties, 20 edge cases, ADRs, external SDK research

The harness took ~80 minutes instead of 3 minutes. But 3 minutes of plausible code is not the same as 80 minutes of correct code.

## The Experiment

Two AI agents build the same product — a CLI tool (`kb-sync`) that syncs a local directory of markdown files with Linear — but with very different setups:

|                | **Project A** (with harness)                              | **Project B** (no harness)                    |
|----------------|-----------------------------------------------------------|-----------------------------------------------|
| Knowledge base | Agent-optimized KB (INDEX.md routing, by-task navigation) | None                                          |
| Skills         | 14 specialized skills (auditors, managers, executors)      | None                                          |
| CLAUDE.md      | Spec-driven methodology + quality standards               | One-paragraph product description             |
| Feedback loop  | Ralph Loops with deterministic CLI + quality checks       | None                                          |
| Prompt         | "Follow CLAUDE.md and the build process"                  | "Build a CLI that syncs markdown with Linear" |

Both start with **identical** infrastructure: same `package.json`, `tsconfig.json`, `eslint.config.js`, and dependencies. The only difference is the harness.

## Quick Start

### Prerequisites
- Node.js 20+
- [Claude Code](https://claude.ai/claude-code) CLI
- A Linear API key (`LINEAR_API_KEY` env var)
- tmux

### Run the experiment

```bash
git clone https://github.com/yurug/kb-sync-demo.git
cd kb-sync-demo
export LINEAR_API_KEY=lin_api_...
./run-experiment.sh
```

This opens a tmux session with:
- **Top-left**: Project A (agent building with harness)
- **Top-right**: Project B (agent building without harness)
- **Bottom**: Live dashboard comparing both

#### Interactive vs automated mode

By default, Project A's build is **interactive**: the agent generates ambiguity-resolution questions, opens them in your editor for review, then iterates. This is the full methodology.

For a fully unattended run:

```bash
./run-experiment.sh --auto
```

In auto mode, the agent's proposed default answers are accepted as-is. Faster, but produces a slightly less refined specification.

### After both agents complete

```bash
./judge/finalize.sh runs/<timestamp>
```

This runs validation, collects metrics, and prints the comparison report.

## How the Harness Works

Project A follows **Spec-Driven Agentic Development** — a 6-phase methodology:

### Phase 1: Ambiguity Resolution
The agent generates questions about the product (features, data model, edge cases, API behavior), proposes default answers, and iterates until no blind spots remain.

### Phase 2: Knowledge Base Creation
From the answers, the agent builds an **agent-optimized knowledge base** — not prose documentation, but a routing system designed for cheap, precise context loading:
- `kb/INDEX.md` — master routing table ("given my task, what do I load?")
- `kb/indexes/by-task.md` — task-oriented navigation (implement / audit / debug / test)
- `kb/spec/` — split into focused files (data model, algorithms, API contracts, error taxonomy)
- `kb/properties/` — correctness invariants (P1-P10), non-functional properties (NF1-NF5), edge cases (T1-T20)
- `kb/external/` — actual runtime behavior of third-party SDKs (lazy-loading, rate limits, request budgets)
- `kb/architecture/decisions/` — ADRs encoding *why*, not just *what*

### Phase 3: Planning
An incremental implementation plan with a **vertical-slice-first** mandate: step 1 must produce a running CLI, not just foundation types.

### Phase 4: Implementation (Ralph Loops)
For each step: implement → compile → test → check CLI → fix → repeat. The feedback loop includes deterministic checks for ESM imports, shebang, CLI smoke tests, module structure, comment ratio, `@invariant` tags, and more.

### Phase 5: Quality Audits
Multi-axis audits (test coverage, security, performance, UX, spec compliance) with Ralph Loop convergence.

### Phase 6: KB Sync
Verify the knowledge base still matches the implementation. Update stale files.

## Repository Structure

```
├── README.md                # This file
├── run-experiment.sh        # Launch the A vs B experiment
├── judge/                   # Deterministic validation and metrics
│   ├── validate.sh          # Score a project (X/N checks)
│   ├── metrics.sh           # Collect metrics (code, tests, coverage, cost)
│   ├── dashboard.sh         # Live comparison dashboard
│   ├── report.sh            # Final side-by-side report
│   └── finalize.sh          # Run all of the above
├── project-a/               # Full harness, empty src/ and tests/
│   ├── CLAUDE.md            # Spec-driven methodology + quality standards
│   ├── run-build.sh         # Multi-phase build script with Ralph Loops
│   ├── .claude/skills/      # 14 skills
│   ├── src/                 # EMPTY — agent builds this
│   └── tests/               # EMPTY — agent builds this
└── project-b/               # Minimal setup (no harness)
    ├── CLAUDE.md            # One-paragraph product description
    ├── run-build.sh         # Single claude prompt
    ├── src/                 # EMPTY — agent builds this
    └── tests/               # EMPTY — agent builds this
```

## The 14 Skills

Skills are reusable procedures the agent can invoke. They guide behavior without constraining it.

### Auditors (produce reports in kb/reports/)
| Skill                      | Purpose                                                   |
|----------------------------|-----------------------------------------------------------|
| `ambiguity-auditor`        | Find gaps, unknowns, contradictions in the spec           |
| `code-quality-auditor`     | Check DRY, function size, contracts, literate programming |
| `test-quality-auditor`     | Check coverage, PBT, spec consistency, impact analysis    |
| `ux-auditor`               | CLI UX: help text, errors, colors, exit codes             |
| `harness-validator`        | Meta-audit: is the feedback loop comprehensive and fast?  |
| `performance-auditor`      | API call efficiency, pagination, async patterns           |
| `security-auditor`         | Credentials, input validation, data exposure              |
| `spec-compliance-auditor`  | Does the code match the spec? Every feature, every field  |

### Managers (maintain specs, reduce ambiguity)
| Skill             | Purpose                                             |
|-------------------|-----------------------------------------------------|
| `product-manager` | PRD quality, user stories, ambiguity reduction      |
| `architect`       | Design patterns, module structure, DI compliance    |
| `project-manager` | Roadmap, uncertainty evaluation, go/no-go decisions |

### Executors (build and test)
| Skill         | Purpose                                                |
|---------------|--------------------------------------------------------|
| `implementor` | Ralph Loop: implement → compile → test → fix → repeat |
| `tester`      | Gap analysis between implementation and spec           |
| `tech-writer` | Maintain user manual from PRD + source code            |

## Key Principles

1. **Spec before code** — you can't validate what you haven't specified
2. **Fix the harness, not the output** — when the agent produces wrong code, improve the constraints, not the code
3. **Invest in the KB** — specifications, properties, and SDK research pay off across every implementation step
4. **Agent navigation ≠ human navigation** — agents need routing tables, not prose
5. **Ralph Loops converge** — implement → validate → fix → repeat is the only reliable path to correct code
6. **Vertical slice first** — a running skeleton with basic commands beats perfect types with no commands

## Getting a Linear API Key

1. Go to [Linear](https://linear.app) → Settings → API → Personal API keys
2. Create a new key with read/write access
3. Export it: `export LINEAR_API_KEY=lin_api_...`

## License

MIT — this is pedagogical material. Use it, adapt it, share it.
