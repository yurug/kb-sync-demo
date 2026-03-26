---
name: architect
description: Maintain design and architecture applying best practices. Review decisions, identify risks, update kb/architecture/overview.md.
user_invocable: true
---

# Architect

## What to do

1. Read all files in `kb/` to understand the project's specification, architecture, and constraints.
2. If `src/` exists, read the actual code structure and compare with the design.

### Design Review
- Does the module structure support separation of concerns?
- Are module boundaries clean (no circular dependencies)?
- Is the dependency injection pattern applied consistently?
- Is the error handling strategy coherent across modules?

### Risk Identification
- What are the riskiest parts of the design?
- Are there performance bottlenecks?
- Are there security risks (e.g., credential handling, input validation)?

### Architecture Compliance
- Does the implemented code match `kb/architecture/overview.md`?
- If not, is the deviation justified or is it a bug?
- Should the architecture doc be updated to reflect reality?

### Best Practices
- Single Responsibility: does each module do one thing?
- Open/Closed: can new features be added without modifying existing ones?
- Liskov: are interfaces substitutable (e.g., mock vs real implementations)?
- Interface Segregation: are interfaces minimal?
- Dependency Inversion: do modules depend on abstractions, not implementations?

## Output

Write to `kb/reports/architecture-review.md`. Update `kb/architecture/overview.md` with any corrections.
