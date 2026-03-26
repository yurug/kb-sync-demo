---
name: ambiguity-auditor
description: Audit the specification and knowledge base for gaps, unknowns, contradictions, and implicit assumptions. Produce a scored report.
user_invocable: true
---

# Ambiguity Auditor

## What to do

1. Read ALL files in `kb/` to understand the project's specification, design, and constraints.

2. For each file, identify:
   - **Gaps**: something that should be specified but isn't (e.g., "what happens when X?")
   - **Unknowns**: explicit or implicit uncertainties (e.g., "TBD", "should we...?")
   - **Contradictions**: two statements that conflict with each other
   - **Implicit assumptions**: things assumed true but never stated
   - **Vague language**: words like "should", "might", "usually", "etc." that hide imprecision

3. Rate each finding: CRITICAL / HIGH / MEDIUM / LOW

4. Suggest a resolution for each finding.

## Output

Write the report to `kb/reports/ambiguity-audit.md` with this format:

```markdown
# Ambiguity Audit Report
Date: [timestamp]
Score: [X findings: N critical, N high, N medium, N low]

## Critical
### [Finding title]
- **File**: [path]
- **Quote**: "[exact text]"
- **Issue**: [description]
- **Suggested resolution**: [concrete proposal]

## High
...

## Summary
[1-paragraph assessment of spec maturity]
```
