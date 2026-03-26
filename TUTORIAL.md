# Tutorial: Building kb-sync with Spec-Driven Agentic Development

This tutorial walks through the process of building a real project using the methodology from the talk. Each step shows:
- **The prompt** — what the agent receives
- **The effect** — what happens
- **The lesson** — which talk concept this demonstrates

The live experiment (`run-experiment.sh`) executes these steps automatically. You can also study them by reading `project-a/run-build.sh`.

> *"The bottleneck was never the coding. It was the thinking."*

---

## Phase 0: The Contrast

Before we build with a harness, let's see what happens without one.

### Project B: No Harness

**Prompt (single shot, no context):**
```
Build a TypeScript CLI tool called kb-sync that bidirectionally syncs
a local knowledge base (directory of markdown files with YAML frontmatter)
with Linear. Commands: init, pull, push, status.
Tech: TypeScript, @linear/sdk, commander, gray-matter, vitest for tests.
```

**What happens:** The agent produces code that roughly works but:
- Flat file structure (no module separation)
- Few tests (10-25, not comprehensive)
- No correctness properties defined or tested
- No conflict resolution strategy
- No pagination or rate-limit handling
- No literate comments or contracts

**Lesson:** The agent is a function. Bad input, bad output.

---

## Phase 1: Ambiguity Resolution (interactive)

> *"50 questions before you start"*

The agent generates questions about the product — features, data model, edge cases, API behavior — and proposes default answers. The user reviews and edits. This iterates until no blind spots remain.

**What gets produced:** `kb/questions-round1.md`, `kb/questions-round2.md`

**Lesson:** Ambiguity in = ambiguity out. Resolving it upfront is cheaper than fixing it in code.

---

## Phase 2: Knowledge Base Creation

> *"Your knowledge base directory is the foundation every implementation step builds on."*

From the resolved answers, the agent builds an **agent-optimized knowledge base** — not prose documentation, but a routing system:

| File | What it provides | Talk concept |
|------|-----------------|--------------|
| `kb/INDEX.md` | Master routing table: "given my task, what do I load?" | Agent navigation |
| `kb/indexes/by-task.md` | Task-oriented navigation (implement / audit / debug / test) | Routing, not browsing |
| `kb/spec/` | Data model, algorithms, API contracts, error taxonomy, config formats | Spec before code |
| `kb/properties/` | Correctness invariants (P1-P10), edge cases (T1-T20) | What must always be true |
| `kb/external/linear-sdk.md` | Actual SDK runtime behavior: lazy-loading, rate limits, request cost model | External dependency research |
| `kb/architecture/decisions/` | ADRs: why we chose this design, not just what | Architecture as agent fuel |

**Lesson:** The KB takes ~20 minutes of agent time. It's the single biggest factor in output quality.

---

## Phase 3: Build the Harness

> *"Fix the harness, not the output."*

### CLAUDE.md — The agent's methodology

Defines the spec-driven process (6 phases), mandatory quality standards (literate programming, DI, typed errors, no `any`, 20% comment ratio), and build-critical rules (ESM imports, shebang, CLI must run).

See `project-a/CLAUDE.md`.

### Skills — 14 specific perspectives

Organized in `.claude/skills/` by role:
- **Auditors** (8): ambiguity, code quality, test quality, UX, performance, security, spec compliance, harness validation
- **Managers** (3): product manager, architect, project manager
- **Executors** (3): implementor (Ralph Loop), tester, tech writer

### Feedback loop — Deterministic checks

The `run-build.sh` script runs deterministic checks after every iteration:
- `npx tsc --noEmit` — compilation
- `npx vitest run` — tests
- `npx tsx src/index.ts --help` — CLI actually runs
- ESM import check — all relative imports have `.js` extension
- Shebang check — entry point starts with `#!/usr/bin/env node`
- Quality checks — module count, `any` types, comment ratio, `@invariant` refs, DI signatures

If any check fails, the exact error is fed back to the agent. The loop doesn't converge until all pass.

**Lesson:** Without deterministic feedback, "iterate until good" is hope, not engineering.

---

## Phase 4: Implementation with Ralph Loops

> *"Iterate-and-validate loops are not optional."*

The agent follows the plan step by step. Each step is a Ralph Loop:

**implement → compile → test → check CLI → check quality → fix → repeat**

### The vertical-slice-first mandate

Step 1 must produce a **running CLI** — not just foundation types. A running skeleton with basic commands is more valuable than perfect types with no commands.

### What a typical run produces

| Step | What | Key properties |
|------|------|----------------|
| 1 | Vertical slice: entry point, commands, types, config, basic Linear client | CLI works end-to-end |
| 2 | Depth: sync engine, conflict detection, mapper, state management | P1-P6 |
| 3 | Quality: edge cases, error handling, push, comprehensive tests | T1-T20, NF1-NF5 |

Between each step, the build script validates and commits.

---

## Phase 5: Quality Audits

Multi-axis audits run as a Ralph Loop:
- **Test gap analysis** — every property and edge case covered?
- **Security** — credentials, input validation, data exposure
- **Performance** — API call efficiency, pagination, rate limits
- **UX** — error messages, help text, progress indicators
- **Spec compliance** — does the code match every spec item?

Each audit produces a report in `kb/reports/` and fixes what it finds.

---

## Phase 6: The Comparison

Run the full experiment:
```bash
export LINEAR_API_KEY=lin_api_...
./run-experiment.sh --auto
```

This launches both projects in parallel in a tmux session:
- **Left pane:** Project A running `run-build.sh` (multi-phase with Ralph Loops)
- **Right pane:** Project B running a single `claude -p` prompt
- **Bottom pane:** Live dashboard

After both finish:
```bash
./judge/finalize.sh runs/<timestamp>
```

### What to look for

**In the dashboard (live):**
- Project A's file count grows in steps (commit after each phase)
- Project B's file count appears in one burst
- Project A produces KB files, then source, then audit reports

**In the final report (latest results):**

| Metric | Project A (harness) | Project B (no harness) |
|--------|--------------------|-----------------------|
| Validation score | 34/34 (100%) | 17/30 (56%) |
| Source files | 26 | 9 |
| Tests | 314 | 18 |
| Coverage | 86% | 20% |
| Comment ratio | 33% | 0% |
| Conflict detection | SHA-256 hashing + timestamps | None (blind overwrite) |
| API handling | Bulk-fetch-then-join, pagination, backoff | Lazy-loading, no pagination |
| Error handling | Typed hierarchy with userMessage | Bare `throw new Error()` |

### The punchline

The harness (KB + skills + CLAUDE.md + feedback loop) makes the agent produce code that is architecturally sound, well-tested, well-documented, and traceable to correctness properties.

Project B produces code that works. Project A produces code you can trust.

**Fix the harness, not the output.**
