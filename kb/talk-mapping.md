# Talk Concept → Demo File Mapping

| Talk Concept (slide) | Demo File | What it demonstrates |
|---|---|---|
| Agent is stateless (Slide 8) | `project-a/run-build.sh` — multiple `claude -p` calls | Each invocation starts fresh; context comes from kb/ and CLAUDE.md |
| Ralph Loops (Slide 8) | `project-a/run-build.sh` — validation between every step | implement → validate → fix → repeat until green |
| Resolve ambiguity before action (Slide 13) | Phase 1 of `run-build.sh` — ambiguity resolution | Agent generates questions, proposes defaults, iterates with user |
| Adversarial debate (Slide 13) | KB audit step in `run-build.sh` | Agent challenges its own spec for gaps, contradictions, vague language |
| BB story: harness vs no harness (Slide 14) | The entire A vs B experiment | Same thesis, demonstrated live |
| Fix the harness, not the output (Slide 12) | `project-a/CLAUDE.md` vs `project-b/CLAUDE.md` | The harness IS the difference |
| Architecture as agent fuel (Slide 15) | Agent-generated `kb/architecture/overview.md` + ADRs | Good architecture → good context → better output |
| Metrics and validation (Slide 16) | `judge/validate.sh`, `judge/report.sh` | Deterministic checks as ground truth |
| Knowledge engineering (Slide 17) | Agent-generated `kb/` directory with INDEX.md routing | Agent-optimized KB structure: routing tables, not prose |
| Commented code (Slide 17) | Project A source code | `// Module:` headers, JSDoc, `@invariant` tags, WHY comments |
| Spec-Driven Agentic Development (Slide 18) | The full `project-a/` setup | Software + Knowledge + Harness engineering |
