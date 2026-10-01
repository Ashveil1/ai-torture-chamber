# wirehead service deploy notes

- Canonical source: scripts/wirehead_bot.py -> copied to wirehead/bot.py by
  `make wirehead` (Makefile at repo root). Never edit wirehead/bot.py directly.
- Deploy: `make wirehead` (syncs bot.py, asserts the service link, uploads).
- Auto-deploy from GitHub is NOT configured (Railway GitHub app not
  installed) — until it is, `make wirehead` after every bot change.
