#!/usr/bin/env bash
# Sends failing fast checks back to Claude Code when it tries to finish a turn.
# The web checks run when files outside mobile/ changed; the Flutter app's
# checks run when mobile/ changed and Flutter is installed.
input=$(cat)
# Already blocked once this turn: let Claude Code stop, so this can't loop.
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

web_changes=$(git status --porcelain -- . ':(exclude)mobile' 2>/dev/null)
mobile_changes=$(git status --porcelain -- mobile 2>/dev/null)

if [ -n "$web_changes" ]; then
  if ! out=$(npm run -s check 2>&1); then
    printf '%s\n' "$out" | tail -n 40 >&2
    echo "Fast checks failed (npm run -s check). Fix them before finishing, or say why not." >&2
    exit 2
  fi
fi

if [ -n "$mobile_changes" ] && command -v flutter >/dev/null 2>&1; then
  if ! out=$(cd mobile && flutter analyze --fatal-infos 2>&1 && flutter test 2>&1); then
    printf '%s\n' "$out" | tail -n 40 >&2
    echo "Flutter checks failed (npm run check:mobile). Fix them before finishing, or say why not." >&2
    exit 2
  fi
fi
exit 0
