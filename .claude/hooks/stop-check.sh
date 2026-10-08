#!/usr/bin/env bash
# Sends failing fast checks back to Claude Code when it tries to finish a turn.
CHECK_CMD="npm run -s check"
input=$(cat)
# Already blocked once this turn: let Claude Code stop, so this can't loop.
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
# Nothing changed since the last commit: nothing to check.
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  exit 0
fi
if ! out=$($CHECK_CMD 2>&1); then
  printf '%s\n' "$out" | tail -n 40 >&2
  echo "Fast checks failed ($CHECK_CMD). Fix them before finishing, or say why not." >&2
  exit 2
fi
exit 0
