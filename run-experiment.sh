#!/usr/bin/env bash
# run-experiment.sh — Launch the B vs C experiment
# Usage: ./run-experiment.sh [--auto]
#   --auto: skip emacs, accept Claude's default answers (fully automated)
# Requires: tmux, claude CLI, node/npm
set -euo pipefail

AUTO_FLAG=""
if [ "${1:-}" = "--auto" ]; then
  AUTO_FLAG="--auto"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RUN_DIR="$SCRIPT_DIR/runs/$TIMESTAMP"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}━━━ kb-sync Experiment ━━━${NC}"
echo ""

# ─── Preflight checks ───
echo -e "${CYAN}Preflight checks...${NC}"

command -v claude >/dev/null 2>&1 || { echo -e "${RED}Error: claude CLI not found${NC}"; exit 1; }
command -v tmux >/dev/null 2>&1 || { echo -e "${RED}Error: tmux not found${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}Error: node not found${NC}"; exit 1; }

if [ -z "${LINEAR_API_KEY:-}" ]; then
  echo -e "${RED}Error: LINEAR_API_KEY not set${NC}"
  echo "  Get one from Linear > Settings > API > Personal API keys"
  echo "  Then: export LINEAR_API_KEY=lin_api_..."
  exit 1
fi

echo -e "${GREEN}All checks passed${NC}"
echo ""

# ─── Prepare run directories ───
echo -e "${CYAN}Preparing run directories...${NC}"
mkdir -p "$RUN_DIR"

# Copy project-a (with harness)
cp -r "$SCRIPT_DIR/project-a" "$RUN_DIR/project-a"
rm -f "$RUN_DIR/project-a/.validation-score" "$RUN_DIR/project-a/.metrics.json" "$RUN_DIR/project-a/.agent-running" "$RUN_DIR/project-a/.progress.log" "$RUN_DIR/project-a/.ralph-feedback.md" "$RUN_DIR/project-a/.quality-feedback.md"
cd "$RUN_DIR/project-a" && git init && git add -A && git commit -m "Initial: harness ready" --quiet
cd "$SCRIPT_DIR"

# Copy project-b (no harness)
cp -r "$SCRIPT_DIR/project-b" "$RUN_DIR/project-b"
rm -f "$RUN_DIR/project-b/.validation-score" "$RUN_DIR/project-b/.metrics.json" "$RUN_DIR/project-b/.agent-running" "$RUN_DIR/project-b/.progress.log"
cd "$RUN_DIR/project-b" && git init && git add -A && git commit -m "Initial: minimal setup" --quiet
cd "$SCRIPT_DIR"

# Install deps in both
echo -e "${CYAN}Installing dependencies...${NC}"
cd "$RUN_DIR/project-a" && npm install --silent 2>/dev/null
cd "$RUN_DIR/project-b" && npm install --silent 2>/dev/null
cd "$SCRIPT_DIR"

echo -e "${GREEN}Ready${NC}"
echo ""

# ─── Launch tmux session ───
# Project A: interactive build with emacs-based ambiguity resolution + Ralph Loop
# Project B: single headless prompt, no harness
SESSION="kb-sync-experiment"
TMUX_SOCKET="kb-sync-$$"
/usr/bin/tmux -L "$TMUX_SOCKET" kill-session -t "$SESSION" 2>/dev/null || true

echo -e "${BOLD}Launching experiment in tmux session '$SESSION'...${NC}"
echo ""
echo -e "  ${CYAN}Top-left:${NC}     Project A (with harness)"
echo -e "  ${CYAN}Top-right:${NC}    Project B (no harness)"
echo -e "  ${CYAN}Bottom:${NC}       Live dashboard"
echo ""
echo -e "  Attach with: ${BOLD}/usr/bin/tmux -L $TMUX_SOCKET attach -t $SESSION${NC}"
echo ""

# Timeout: 30 minutes max per agent (safety for live demo)
# Project A needs more time (multi-step with Ralph Loops)
# Project B is single-prompt, finishes faster
TIMEOUT_A=21600  # 6 hours for Project A
TIMEOUT_B=3600   # 1 hour for Project B

# Create session with Project A — interactive build (no tee/script — emacs needs raw tty)
/usr/bin/tmux -L "$TMUX_SOCKET" new-session -d -s "$SESSION" -c "$RUN_DIR/project-a" \
  "touch .agent-running; date -Iseconds > ../project-a.start; timeout $TIMEOUT_A bash run-build.sh $AUTO_FLAG; date -Iseconds > ../project-a.end; rm -f .agent-running; echo '=== Project A finished ==='; bash"

# Split right for Project B — single prompt, no harness
/usr/bin/tmux -L "$TMUX_SOCKET" split-window -h -t "$SESSION" -c "$RUN_DIR/project-b" \
  "touch .agent-running; date -Iseconds > ../project-b.start; timeout $TIMEOUT_B bash run-build.sh; date -Iseconds > ../project-b.end; rm -f .agent-running; echo '=== Project B finished ==='; bash"

# Split bottom for dashboard
/usr/bin/tmux -L "$TMUX_SOCKET" split-window -v -t "$SESSION" \
  "$SCRIPT_DIR/judge/dashboard.sh '$RUN_DIR/project-a' '$RUN_DIR/project-b'"

# Layout: top row split evenly (B | C), bottom row for dashboard
/usr/bin/tmux -L "$TMUX_SOCKET" select-layout -t "$SESSION" tiled
# Resize: make the two top panes equal width, dashboard smaller at bottom
/usr/bin/tmux -L "$TMUX_SOCKET" select-pane -t "$SESSION":1.3
/usr/bin/tmux -L "$TMUX_SOCKET" resize-pane -t "$SESSION":1.3 -y 10

# Enable tmux pipe-pane logging for both project panes
# This captures all terminal output without interfering with tty (works with emacs)
/usr/bin/tmux -L "$TMUX_SOCKET" pipe-pane -t "$SESSION":1.1 -o "cat >> $RUN_DIR/project-a.log"
/usr/bin/tmux -L "$TMUX_SOCKET" pipe-pane -t "$SESSION":1.2 -o "cat >> $RUN_DIR/project-b.log"

echo -e "${GREEN}Experiment running! Attaching...${NC}"
echo ""
echo "When both agents complete, run:"
echo "  ./judge/finalize.sh $RUN_DIR"
echo ""

# Attach immediately so the user sees everything from the start
exec /usr/bin/tmux -L "$TMUX_SOCKET" attach -t "$SESSION"
