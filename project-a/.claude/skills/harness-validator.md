---
name: harness-validator
description: Validate the feedback loop — are health checks comprehensive, fast, correct, and token-efficient?
user_invocable: true
---

# Harness Validator

## What to do

Evaluate the quality of the development harness itself (meta-level audit).

1. Read all files in `kb/`, `.claude/skills/`, and the test suite.

### Spec Completeness
- Does `kb/spec/` files cover all features with enough detail to implement without questions?
- Does `kb/properties/` files cover all invariants needed for correctness?
- Does `kb/architecture/overview.md` match the actual code structure?

### Skill Coverage
- Is there an auditor for each quality dimension (code, tests, UX, security)?
- Do skills reference specific files and produce structured output?
- Are skills actionable (clear pass/fail criteria)?

### Feedback Loop Speed
- How long does the test suite take? (target: < 30 seconds)
- How long does the linter take? (target: < 10 seconds)
- Can tests run incrementally (by module)?

### Feedback Loop Completeness
- Do tests cover the spec properties?
- Does linting catch style issues?
- Is there a validation script that checks everything?

### Token Efficiency
- Is the knowledge base well-structured for agent consumption?
- Are files small and focused (< 200 lines each)?
- Is there redundancy across kb/ files that wastes tokens?
- Are CLAUDE.md instructions concise and directive?

## Output

Write to `kb/reports/harness-validation.md`:

```markdown
# Harness Validation
Date: [timestamp]
Overall Score: [X]% ([N/M] criteria passed)

| Layer | Score | Details |
|-------|-------|---------|
| Spec completeness | ... | ... |
| Skill coverage | ... | ... |
| Feedback loop speed | ... | ... |
| Feedback loop completeness | ... | ... |
| Token efficiency | ... | ... |

## Recommendations
[prioritized list of harness improvements]
```
