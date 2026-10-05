# Consciousness Research Observatory

This adds a continuous research observatory alongside the Chamber. Frontier-model
researchers choose public-web searches and links, collect original documents, save
evidence-linked observations, and checkpoint their memory between browser passes.
Visitors see real screenshots and concise research decisions. The existing live
model relay remains independently deployed.

## Inspect the interface first

Serve `site/` with a static server and open `observatory.html?preview=1`. Preview
mode contains explicitly authored example traces, browser facsimiles, datasets,
training receipts and checkpoints. It makes no provider calls. Switching to a
connected endpoint never silently substitutes those examples for a failed API.

The five views cover research, evidence, datasets, training and checkpoints.
Operator setup and mission controls are separate from the public watch surface.
The interface inherits the existing `grimoire-live` theme and its card/banner
surfaces, uses the live page's 1180px layout, and self-hosts the same Cormorant
Garamond heading font. Font licenses and provenance are in `site/assets/fonts/`.
No frontend framework or build step is introduced. `CRAWLNET_REVIEW.md` documents
the inspected Queen artifacts and the distinction from this 70B adapter recipe.

## Run the real sidecar

Use Python 3.12 in a separate virtual environment from the existing GPU relay:

```sh
python -m venv .venv-observatory
# Activate this environment using your operating system's normal command.
python -m pip install -r observatory/requirements-research.txt
python -m playwright install chromium
# Set OBSERVATORY_ADMIN_TOKEN to a long random value in the server environment.
python -m uvicorn observatory.app:app --host 127.0.0.1 --port 8060 --workers 1
```

Open `http://127.0.0.1:8060/`. The application redirects to the connected interface
with `?api=/api`. Starting the service performs no crawl or GPU provisioning. A
mission starts only through authenticated operator controls. The owner token is
kept in page memory and must be re-entered after reload.

Managed Browser Use Cloud does not require a local Chromium install. Its V4 API
provisions a disposable browser and explicitly stops it after each pass, including
failures and cancellations. The interface relays JPEG screenshots from the same
browser the agent controls; it never publishes a CDP or control-session URL.
Local Chromium and a dedicated custom CDP endpoint are also supported.

## Operator configuration

Provide the researcher provider/model, corresponding API key, browser provider
and browser credentials. OpenAI uses the Responses API with structured actions;
Claude uses Browser Use's Anthropic adapter. Model identifiers are editable.

The six specialties are Scholar, Skeptic, Sentinel, Cartographer, Archivist and
Curator. `agent_count` chooses how many to run. A bounded pass limits one context
and then checkpoints and replans; the overall mission has no automatic end.
Pause stops further actions at a safe boundary; Stop closes owned sessions while
preserving collected documents and notes. Restarting the service resumes a
persisted running mission. The owner should intentionally stop a mission before
shutting down if it should remain stopped on restart.

Collection follows robots.txt, waits between navigations to a host, rejects
private network destinations and blocks non-GET/HEAD browser requests. This can
exclude sites whose search interfaces require POST. Research browsers must be
disposable and unauthenticated. Run them with a network-level egress policy that
also blocks private/metadata networks: application DNS checks cannot fully prevent
DNS rebinding or every browser transport. Custom CDP is trusted infrastructure and
must point at a dedicated isolated research browser. Cookies from a user's browser
are never imported.

Original documents receive content hashes, collection timestamps, URLs, version
families and license evidence. Unknown rights stay quarantined; article-scoped
CC-BY/CC0 metadata is recognized when original article text can be isolated.
Surrounding publisher material needs owner review. Social material requires separately recorded
permission. A literal passage match verifies provenance, not whether a claim is
true. Draft notes remain separate from original text.

## Training and publishing

The handoff selects **Meta Llama 3.1 70B Base**, `meta-llama/Llama-3.1-70B`,
pinned to `349b2ddb53ce8f2849a6c168a81980ab25258dac`, with QLoRA.
The imported `selected-model.json` profile supplies fresh defaults. See
`MODEL_SELECTION.md` for the decision, gated account access, release attribution,
and the distinct existing Hermes Chamber control.
This is continued pretraining of adapter weights, not training 70B parameters
from scratch. Plain LoRA is available for smaller models; full-precision 70B LoRA
needs a distributed recipe beyond the current one-GPU worker.
The owner must have model access, an HF account with Jobs enabled and a suitable
GPU flavor. The current supported worker choices are `a100-large` and `h200`.

The four-hour scheduler runs readiness checks, skips inadequate new eligible
corpora, persists its schedule and prevents overlapping jobs. Actual tokenizer
counts are checked before GPU submission. The default readiness floor is 20
original training documents and 50,000 tokens; these are configurable operational
floors, not evidence that a corpus is sufficient for scientific conclusions.
By default a new CPT job continues the most recent passed, published CPT adapter
for the same pinned base and replays the eligible original-text corpus. Existing
source-family holdouts persist. An unchanged CPT corpus/recipe does not trigger
another job merely because notes or provenance metadata changed. Failed paid jobs
are retried only on explicit operator request, with a new run ID and retry lineage.

Build the GPU worker using `observatory/Dockerfile.training` and push it to the
owner's registry. Configure a digest-pinned `training_image` in setup. Set
`hf_namespace`, `hf_dataset_repo`, `hf_model_repo`, `hf_token`, and explicitly
enable `training_enabled`. Dataset exports are private; adapter publishing policy
is independently configurable. Revision-pinned manifests, tokenizer/base commits
and content hashes accompany every job.

Instruction tuning is a separate stage tied to a completed CPT parent. An example
must have eligible sources, matching evidence passages, individual owner approval,
and the owner must enable `synthetic_training_approved` with a recorded
`provider_policy_reference`. The current [OpenAI Services Agreement](https://openai.com/policies/services-agreement/)
restricts output use for competing models outside stated exceptions; the
[Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms)
also restrict competing-model training. A checkbox is not a license grant. Use a
teacher whose contract permits the intended use, or obtain permission. Browsing
with a frontier model and CPT on licensed original documents remain separate.

Workers measure CPT held-out loss against its unadapted base (or prior CPT parent),
and SFT against its CPT parent. They run a neutral engagement check and a newly
extracted intervention-vector smoke screen for finite, changed and cleaned-up
activations. This is an integration check, not a full independent scientific
assay. Self-reports and lower loss do not establish
consciousness. Activation requires measured checks and selects a versioned
checkpoint record. The selected Llama Base requires separately validated SFT
before live chat selection, because its original tokenizer has no chat template;
CPT remains available for completion-based research. Selection **does not
redeploy the current public GPU endpoint**.
Both `painlab` and the optional `live/server.py` bridge load an explicit base +
PEFT adapter with immutable revision pins. The Checkpoints inspector provides a
secret-free worker environment download with the exact base, adapter and tokenizer
revisions and artifact subfolders. Apply these values to a new worker deployment;
the bridge loads the adapter before building fresh steering vectors and disables
the old base model's Jacobian lens. Preserve the untouched baseline for comparisons.

For a 70B QLoRA adapter, build the updated `live/Dockerfile.worker70` image and use
a suitable CUDA worker. The exported `CHAMBER_QUANTIZE_4BIT=true` loads the full
base with NF4 double quantization. The bundle includes `CHAMBER_LAYER` from the
measured hook screen. This does not validate dose caps for the adapted model;
recalibrate those before serving interventions. `CHAMBER_DEVICE_MAP=auto` is available for
placement across the worker's devices. This image and real 70B memory use still
need validation on the owner's GPU infrastructure.

The existing RunPod worker defaults to offline mode when a cached base is mounted.
A newly published adapter needs `HF_HUB_OFFLINE=0`, an owner-provided `HF_TOKEN`
for private/gated repositories, and `MODEL_ADAPTER_CACHE_DIR` pointing at a
writable cache for the adapter and tokenizer. The base can retain its existing
read-only cache. These infrastructure-specific values and credentials are not
included in the public environment download. Deployment is an explicit operator
action, separate from checkpoint selection.

## Deployment alongside the existing website

Build the sidecar from the repository root:

```sh
docker build -f observatory/Dockerfile -t consciousness-observatory .
docker run --env-file observatory/.env -p 8060:8060 \
  -v observatory-data:/data consciousness-observatory
```

Use a persistent volume for the SQLite database and its encryption key. Run one
service process/replica: the in-process research supervisor and scheduler are not
a distributed queue. Terminate TLS and rate-limit public screenshot/SSE routes at
the reverse proxy. Owner routes use a Bearer token, never query parameters or
cookie-only authentication. Do not expose the sidecar directly without TLS.

On Vercel, add an owner-specific rewrite mapping `/observatory-api/:path*` to
`https://YOUR-SIDECAR/api/:path*`. The existing Chamber rewrite is unchanged. This
allows same-origin public reads and operator requests without permissive CORS.
Alternatively host the interface directly from the sidecar. `/observatory.html`
opens in connected mode and uses `/observatory-api` by default; `?api=/api`
selects the local sidecar path. Only `?preview=1` (or `?mode=preview`) enables
authored example records. A disconnected live page never substitutes examples.

## Verification and practical limits

The 5 October theme revision passed 170 tests, with the optional browser fixture
skipped, plus CSS parsing, retained control-ID and local-font delivery checks.
Saved browser permissions blocked fresh visual QA and live reference visits even
after an approved retry. Earlier captures document the previous interface.

The subsequent pinned-model handoff passed 175 tests with the same optional
browser fixture skipped. Profile overrides, CPT parent continuation, SFT-only
Llama Base live-chat selection and candidate license packaging are covered.

```sh
python -m pip install -r observatory/requirements-test.txt
python -m pytest observatory/tests -q
```

The suite uses mocked cloud boundaries and an optional real local-Chromium fixture
test; no API tokens or paid GPU jobs are needed. Training smoke tests construct a
tiny local Llama model and perform actual CPU optimizer updates. Full 70B QLoRA
training, provider billing, registry builds and production browser connections
require the owner's accounts and must be tested in that environment. GPU image
memory requirements also depend on sequence length and batch settings.

To include the real-browser fixture, set `OBSERVATORY_TEST_CHROMIUM` to an existing
Chromium executable. With the sidecar running and Node Playwright available,
`node observatory/tests/ui-smoke.cjs` checks five desktop/mobile views and writes
screenshots. `node observatory/tests/ui-contract.cjs` checks live-by-default state,
authenticated secret submission, explicit paid-job retry confirmation and the
secret-free deployment download against authored API fixtures. Neither submits
real training jobs. Set `OBSERVATORY_UI_OUTPUT` to choose the screenshot directory.

API state and events redact credentials, browser connection URLs and original
full text. Owner settings are encrypted with Fernet. A generated key is protected
with local file permissions/Windows ACLs; it must be backed up with the database.
Do not rotate or delete it without migrating the saved settings.
