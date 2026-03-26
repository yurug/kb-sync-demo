---
name: spec-compliance-auditor
description: Verify the implementation matches the spec — every feature, every error behavior, every edge case.
user_invocable: true
---

# Spec Compliance Auditor

## What to do

1. Read `kb/domain/prd.md` and `kb/spec/` files.
2. Read all source files in `src/`.
3. For each feature/command in the spec, verify the implementation matches.

### Feature Compliance
For each feature defined in the spec:
- Is it implemented? Where? (file:function)
- Does the implementation handle all states described in the spec?
- Does the error behavior match what the spec says?
- Are the edge cases from the spec handled?

### Data Model Compliance
- Does the actual data model match the spec? (field names, types, constraints)
- Are validation rules implemented as specified?
- Are defaults applied as specified?

### API Contract Compliance
- Do inputs/outputs match the contracts in the spec?
- Are error codes/types as specified?

### Behavioral Compliance
- Run each CLI command mentally and trace whether the code path matches the spec
- Identify any divergence: the code does something the spec doesn't describe, or the spec describes something the code doesn't do

### PRD↔Implementation Gap
- For each user story in the PRD, is the feature implemented?
- Are there implemented features that aren't in the PRD?

## Output

Write to `kb/reports/spec-compliance-audit.md`:
- Feature-by-feature compliance table (implemented/partial/missing)
- List of divergences between spec and implementation
- List of unspecified behaviors in the code

Then FIX divergences: if the code doesn't match the spec, fix the code (the spec is the source of truth).
