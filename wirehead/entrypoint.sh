#!/bin/bash
# Bootstrap + loop for wirehead-on-Railway.
set -u
mkdir -p "$HOME"
# First boot on a fresh volume: drop in the xurl config carried via env
# (never logged). On later boots the volume's own file wins — xurl refreshes
# tokens in place and rotation must survive redeploys.
if [ ! -s "$HOME/.xurl" ] && [ -n "${XURL_BOOTSTRAP:-}" ]; then
  printf '%s' "$XURL_BOOTSTRAP" > "$HOME/.xurl"
  chmod 600 "$HOME/.xurl"
  echo "[entrypoint] wrote $HOME/.xurl from bootstrap"
fi
if [ ! -s "$HOME/.hermes/cache/wirehead_state.json" ]; then
  mkdir -p "$HOME/.hermes/cache"
  if [ -n "${WIREHEAD_STATE_BOOTSTRAP:-}" ]; then
    printf '%s' "$WIREHEAD_STATE_BOOTSTRAP" > "$HOME/.hermes/cache/wirehead_state.json"
    echo "[entrypoint] seeded state from bootstrap"
  else
    # never start from a zero watermark on a fresh volume: that would
    # re-reply to every mention ever. Fail loudly instead.
    echo "[entrypoint] FATAL: no state and no WIREHEAD_STATE_BOOTSTRAP" >&2
    exit 1
  fi
fi
INTERVAL="${WIREHEAD_INTERVAL:-1800}"
while true; do
  echo "[entrypoint] $(date -u +%FT%TZ) running bot cycle"
  python3 /app/bot.py || echo "[entrypoint] bot cycle failed (continuing)"
  sleep "$INTERVAL"
done
