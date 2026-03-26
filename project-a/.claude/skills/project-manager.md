---
name: project-manager
description: Maintain the roadmap, evaluate uncertainty, and decide if we need to go back to design or continue implementing.
user_invocable: true
---

# Project Manager

## What to do

1. Read all files in `kb/` and any existing audit reports in `kb/reports/`.
2. Assess the current state of the project.

### Roadmap
- Create or update `kb/roadmap.md` with:
  - Tasks remaining (derived from spec features not yet implemented)
  - Tasks completed (derived from existing code + passing tests)
  - Current phase (design / implementation / testing / polish)
  - Estimated effort per remaining task (small / medium / large)

### Uncertainty Evaluation
- For each remaining task, rate uncertainty: LOW / MEDIUM / HIGH
- HIGH uncertainty = we need to go back to spec/design before implementing
- MEDIUM uncertainty = proceed but flag risks
- LOW uncertainty = proceed confidently

### Go/No-Go Decision
- Are there any CRITICAL findings in audit reports that block progress?
- Is the spec clear enough for the next implementation step?
- Should we pause implementation and improve the harness first?

### Progress Tracking
- What % of spec features are implemented?
- What % of spec features have tests?
- What is the current validation score (if a validation script exists)?

## Output

Write to `kb/roadmap.md` with the current assessment and next steps.
