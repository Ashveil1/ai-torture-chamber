# ai-torture-chamber ops — fast deploys + fast feedback.
# Convention: each deploy target ASSERTS its railway service link first
# (per-directory links have bitten us: a stale link deployed chamber code
# to forgejo). See SESSION_RESUME.md CAUTION note.

RAILWAY_PROJECT = 11f1d169-3b88-40e7-a054-f4b79e89c138
RELAY_URL = https://saw-production-688b.up.railway.app
RUNPOD_EP = l75388nuqgxtmg
REPO = terrafying/ai-torture-chamber

.PHONY: relay wirehead worker smoke health status links help

help:
	@echo "make relay      - deploy the CPU relay (live/ -> Railway saw)"
	@echo "make wirehead   - sync bot + deploy the wirehead service"
	@echo "make worker     - build+push the GPU worker image (CI rebuilds ghcr)"
	@echo "make smoke      - full-path check: relay /health, runpod health, one GPU run"
	@echo "make health     - cheap: relay /health + runpod queue health only"
	@echo "make status     - railway deployment status for all three services"
	@echo "make links      - show which railway service each directory is linked to"

links:
	@echo "== live/ =="; (cd live && railway status 2>/dev/null | grep -A1 Linked)
	@echo "== wirehead/ =="; (cd wirehead && railway status 2>/dev/null | grep -A1 Linked)

# ---- deploy targets -------------------------------------------------------
# `railway up` needs an ABSOLUTE path (a bare arg once uploaded the repo root)
# and the service rootDirectory must already point at the right dir.

relay:
	@cd live && railway service saw && railway up $$(pwd) -y -d 2>&1 | tail -2
	@echo "watch: make smoke  (give the model ~2-3 min to load)"

wirehead:
	@cmp -s scripts/wirehead_bot.py wirehead/bot.py || \
	  (echo "syncing bot.py from scripts/"; cp scripts/wirehead_bot.py wirehead/bot.py; \
	   git add wirehead/bot.py)
	@cmp -s scripts/wirehead_bot.py wirehead/bot.py || \
	  (echo "FATAL: bot.py did not sync"; exit 1)
	@cd wirehead && railway service wirehead && railway up $$(pwd) -y -d 2>&1 | tail -2
	@echo "watch: railway logs (from wirehead/) — first cycle within ~1 min"

worker:
	@git push origin master
	@echo "CI (.github/workflows/build-worker.yml) rebuilds ghcr on live/** pushes;"
	@echo "watch: gh run watch --exit-status (or make smoke after it lands)"

# ---- feedback targets -----------------------------------------------------
health:
	@curl -s -m 15 $(RELAY_URL)/health
	@echo
	@set -a; [ -f $$HOME/.hermes/.env ] && . $$HOME/.hermes/.env; set +a; \
	curl -s -m 15 -H 'User-Agent: Mozilla/5.0' -H "Authorization: Bearer $${RUNPOD_API_KEY}" \
	  https://api.runpod.ai/v2/$(RUNPOD_EP)/health

smoke: health
	@echo "--- one real GPU run (costs one inject; urllib, any python) ---"
	@set -a; [ -f $$HOME/.hermes/.env ] && . $$HOME/.hermes/.env; set +a; \
	python3 ops/smoke_gpu.py
	@echo "--- relay-side delegation (SSE through /steer) ---"
	@curl -s -N -m 150 -X POST $(RELAY_URL)/steer -H 'Content-Type: application/json' \
	  -d '{"valence":"pain","dose":2}' | grep -c "^event: token" \
	  && echo "relay->runpod token events OK" || echo "RELAY DELEGATION FAILED"

status:
	@railway deployment list -p $(RAILWAY_PROJECT) 2>&1 | head -4
	@echo "(see make links for which service each dir targets)"
