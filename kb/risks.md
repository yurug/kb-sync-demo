# Live Demo Risks and Mitigations

## High Risk

### Agent hangs or loops
- **Mitigation**: Timeout per agent in `run-experiment.sh`; Ralph Loop iterations capped at 3 per step
- **Fallback**: Kill the pane, show pre-recorded results from `runs/20260325-173135/`

### Project B produces surprisingly good output
- **Why**: Claude is good at TypeScript CLIs; the single prompt describes the product clearly
- **Mitigation**: validate.sh has harness-specific checks (module headers, @invariant refs, property-tagged tests, comment ratio) that Project B cannot pass without a methodology
- **Fallback**: Focus on quality dimensions (conflict detection, pagination, error hierarchy, test coverage) not just "does it work"

### Network failure (Linear API unreachable)
- **Mitigation**: Unit tests mock the Linear API; only the integration test needs real connectivity
- **Impact**: Both projects lose 1-2 points on the integration check equally

## Medium Risk

### Project A spends all time on foundations, never builds CLI
- **Mitigation**: Plan prompt mandates vertical-slice-first (step 1 must produce a running CLI); IMPL_MAX=3 per step
- **Fallback**: Show the pre-recorded run where A scored 34/34

### Audience questions about the fairness of the comparison
- **Response**: Both start with identical deps, same model, same permissions. Project B's prompt describes the product — no quality hints, no judge criteria. The only difference is the methodology.

## Low Risk

### validate.sh produces unexpected scores
- **Mitigation**: Run on the pre-recorded project-a to verify: `./judge/validate.sh runs/20260325-173135/project-a`
- **Expected**: 34/34
