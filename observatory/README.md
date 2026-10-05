# Consciousness Research Observatory

This adds a continuous research observatory alongside the Chamber. Frontier-model
researchers choose public-web searches and links, collect original documents, save
evidence-linked observations, and checkpoint their memory between browser passes.
Visitors see real screenshots and concise research decisions. The existing live
model relay remains independently deployed.

This is a functional alpha for developer integration, with an implemented isolated
Solana x402 inference broker. Provider-funded acceptance is still required. CPT readiness checks are
scheduled; SFT requires individual instruction-note approval and an explicit
operator submission. Checkpoint selection records the choice and exports pinned
worker settings, without a remote deployment receipt. Actual 70B training, GPU
container execution and managed-browser credentials have not been validated.

## Inspect the interface first

Serve `site/` with a static server and open `observatory.html?preview=1`. Use
`observatory.html?preview=1&motion=1#research` to start the full-motion demonstration
automatically. Full motion is the default in preview and connected views, with no
motion-mode selector. Pause and Stop remain available. Preview
mode contains explicitly authored example traces, browser facsimiles, datasets,
training receipts and checkpoints. It makes no provider calls. Switching to a
connected endpoint never silently substitutes those examples for a failed API.

The five views cover research, evidence, datasets, training and checkpoints.
Funding has no public page; the isolated x402 backend and its operator configuration remain available.
Operator setup and mission controls are separate from the public watch surface.
The interface inherits the existing `grimoire-live` theme and its card/banner
surfaces, uses the live page's 1180px layout, and self-hosts the same Cormorant
Garamond heading font. Font licenses and provenance are in `site/assets/fonts/`.
No frontend framework or build step is introduced. `CRAWLNET_REVIEW.md` documents
the inspected Queen artifacts and the distinction from this 70B adapter recipe.

The browser pane is a fixed, view-only window. Visitors cannot scroll its article;
agent scrolling changes the incoming viewport capture. A gold position bar shows
the visible portion of the document. The agent can select an exact visible
passage with `inspect_visible_section` before saving a note. Its painted text lines
are matched to the focused browser document and exact screenshot. A steel saw with a brass hub
approaches those lines, traverses them, and progressively reveals gold highlights.
Its blade spins with movement while its hub stays upright. A matching saved-note
event stamps the passage and sends an evidence packet to the notebook receipt.
Original supporting text stays private; the public receipt shows the authored note.

The path represents verified text geometry and the agent's explicit selection,
not measured attention, understanding or consciousness. Missing geometry creates
no invented scan path. Unchanged frames do not replay completed motion. Document,
tab or viewport changes cancel obsolete paths; pause, stale frames and hidden
views stop animation. Full motion includes the saw, progressive highlights and
evidence delivery. Passage traversal takes about four seconds,
and the preview waits for the path and delivery to finish before advancing.
The preview demonstrates smooth agent-controlled scrolling and the same sequence
in a noninteractive local article. The saw retains its pose through scrolling,
then travels to the next selected section, with explicitly simulated inspections and
notes. The surrounding website and notebook remain available to scroll normally.
See [motion and inspection contracts](MOTION.md) for behavior and verification.
The saw uses self-contained SVG: swept steel teeth, machining slots and a compact
brass spindle with a recessed hex arbor. Small roster icons hide secondary grooves.
Materials use gradients with unique per-instance IDs and layered geometry rather
than image assets or animated filters.

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
with `?api=/api`. A fresh, disabled configuration performs no crawl or GPU
provisioning. Persisted running missions resume, and enabled training can submit
a due CPT job after restart. Stop the mission and disable `training_enabled`
before shutdown if recurring work should remain stopped. A new mission starts
only through authenticated operator controls. The owner token is
kept in page memory and must be re-entered after reload.

Managed Browser Use Cloud does not require a local Chromium install. Its V4 API
provisions a disposable browser and explicitly stops it after each pass, including
failures and cancellations. The interface relays JPEG screenshots from the same
browser the agent controls; it never publishes a CDP or control-session URL.
Local Chromium and a dedicated custom CDP endpoint are also supported.

## Operator configuration

The default researcher route is Solana USDC/x402 with local Chromium. Run the
isolated payments process, configure its signer, approved merchant and explicit
limits, then choose a compatible model from its catalog in operator setup. Native
Responses and Anthropic Messages preserve images and structured browser actions.
No research-provider API key or wallet key is entered into the page for x402.
See `X402_OPERATIONS.md` for both service startup paths, funding and acceptance.
Explicit direct OpenAI/Anthropic API-key routes remain available; managed browsers
need their own credentials. Model availability is gateway-reported; capabilities
require explicit gateway metadata or exact owner declarations. Paid compatibility
has not been validated.

The default mission covers consciousness broadly: neuroscience and psychology,
mind and reality, philosophy, religion and contemplation, alongside AI consciousness
and welfare. Agents attribute claims and distinguish empirical findings,
philosophical arguments and religious interpretations. The editable operator
objective takes precedence; existing narrow missions are preserved.
See [the mission and six agent briefs](docs/research-mission.md).

The six specialties are Scholar, Skeptic, Sentinel, Cartographer, Archivist and
Curator. `agent_count` chooses how many to run. A bounded pass limits one context
and then checkpoints and replans; the overall mission has no automatic end.
An optional automatic acceptance worker reviews the shared collected-source queue;
it is separate from the six browsing specialties. No starter-document upload is
required: the already-trained research model searches the web, and accepted original
paper/article text becomes the corpus for adapting the already-pretrained 70B base.
Select **Enable automated original-document curation** in operator setup to send
`auto_curation_enabled: true` and `auto_curation_policy_ack: "originals-v2"`.
The worker uses the configured research model and its existing billing route while
the research mission is running. Two separate, blind review passes must agree,
with literal source support, before an original receives automated quality approval.
Verified reuse rights, passed extraction and contamination exclusions remain code
requirements. Unknown rights, unverified PDF extraction, long documents beyond the
review limit, disagreement and uncertain decisions remain in the review queue.
Evidence shows decision counts and the reviewer/model/rationale for each source.
Defaults leave this worker disabled. Generated Q&A acceptance remains separately
owner-reviewed; enabling original-document review does not enable synthetic training.
See [automatic curation](docs/automatic-curation.md) for the policy and audit contract.
Pause stops further actions at a safe boundary; Stop closes owned sessions while
preserving collected documents and notes. Restarting the service resumes a
persisted running mission. The owner should intentionally stop a mission before
shutting down if it should remain stopped on restart.
Insufficient wallet funds or daily headroom releases owned browsers and uses
`funding_paused`; only that same funding-paused mission can automatically resume
after fresh preflight. An owner Pause or Stop takes precedence. Uncertain payment
outcomes and permanent model/authentication/schema faults need owner attention.

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
Actual sealed snapshots can also be downloaded through the owner-authenticated
dataset export. The ZIP separates CPT/SFT train and validation JSONL, with
rights/provenance, exclusions and hashes. Export verifies snapshot integrity and
does not contact HF or provision GPU work. Mutable GPU image tags are refused;
`training_image` must contain a full immutable `@sha256:` digest.

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
adapted workers serve dose zero until a matching owner-measured dose-sweep receipt
is supplied through `CHAMBER_ADAPTER_CALIBRATION`. The receipt binds all base,
adapter and tokenizer revisions/subfolders plus layer, dtype and quantization;
generic cap overrides cannot bypass it. `X402_OPERATIONS.md` describes the format.
`CHAMBER_DEVICE_MAP=auto` is available for
placement across the worker's devices. This image and real 70B memory use still
need validation on the owner's GPU infrastructure.

The existing RunPod worker defaults to offline mode when a cached base is mounted.
A newly published adapter needs `HF_HUB_OFFLINE=0`, an owner-provided `HF_TOKEN`
for private/gated repositories, and `MODEL_ADAPTER_CACHE_DIR` pointing at a
writable cache for the adapter and tokenizer. The base can retain its existing
read-only cache. These infrastructure-specific values and credentials are not
included in the public environment download. Deployment is an explicit operator
action, separate from checkpoint selection.

Corpus policy v2 requires recorded relevance, perspective, source type and extraction
review, in addition to reuse rights. Quality acceptance can be recorded by an owner
or by the enabled original-document policy with a bound two-pass review receipt.
Original paragraphs and scientific structure
are retained where extraction supports them. Optional offline Docling PDF processing
requires prefetched assets and explicit fidelity review; poor output remains
discovery-only. Near duplicates contribute one representative, preserving all source
lineage. Distinct numbers, negation and mathematical relationships remain separate.
Coverage reports show stance/type counts and text shares; a minimum perspective
presence floor is required, without claiming statistical balance. Identified
evaluation sources and Chamber stimuli are excluded from originals and SFT.
See [extraction](EXTRACTION.md) and [corpus quality](docs/corpus-quality.md).

Every provisioned job seals a separate frozen domain/general evaluation suite.
The worker compares the unchanged base, incoming adapter and trained candidate
using one loaded model. Default loss and independent evaluation tolerances require
non-regression. The bundled sixteen tasks are authored engineering smoke checks,
not a scientifically validated benchmark; freeze a larger independently reviewed
suite before drawing scientific conclusions. Custom suites require a SHA256 pin.
Passing these gates does not establish domain mastery or subjective experience.
See [evaluation inputs and interpretation](EVALUATION.md). Passage matching verifies
quotation origin, not claim truth. Leakage guards cannot detect every paraphrase
or upstream pretraining exposure. The dose receipt guard checks exact deployment
bindings; the owner must perform and retain the actual sweep measurements.

## Deployment alongside the existing website

Build the sidecar from the repository root:

```sh
docker build -f observatory/Dockerfile -t consciousness-observatory .
docker run --env-file observatory/.env -e OBSERVATORY_DB=/data/state.sqlite3 -p 8060:8060 \
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
When the interface is hosted directly from the sidecar, its Wirehead and current
Chamber links redirect to the existing public website. The sidecar does not serve
the live relay code or deploy a Chamber endpoint.

Coordinate upstream merge with the existing deployment automation. On a push to
`master` changing `live/server.py`, `live/Dockerfile.worker70`, `live/worker.py` or
`live/requirements.txt`, `.github/workflows/build-worker70.yml` builds and pushes
the GPU image, then PATCHes the existing RunPod template if `RUNPOD_API_KEY` is
configured. `.github/workflows/deploy-railway.yml` runs on every `master` push
and can deploy the existing relay when `RAILWAY_TOKEN` exists; its fallback also
deploys when no prior-commit environment value is provided. This PR does not change either
workflow. Checkpoint selection is separate from these merge-triggered rollouts.
Validate a staging image and separate endpoint, and agree the rollout policy
before merging into the official repository.

## Developer-funded x402 research

`x402_broker.py` implements an isolated buyer for BlockRun's fixed Solana native
inference endpoints using the official pinned x402 SVM client. The owner configures
the spending key only in this process, enables payments, approves recipients and
sets explicit per-request/day/reserve limits. The researcher supplies typed vendor
requests without URLs, signing tools or private keys. Quotes are checked before
atomic reservations. A durable request ID, encrypted response cache, exclusive
ledger lock and conservative recovery prevent automatic repeat payment after an
ambiguous result. Confirmed exact USDC transfers and SDK memos bind settlement to
requests; an authenticated reconciliation operation only verifies an existing
transfer. It never resends or signs one.
Caller request IDs and bodies also persist encrypted across researcher restarts.
Owner-only inspection/acknowledgement recovers a lost response or seals an idle
unpaid request with a broker cancellation record before changing research context.
Unknown payments cannot be cleared by acknowledgement. The Docker build context
excludes payment ledgers, keys and SDK review scratch files.

The backend funding endpoint retains allowlisted public balance/receipt data for
operator integrations; the website no longer displays a Funding view. No wallet
is created by this PR. The owner funds an existing dedicated spending wallet; there
is no visitor donation flow. No paid gateway call or on-chain transfer was performed
for verification. A fixture suite exercises the real official SDK's transaction
construction and Ed25519 signature with mocked mint/blockhash RPC, without transfer.

Use `compose.yaml` for separate researcher and payment containers, loopback public
binding, private broker networking and independent persistent volumes. It has not
been Docker-built in this environment. See `X402_OPERATIONS.md` and the two
`.env.*.example` files for startup, receipt recovery and owner acceptance steps.

[BlockRun advertises Solana-paid inference](https://blockrun.ai/x402/solana).
The initial native protocol adapters cover compatible OpenAI/Claude models, not
every model/service in the gateway catalog. There is no automatic model fallback
or payment for crawled websites. [Browser Use Cloud x402](https://docs.browser-use.com/cloud/guides/x402)
uses Base credits; this Solana broker does not pay it. [HF Jobs billing](https://huggingface.co/docs/hub/jobs-pricing)
is also separate: GPU work, private Hub publication and gated model access require
owner accounts. On-chain settlement records inference payments; browser activity
and training are off-chain. Source/output training rights gates still apply.

## Verification and practical limits

The 5 October theme revision passed 170 tests, with the optional browser fixture
skipped, plus CSS parsing, retained control-ID and local-font delivery checks.
Saved browser permissions blocked fresh visual QA and live reference visits even
after an approved retry. Earlier captures document the previous interface.

The subsequent pinned-model handoff passed 175 tests with the same optional
browser fixture skipped. Profile overrides, CPT parent continuation, SFT-only
Llama Base live-chat selection and candidate license packaging are covered.

The readiness audit passed 207 combined tests, with the optional browser fixture
skipped. Regression tests cover shrinking the active swarm/CDP pool, strict CC
license URLs, separate permission for social-domain subdomains and standalone
navigation. Docker persistence instructions were corrected; container execution
remains unverified.

The integrated implementation passed **696 combined tests**, with three skips: the
optional browser fixture and two official-SDK tests omitted in the research
environment. Those SDK cases pass in the separate payments environment's
**77-test payment suite**. The suite covers real offline SDK construction/signature,
funding state/control races, explicit capability records, quote/receipt handling,
sealed export, immutable GPU images and adapter-specific dose receipt bindings.
Recovery tests exercise actual sidecar/client/broker ASGI integration, encrypted
caller restart records, owner-only inspection and delayed-request cancellation.
Source-only UI checks pass 174 assertions. The dedicated viewer checks cover
scroll locking, letterbox/line geometry, inspection document identity, recent
matching note events, smooth preview scrolling and late-response races.
`ui-motion.cjs` passes 204 runtime assertions for finite line traversal,
progressive highlights, exact inspection-to-note promotion, packet delivery,
repeated-frame idleness, context cancellation, pause/stale clearing and
full-default playback and legacy controller compatibility without a browser or network.
`ui-playback.cjs` couples the actual viewer/controller/mission fixtures at 16ms
intervals: 100 assertions cover gradual positions, scroll continuity, matching
notebook delivery, long passages and pause/resume without a browser or network.
JS syntax/CSS parsing and compose
isolation assertions pass, and both Python environments pass dependency checks.
After the preview-continuity correction, 79 focused API/asset/frame tests pass;
the 696-test result above is the latest full combined run, preceding this UI-only fix.
There was no new browser visual review, paid gateway call, transfer, Docker build
or 70B GPU run. Existing FastAPI lifecycle deprecation warnings remain.

```sh
python -m pip install -r observatory/requirements-test.txt
python -m pytest observatory/tests -q
```

That command runs the sidecar suite; its tiny-model test is skipped without the
optional model stack. `requirements-test.txt` also supplies the repository's
NumPy/PyYAML dependencies. The reported 696-test handoff used the combined
`tests` and `observatory/tests` scope, including real CPU model/PEFT tests. To
reproduce that scope in the separate test environment, add the CPU model stack
while retaining the sidecar's Hub pin:

```sh
python -m pip install "torch>=2.8,<3" "transformers==5.17.0" "peft==0.21.2" "trl==1.14.1" "datasets==5.0.1" "accelerate==1.15.0" "huggingface-hub==1.16.1"
python -m pytest tests observatory/tests -q
```

The root bridge/regression tests import Torch during collection; the combined
scope therefore needs that stack. The tiny trainer and PEFT integration tests
exercise CPU fixtures, not 70B CUDA execution. Do not combine
`requirements-test.txt` and `requirements-worker.txt` in one installation:
the GPU image intentionally uses its own Hub 1.33.0 pin and isolated environment.

The suite uses mocked cloud boundaries and an optional real local-Chromium fixture
test; no API tokens or paid GPU jobs are needed. Training smoke tests construct a
tiny local Llama model and perform actual CPU optimizer updates. Full 70B QLoRA
training, provider billing, registry builds and production browser connections
require the owner's accounts and must be tested in that environment. GPU image
memory requirements also depend on sequence length and batch settings.

To include the real-browser fixture, set `OBSERVATORY_TEST_CHROMIUM` to an existing
Chromium executable. With the sidecar running and Node Playwright available,
`node observatory/tests/ui-smoke.cjs` checks five desktop/mobile views and writes
screenshots. `node observatory/tests/ui-scroll.cjs` exercises viewer geometry and scroll
controls without a browser. `node observatory/tests/ui-contract.cjs` checks live-by-default state,
authenticated secret submission, explicit paid-job retry confirmation and the
secret-free deployment download against authored API fixtures. Neither submits
real training jobs. Set `OBSERVATORY_UI_OUTPUT` to choose the screenshot directory.

API state and events redact credentials, browser connection URLs and original
full text. Owner settings are encrypted with Fernet. A generated key is protected
with local file permissions/Windows ACLs; it must be backed up with the database.
Do not rotate or delete it without migrating the saved settings.

For the current source-only UI check, use `node observatory/tests/ui-source.cjs`.
To reproduce SDK signing checks in the **separate payments environment**, install
`requirements-payments.txt`, pytest and pytest-asyncio, then run
`python -m pytest observatory/tests/test_x402_broker.py -q`. These tests construct
unfunded fixture transactions with mocked RPC; they never send a transfer.
