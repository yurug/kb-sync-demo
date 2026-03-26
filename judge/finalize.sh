#!/usr/bin/env bash
# finalize.sh — Run validation, metrics, analysis, and report on a completed experiment
# Usage: ./judge/finalize.sh <run-dir>

RUN_DIR="${1:?Usage: finalize.sh <run-dir>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BOLD='\033[1m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BOLD}━━━ Finalizing experiment ━━━${NC}"
echo ""

for project in project-a project-b; do
  echo -e "${CYAN}═══ Analyzing $project ═══${NC}"
  echo ""

  if [ ! -d "$RUN_DIR/$project" ]; then
    echo -e "  ${RED}Directory $RUN_DIR/$project does not exist — skipping${NC}"
    echo ""
    continue
  fi

  if [ ! -d "$RUN_DIR/$project/src" ]; then
    echo -e "  ${RED}No src/ directory — project did not produce code${NC}"
    echo ""
    # Still run validation to get a score of 0
  fi

  # Commit any uncommitted work (agent may have been interrupted)
  if [ -d "$RUN_DIR/$project/.git" ]; then
    cd "$RUN_DIR/$project"
    git add -A 2>/dev/null
    git commit -m "Finalize: commit uncommitted work" --quiet 2>/dev/null || true
    cd - > /dev/null
  fi

  echo -e "${CYAN}Build timeline...${NC}"
  bash "$SCRIPT_DIR/analyze-run.sh" "$RUN_DIR/$project" || true
  echo ""

  echo -e "${CYAN}Validation...${NC}"
  bash "$SCRIPT_DIR/validate.sh" "$RUN_DIR/$project" || true
  echo ""

  echo -e "${CYAN}Metrics...${NC}"
  bash "$SCRIPT_DIR/metrics.sh" "$RUN_DIR/$project" "$RUN_DIR/$project.log" || true
  echo ""
done

echo -e "${CYAN}═══ Comparison Report ═══${NC}"
bash "$SCRIPT_DIR/report.sh" "$RUN_DIR/project-a" "$RUN_DIR/project-b" | tee "$RUN_DIR/report.txt" || true
echo ""
echo -e "${CYAN}Report saved to:${NC} $RUN_DIR/report.txt"
