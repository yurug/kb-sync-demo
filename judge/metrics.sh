#!/usr/bin/env bash
# metrics.sh — Collect metrics from a completed project run
# Usage: ./judge/metrics.sh <project-dir> [run-log]
# Outputs a JSON metrics file to <project-dir>/.metrics.json
set -euo pipefail

PROJECT_DIR="${1:?Usage: metrics.sh <project-dir> [run-log]}"
RUN_LOG="${2:-}"

cd "$PROJECT_DIR"

# ─── Time metrics ───
START_TIME=""
END_TIME=""
DURATION_SEC=""

# Try timestamp files first (created by run-experiment.sh), fall back to log
RUN_DIR=$(dirname "$PROJECT_DIR")
PROJECT_NAME=$(basename "$PROJECT_DIR")
START_FILE="$RUN_DIR/$PROJECT_NAME.start"
END_FILE="$RUN_DIR/$PROJECT_NAME.end"

if [ -f "$START_FILE" ] && [ -f "$END_FILE" ]; then
  START_TIME=$(cat "$START_FILE")
  END_TIME=$(cat "$END_FILE")
  START_EPOCH=$(date -d "$START_TIME" +%s 2>/dev/null || echo 0)
  END_EPOCH=$(date -d "$END_TIME" +%s 2>/dev/null || echo 0)
  DURATION_SEC=$((END_EPOCH - START_EPOCH))
elif [ -n "$RUN_LOG" ] && [ -f "$RUN_LOG" ]; then
  # Fallback: use log file modification times
  START_EPOCH=$(stat -c %Y "$RUN_LOG" 2>/dev/null || echo 0)
  END_EPOCH=$(date +%s)
  DURATION_SEC=$((END_EPOCH - START_EPOCH))
fi

# ─── Code metrics ───
if [ -d "src" ]; then
  LINES_OF_CODE=$(find src/ -name "*.ts" -exec cat {} + 2>/dev/null | wc -l)
  NUM_FILES=$(find src/ -name "*.ts" 2>/dev/null | wc -l)
  COMMENT_LINES=$(grep -rc "^\s*//" src/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
else
  LINES_OF_CODE=0
  NUM_FILES=0
  COMMENT_LINES=0
fi

# ─── Test metrics ───
if [ -d "tests" ]; then
  TEST_FILES=$(find tests/ -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l)
  TEST_LINES=$(find tests/ -name "*.test.ts" -o -name "*.spec.ts" -exec cat {} + 2>/dev/null | wc -l)

  # Run tests and capture results
  TEST_OUTPUT=$(timeout 60 npx vitest run --reporter=verbose 2>&1 || true)
  TESTS_PASSED=$(echo "$TEST_OUTPUT" | grep -cP "✓" || true)
  TESTS_PASSED=${TESTS_PASSED:-0}
  TESTS_FAILED=$(echo "$TEST_OUTPUT" | grep -cP "✗|FAIL" || true)
  TESTS_FAILED=${TESTS_FAILED:-0}
  TESTS_TOTAL=$((TESTS_PASSED + TESTS_FAILED))

  # Coverage
  COVERAGE_OUTPUT=$(timeout 60 npx vitest run --coverage 2>&1 || true)
  COVERAGE_PCT=$(echo "$COVERAGE_OUTPUT" | grep -oP 'All files\s*\|\s*\K[\d.]+' | head -1 2>/dev/null || echo "0")
  COVERAGE_PCT=${COVERAGE_PCT:-0}
else
  TEST_FILES=0
  TEST_LINES=0
  TESTS_PASSED=0
  TESTS_FAILED=0
  TESTS_TOTAL=0
  COVERAGE_PCT="0"
fi

# ─── Lint metrics ───
LINT_ERRORS=0
LINT_WARNINGS=0
if [ -f ".eslintrc.json" ] || [ -f ".eslintrc.js" ] || [ -f "eslint.config.js" ] || [ -f "eslint.config.mjs" ]; then
  LINT_OUTPUT=$(npx eslint src/ --format compact 2>/dev/null || true)
  LINT_ERRORS=$(echo "$LINT_OUTPUT" | grep -c "Error" || echo 0)
  LINT_WARNINGS=$(echo "$LINT_OUTPUT" | grep -c "Warning" || echo 0)
fi

# ─── Git metrics (iterations) ───
if [ -d ".git" ]; then
  NUM_COMMITS=$(git log --oneline 2>/dev/null | wc -l)
else
  NUM_COMMITS=0
fi

# ─── Token/cost metrics (from Claude log if available) ───
TOTAL_TOKENS=0
TOTAL_COST="0.00"
if [ -n "$RUN_LOG" ] && [ -f "$RUN_LOG" ]; then
  TOTAL_TOKENS=$(grep -oP 'total_tokens["\s:]+\K\d+' "$RUN_LOG" 2>/dev/null | awk '{s+=$1} END {print s+0}')
  # Approximate cost: $3/M input, $15/M output (Sonnet pricing)
  if [ "$TOTAL_TOKENS" -gt 0 ]; then
    TOTAL_COST=$(echo "scale=2; $TOTAL_TOKENS * 0.009 / 1000" | bc -l 2>/dev/null || echo "0.00")
  fi
fi

# ─── Validation score ───
VALIDATION_SCORE="0/0"
if [ -f ".validation-score" ]; then
  VALIDATION_SCORE=$(cat .validation-score)
fi

# ─── Output JSON ───
cat > .metrics.json << METRICS_EOF
{
  "project": "$(basename "$PROJECT_DIR")",
  "timestamp": "$(date -Iseconds)",
  "duration_seconds": ${DURATION_SEC:-0},
  "code": {
    "lines_of_code": $LINES_OF_CODE,
    "num_files": $NUM_FILES,
    "comment_lines": $COMMENT_LINES,
    "comment_ratio_pct": $([ "$LINES_OF_CODE" -gt 0 ] && echo "$((COMMENT_LINES * 100 / LINES_OF_CODE))" || echo 0)
  },
  "tests": {
    "test_files": $TEST_FILES,
    "test_lines": $TEST_LINES,
    "passed": $TESTS_PASSED,
    "failed": $TESTS_FAILED,
    "total": $TESTS_TOTAL,
    "coverage_pct": $COVERAGE_PCT
  },
  "lint": {
    "errors": $LINT_ERRORS,
    "warnings": $LINT_WARNINGS
  },
  "iterations": {
    "commits": $NUM_COMMITS
  },
  "cost": {
    "total_tokens": $TOTAL_TOKENS,
    "estimated_cost_usd": $TOTAL_COST
  },
  "validation_score": "$VALIDATION_SCORE"
}
METRICS_EOF

echo "Metrics written to $PROJECT_DIR/.metrics.json"
cat .metrics.json
