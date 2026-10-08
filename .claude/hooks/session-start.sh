#!/usr/bin/env bash
# Prints HANDOVER.md at session start, capped to fit the hook output limit.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
p=HANDOVER.md
if [ -f "$p" ]; then
  head -c 9000 "$p"
  if [ "$(wc -c < "$p")" -gt 9000 ]; then
    printf '\n[Truncated at 9000 bytes. Read HANDOVER.md for the rest.]\n'
  fi
else
  echo 'No HANDOVER.md yet. Follow "Start of every session" in AGENTS.md.'
fi
exit 0
