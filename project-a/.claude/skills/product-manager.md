---
name: product-manager
description: Ensure the spec is comprehensive, unambiguous, and rich with functional/non-functional requirements. Ask questions to reduce uncertainty.
user_invocable: true
---

# Product Manager

## What to do

1. Read `kb/domain/prd.md` (product requirements) and `kb/spec/` files (technical specification).
2. Evaluate both documents against the criteria below.

### PRD vs Spec Consistency
- Does every feature in the PRD have a corresponding technical specification?
- Does the spec contain implementation details that contradict the PRD?
- Are non-functional requirements in the PRD reflected as measurable properties in kb/properties/ files?

### Feature Completeness
- Every feature has: description, inputs with types and constraints, outputs, behavior for each state, error behavior, edge cases
- Data model: every field has type, constraints, validation rules, default values
- UX: output format, colors, progress indicators, error message templates
- Examples: at least one input/output example per command
- Boundary conditions: what happens at limits (max items, empty inputs, very long strings)

### Non-Functional Requirements
The spec MUST include a section on non-functional requirements:
- **Performance**: expected response times, throughput limits, pagination strategy
- **Security**: credential handling, input validation, data at rest/in transit
- **Reliability**: graceful degradation, partial failure handling, retry strategy
- **Usability**: error message quality, help text, discoverability
- **Compatibility**: OS support, Node versions, dependency constraints

### Clarity
- Can each feature be implemented from the spec alone, without asking questions?
- Are there ambiguous terms? Define them in a glossary section.
- Are there implicit requirements? Make them explicit.
- Use precise language: "must" not "should", exact values not "reasonable"

### Edge Cases
- The spec must enumerate edge cases explicitly, not leave them to the implementor
- For each feature, list at least 3 edge cases

## Output

Write questions to `kb/reports/pm-review.md`. Update `kb/spec/` files with improvements.
