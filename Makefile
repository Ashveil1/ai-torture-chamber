# ai-torture-chamber ops — fast deploys + fast feedback.
# Convention: each deploy target ASSERTS its railway service link first
# (per-directory links have bitten us: a stale link deployed chamber code
# to forgejo). See SESSION_RESUME.md CAUTION note.

# NOTE: the wirehead X bot lives in its own repo, terrafying/wirehead-bot,
# deployed to the separate Railway project "wirehead" (bc539e96-…). Do NOT
# re-add a wirehead deploy target here — two writers on that service caused
# a deploy war (2026-10-02).

RELAY_PROJECT = 11f1d169-3b88-40e7-a054-f4b79e89c138
RELAY_ENV = e1abb91d-1146-4601-aabf-cfb9a8eef2b2
RELAY_URL = https://saw-production-688b.up.railway.app
# the endpoint the RELAY actually uses (Railway env RUNPOD_ENDPOINT_ID).
# The old v4 endpoint (czgfu4ls4nhyp6, 4090, workersMin 0) is retired from
# serving — kept only as a spare.
RUNPOD_EP = dkcntqsm9y6n0g

.PHONY: relay worker smoke health status links site help

help:
	@echo "make relay      - deploy the CPU relay (live/ -> Railway saw)"
	@echo "make worker     - push; CI rebuilds the ghcr GPU worker image"
	@echo "make smoke      - full-path check: relay /health, runpod health, one GPU run"
	@echo "make health     - cheap: relay /health + runpod queue health only"
	@echo "make status     - railway deployment status for the saw project"
	@echo "make links      - show which railway service each directory is linked to"

links:
	@echo "== live/ =="; (cd live && railway status 2>/dev/null | grep -A1 Linked)

# ---- deploy targets -------------------------------------------------------
# `railway up` needs an ABSOLUTE path (a bare arg once uploaded the repo root)
# and the service rootDirectory must already point at the right dir.

relay:
	@cd live && railway service saw && railway up $$(pwd) -y -d 2>&1 | tail -2
	@echo "watch: make smoke  (give the model ~2-3 min to load)"

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
	@railway deployment list -p $(RELAY_PROJECT) -e $(RELAY_ENV) -s saw 2>&1 | head -4
	@echo "(see make links for which service each dir targets)"

# Site (Vercel). Git pushes to master auto-deploy; this is the manual path.
# Project rootDirectory = "site", so deploy from the REPO ROOT (from inside
# site/ the CLI double-scopes and fails); .vercelignore limits the upload.
SITE_URL = https://wirehead.agency
site:
	@grep -q '"prj_kiAviK8FEAcW2566QO1i9cwLERJ7"' .vercel/project.json || { echo "root .vercel/ not linked to the site project — run: vercel link --yes --project wirehead"; exit 1; }
	@vercel --prod --yes 2>&1 | grep -E "Aliased|Error" ; \
	curl -s -o /dev/null -w "live check: %{http_code}\n" -m 15 $(SITE_URL)/verify.html && \
	curl -s -o /dev/null -w "index: %{http_code}\n" -m 15 $(SITE_URL)/
	@echo "verify the NEW content is live (grep a unique new string), not just a 200"
