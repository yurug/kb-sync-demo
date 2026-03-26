#!/usr/bin/env bash
# report.sh — Final comparison report between Project A and Project B
# Usage: ./judge/report.sh <project-a-dir> <project-b-dir>
set -euo pipefail

DIR_A="${1:?Usage: report.sh <project-a-dir> <project-b-dir>}"
DIR_B="${2:?Usage: report.sh <project-a-dir> <project-b-dir>}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Read metric: try .metrics.json first, fall back to computing directly
read_metric() {
  local dir="$1"
  local key="$2"

  # Try .metrics.json first
  if [ -f "$dir/.metrics.json" ] && command -v jq >/dev/null 2>&1; then
    local val=$(jq -r "$key // empty" "$dir/.metrics.json" 2>/dev/null)
    if [ -n "$val" ]; then echo "$val"; return; fi
  fi

  # Fall back to computing from project directory
  case "$key" in
    .validation_score)
      cat "$dir/.validation-score" 2>/dev/null || echo "N/A" ;;
    .code.lines_of_code)
      [ -d "$dir/src" ] && find "$dir/src" -name "*.ts" -exec cat {} + 2>/dev/null | wc -l || echo "0" ;;
    .code.num_files)
      [ -d "$dir/src" ] && find "$dir/src" -name "*.ts" 2>/dev/null | wc -l || echo "0" ;;
    .code.comment_ratio_pct)
      if [ -d "$dir/src" ]; then
        local comments=$(grep -rc "^\s*//\|^\s*\*" "$dir/src/" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
        local total=$(find "$dir/src" -name "*.ts" -exec cat {} + 2>/dev/null | wc -l)
        [ "$total" -gt 0 ] && echo "$((comments * 100 / total))" || echo "0"
      else echo "0"; fi ;;
    .tests.test_files)
      [ -d "$dir/tests" ] && find "$dir/tests" -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l || echo "0" ;;
    .tests.passed)
      if [ -d "$dir/tests" ] && [ -f "$dir/package.json" ]; then
        cd "$dir"
        [ ! -d "node_modules" ] && npm install --silent 2>/dev/null
        local out=$(timeout 60 npx vitest run --reporter=verbose 2>&1 || true)
        local p=$(echo "$out" | grep -c "✓" || true)
        echo "${p//[^0-9]/}"
        cd - > /dev/null
      else echo "0"; fi ;;
    .tests.failed)
      if [ -d "$dir/tests" ] && [ -f "$dir/package.json" ]; then
        cd "$dir"
        [ ! -d "node_modules" ] && npm install --silent 2>/dev/null
        local out=$(timeout 60 npx vitest run --reporter=verbose 2>&1 || true)
        local f=$(echo "$out" | grep -c "✗" || true)
        echo "${f//[^0-9]/}"
        cd - > /dev/null
      else echo "0"; fi ;;
    .tests.coverage_pct)
      if [ -d "$dir/tests" ] && [ -f "$dir/package.json" ]; then
        cd "$dir"
        [ ! -d "node_modules" ] && npm install --silent 2>/dev/null
        local out=$(timeout 90 npx vitest run --coverage 2>&1 || true)
        local cov=$(echo "$out" | grep -oP 'All files\s*\|\s*\K[\d.]+' | head -1 || echo "0")
        echo "${cov:-0}"
        cd - > /dev/null
      else echo "0"; fi ;;
    .lint.errors)
      if [ -d "$dir/src" ] && [ -f "$dir/package.json" ]; then
        cd "$dir"
        [ ! -d "node_modules" ] && npm install --silent 2>/dev/null
        local e=$(timeout 30 npx eslint src/ --format compact 2>/dev/null | grep -c "Error" || true)
        echo "${e//[^0-9]/}"
        cd - > /dev/null
      else echo "0"; fi ;;
    .lint.warnings)
      if [ -d "$dir/src" ] && [ -f "$dir/package.json" ]; then
        cd "$dir"
        local w=$(timeout 30 npx eslint src/ --format compact 2>/dev/null | grep -c "Warning" || true)
        echo "${w//[^0-9]/}"
        cd - > /dev/null
      else echo "0"; fi ;;
    .duration_seconds)
      local run_dir=$(dirname "$dir")
      local proj=$(basename "$dir")
      if [ -f "$run_dir/$proj.start" ] && [ -f "$run_dir/$proj.end" ]; then
        local s=$(date -d "$(cat "$run_dir/$proj.start")" +%s 2>/dev/null || echo 0)
        local e=$(date -d "$(cat "$run_dir/$proj.end")" +%s 2>/dev/null || echo 0)
        echo "$((e - s))"
      else echo "N/A"; fi ;;
    .iterations.commits)
      [ -d "$dir/.git" ] && git -C "$dir" log --oneline 2>/dev/null | wc -l || echo "0" ;;
    .cost.total_tokens)
      echo "N/A" ;;
    .cost.estimated_cost_usd)
      echo "N/A" ;;
    *)
      echo "N/A" ;;
  esac
}

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  EXPERIMENT RESULTS: Harness (A) vs. No Harness (B)${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Helper to format comparison
compare() {
  local label="$1"
  local val_a="$2"
  local val_b="$3"
  local higher_is_better="${4:-true}"

  local winner=""
  if [ "$val_a" != "N/A" ] && [ "$val_b" != "N/A" ]; then
    if [ "$higher_is_better" = "true" ]; then
      [ "$(echo "$val_a > $val_b" | bc -l 2>/dev/null || echo 0)" -eq 1 ] && winner="A" || winner="B"
    else
      [ "$(echo "$val_a < $val_b" | bc -l 2>/dev/null || echo 0)" -eq 1 ] && winner="A" || winner="B"
    fi
  fi

  local a_color="$NC"
  local b_color="$NC"
  if [ "$winner" = "A" ]; then
    a_color="$GREEN"
    b_color="$RED"
  elif [ "$winner" = "B" ]; then
    a_color="$RED"
    b_color="$GREEN"
  fi

  printf "  %-35s ${a_color}%-15s${NC} ${b_color}%-15s${NC}\n" "$label" "$val_a" "$val_b"
}

printf "  ${CYAN}%-35s %-15s %-15s${NC}\n" "METRIC" "PROJECT A" "PROJECT B"
printf "  %-35s %-15s %-15s\n" "───────────────────────────────────" "───────────────" "───────────────"

echo ""
echo -e "  ${YELLOW}Validation${NC}"
compare "Score" \
  "$(read_metric "$DIR_A" ".validation_score")" \
  "$(read_metric "$DIR_B" ".validation_score")"

echo ""
echo -e "  ${YELLOW}Code${NC}"
compare "Lines of code" \
  "$(read_metric "$DIR_A" ".code.lines_of_code")" \
  "$(read_metric "$DIR_B" ".code.lines_of_code")"
compare "Source files" \
  "$(read_metric "$DIR_A" ".code.num_files")" \
  "$(read_metric "$DIR_B" ".code.num_files")"
compare "Comment ratio %" \
  "$(read_metric "$DIR_A" ".code.comment_ratio_pct")" \
  "$(read_metric "$DIR_B" ".code.comment_ratio_pct")"

echo ""
echo -e "  ${YELLOW}Tests${NC}"
compare "Test files" \
  "$(read_metric "$DIR_A" ".tests.test_files")" \
  "$(read_metric "$DIR_B" ".tests.test_files")"
compare "Tests passed" \
  "$(read_metric "$DIR_A" ".tests.passed")" \
  "$(read_metric "$DIR_B" ".tests.passed")"
compare "Tests failed" \
  "$(read_metric "$DIR_A" ".tests.failed")" \
  "$(read_metric "$DIR_B" ".tests.failed")" \
  "false"
compare "Coverage %" \
  "$(read_metric "$DIR_A" ".tests.coverage_pct")" \
  "$(read_metric "$DIR_B" ".tests.coverage_pct")"

echo ""
echo -e "  ${YELLOW}Quality${NC}"
compare "Lint errors" \
  "$(read_metric "$DIR_A" ".lint.errors")" \
  "$(read_metric "$DIR_B" ".lint.errors")" \
  "false"
compare "Lint warnings" \
  "$(read_metric "$DIR_A" ".lint.warnings")" \
  "$(read_metric "$DIR_B" ".lint.warnings")" \
  "false"

echo ""
echo -e "  ${YELLOW}Efficiency${NC}"
compare "Duration (seconds)" \
  "$(read_metric "$DIR_A" ".duration_seconds")" \
  "$(read_metric "$DIR_B" ".duration_seconds")" \
  "false"
compare "Iterations (commits)" \
  "$(read_metric "$DIR_A" ".iterations.commits")" \
  "$(read_metric "$DIR_B" ".iterations.commits")"

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Verdict
SCORE_A=$(read_metric "$DIR_A" ".validation_score")
SCORE_B=$(read_metric "$DIR_B" ".validation_score")

# Compute percentages for fair comparison (denominators may differ due to KB checks)
PCT_A=""
PCT_B=""
if echo "$SCORE_A" | grep -qP '^\d+/\d+$'; then
  NUM_A=$(echo "$SCORE_A" | cut -d/ -f1)
  DEN_A=$(echo "$SCORE_A" | cut -d/ -f2)
  [ "$DEN_A" -gt 0 ] && PCT_A=$(echo "scale=0; $NUM_A * 100 / $DEN_A" | bc)%
fi
if echo "$SCORE_B" | grep -qP '^\d+/\d+$'; then
  NUM_B=$(echo "$SCORE_B" | cut -d/ -f1)
  DEN_B=$(echo "$SCORE_B" | cut -d/ -f2)
  [ "$DEN_B" -gt 0 ] && PCT_B=$(echo "scale=0; $NUM_B * 100 / $DEN_B" | bc)%
fi

echo ""
echo -e "  ${BOLD}Verdict:${NC}"
echo ""
echo -e "  Project A (with harness): ${GREEN}${SCORE_A}${NC} ${PCT_A:+($PCT_A)}"
echo -e "  Project B (no harness):   ${RED}${SCORE_B}${NC} ${PCT_B:+($PCT_B)}"
if [ "$DEN_A" != "$DEN_B" ] 2>/dev/null; then
  echo -e "  ${DIM}(Project A has $((DEN_A - DEN_B)) extra checks for its knowledge base)${NC}"
fi
echo ""

# ─── Narrative comparison (LLM-generated) ───
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}Qualitative Analysis${NC}"
echo ""

if command -v claude >/dev/null 2>&1; then
  claude --dangerously-skip-permissions -p "You are comparing two implementations of the same project (kb-sync CLI tool).

Project A (with harness) is in: $DIR_A
Project B (no harness) is in: $DIR_B

Read the source code in src/ and tests/ of both projects.
Read the validation scores in .validation-score of both projects.
If Project A has kb/, read a few files there too.

Write a concise qualitative comparison (10-15 lines max) covering:
1. Architecture: how is the code organized in each?
2. Quality: comments, error handling, contracts, literate style
3. Testing: property-based? coverage? edge cases?
4. What Project A has that Project B lacks (be specific, cite file names)
5. One-sentence verdict

Be factual. Reference specific files and patterns, not generic observations." < /dev/null 2>&1
else
  echo "  (claude CLI not available — skipping narrative analysis)"
fi

echo ""
echo -e "  ${CYAN}Fix the harness, not the output.${NC}"
echo ""
