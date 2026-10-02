# Blendify AI service

Private FastAPI service that interprets user-authored playlist requests for
Create with AI. It turns text into typed, validated structured output and
nothing else. It is not an npm workspace: Python 3.13 and dependencies are
managed with [uv](https://docs.astral.sh/uv/).

Product overview: [root README](../../README.md). Production settings:
[`docs/deployment.md`](../../docs/deployment.md) (section 19). Data handling
and logging: [`docs/engineering/ai-data-handling.md`](../../docs/engineering/ai-data-handling.md).

## What it may and may not do

| | |
|---|---|
| **Does** | Interpret a prompt into a `PlaylistIntent`, plan a refinement as an `IntentPatch`, validate the model's structured output, and report token usage and typed errors. |
| **Receives** | Only user-authored text (the prompt, refinement text, names the user wrote) and AI-safe structured state (intent, what to preserve, unsupported constraints). Request models are strict and reject anything else. |
| **Never receives** | Spotify, Last.fm, or Soundiiz data; provider IDs, URLs, artwork, or tracks; playlists or destination state; Spotify tokens, cookies, or user identifiers. |
| **Never does** | Call Spotify, Last.fm, or Soundiiz; choose tracks; store prompts or outputs; log prompts, model output, or provider content. |

The API decides what happens with an interpretation. Deterministic application
code resolves artists and tracks and builds the playlist.

## Boundary

Only the NestJS API calls this service, over Railway's private network. It has
no public domain and no CORS policy, and browsers never reach it.

| Route | Purpose |
|---|---|
| `GET /health` | Process and configuration status; no auth, no model call. |
| `POST /v1/intent/interpret` | Prompt to intent. |
| `POST /v1/refinement/plan` | AI-safe refinement request to an intent patch. |

Every route except `/health` requires `Authorization: Bearer <AI_SERVICE_TOKEN>`
(constant-time comparison; with no token configured, those routes reject every
request). `/docs` and `/openapi.json` are disabled when
`AI_SERVICE_ENV=production`.

## Contract

The wire contract is owned by
[`@blendify/contracts/ai-service`](../../packages/contracts/README.md) (Zod).
The Pydantic models in `app/models/` mirror it, and both sides are tested
against the normalized contract and shared fixtures in
`packages/contracts/ai-service/`. To change it, edit the Zod schema, update the
fixtures with `npm test -w @blendify/contracts -- -u`, then update the Pydantic
models until `npm run test:ai` passes.

## Configuration

Copy `apps/ai/.env.example` to `apps/ai/.env`; it is the source for variable
names.

| Variable | Notes |
|---|---|
| `AI_SERVICE_ENV` | `development` (default) or `production`. Production refuses to start without a strong token. |
| `AI_SERVICE_TOKEN` | Shared with the API. At least 32 random characters in production. |
| `AI_PROVIDER` | Required, no code default: the name of a registered model provider, or `disabled` (the service runs and reports interpretation unavailable). An unknown name stops startup. |
| `AI_MODEL` | Required by real providers, no code default. An opaque string passed to the provider adapter; the service never interprets it. |
| `AI_PROVIDER_API_KEY` | Required by providers that authenticate. Authenticates this service to the configured model provider; read only by this service, never add it to the API or web app. |

`AI_SERVICE_TOKEN` and `AI_PROVIDER_API_KEY` are separate credentials:
the first authenticates API -> AI service, the second AI service -> model
provider.

### Provider-independent architecture

The service depends only on the `IntentModelProvider` interface in
`app/providers/model_provider.py` (request, result, token usage, generic
errors, `name`, `is_available`, `invocation_metadata`). Interpretation, refinement planning, prompts,
routes, models, and observability use that interface and know nothing about
any vendor. Each provider is an adapter that implements it, and
`app/providers/registry.py` maps `AI_PROVIDER` to the adapter's factory.
Settings only checks generic invariants; the registry rejects unknown
providers at startup and each factory validates what its provider needs.

`invocation_metadata` describes a real model invocation for tracing: the
GenAI convention values for provider and operation, and the configured
request model. An adapter that never calls a model (such as `disabled`)
returns `None`, and no model span is created for it.

Adding a provider means writing an adapter under `app/providers/<name>/`,
adding one entry to the registry, and setting the three variables above. Its
data-handling behavior (retention, training use, regions) must be reviewed
before it is enabled; see
[`docs/engineering/ai-data-handling.md`](../../docs/engineering/ai-data-handling.md).

### Currently supported providers

- `openai`: the current real model provider.
- `disabled`: no model; makes no requests and needs no model or key.

With a real provider, each request to the service is a paid model call.

```bash
AI_PROVIDER=openai
AI_MODEL=<OpenAI model>
AI_PROVIDER_API_KEY=<secret>
```

### OpenAI adapter

Everything OpenAI-specific lives in `app/providers/openai/`: the SDK client,
the Responses API request, the strict structured-output JSON Schema
(`output_schema.py`), SDK exception mapping to the generic errors, and
SDK log suppression. The adapter sends the versioned system prompt and the
request text with `store=false`, no tools, a 4,000 output-token cap, and SDK
retries off. The service itself bounds each operation with a timeout and at
most two model requests. These are properties of the OpenAI adapter, not
guarantees of other providers. Its model spans use `gen_ai.provider.name=openai`
and `gen_ai.operation.name=chat` (the GenAI conventions' value for the
Responses API); because SDK retries are off, each span is one HTTP request.

`AI_PROVIDER_API_KEY` replaces the former `OPENAI_API_KEY`, which is no
longer read.

## Local run

```bash
cp apps/ai/.env.example apps/ai/.env
npm run ai:sync       # uv sync --locked
npm run dev:ai        # http://127.0.0.1:8000/health
```

Set `AI_SERVICE_URL` and the same `AI_SERVICE_TOKEN` in `apps/api/.env` so the
API can reach it. Mix and Discover work without this service.

Submitting a prompt in `/app/ai` while `AI_PROVIDER` is a real provider makes a
real, billed model call. Use `AI_PROVIDER=disabled` for everyday UI work.

## Tests and lint

```bash
npm run test:ai       # pytest
npm run lint:ai       # ruff check and ruff format --check
```

Tests use fake providers; none may make a real model or provider call, and CI
needs no `AI_PROVIDER_API_KEY`. Layout follows concepts: `models/`, `providers/`
(generic contract and registry; one subpackage per provider adapter),
`prompts/` (versioned), `interpretation/`, `api/`, `config/`, `observability/`;
`evals/` holds the eval datasets and runner.

## Real-model evals (manual, paid)

```bash
ALLOW_PAID_AI_EVALS=true npm run eval:ai -- --confirm
```

The runner builds the provider through the same registry as the service. It
refuses unless `AI_PROVIDER` names a real provider (not `disabled`) and
`AI_MODEL` is set, the provider's own requirements hold (for example
`AI_PROVIDER_API_KEY`), `ALLOW_PAID_AI_EVALS=true` is on the command line
(never persisted in `apps/ai/.env`), and `--confirm` is written in full.
`--suite intent` (default) or `--suite refinement` selects the dataset.
Reports go to `apps/ai/evals/results/` (gitignored) and record the configured
provider and model, the response models, and provider-neutral run settings
(request budget per case, call timeout); provider-specific knobs such as
output-token caps are not part of the report.

Every real-model run needs explicit approval for that specific run; a
configured key is not authorization. Evals never run in CI, tests, hooks, or
any dev or build command. Details: `docs/deployment.md`, "Real-model evals".

## Observability

Metadata only. The service emits `ai.model_request` and `ai.model_call` JSON
events (operation, provider, model, prompt version, result, duration, token
counts, `requestId`, and `traceId`/`spanId` when tracing is active) and never
prompts, outputs, or headers. The request id comes from the API's
`X-Request-Id`. See
[`docs/engineering/ai-data-handling.md`](../../docs/engineering/ai-data-handling.md).

### Tracing (OpenTelemetry)

Optional, vendor-neutral tracing. It is **off by default** and no destination
is configured anywhere. Requests, use cases, and model invocations are traced.

**Ownership.** `create_app()` builds one `TelemetryRuntime` per application
(`app/observability/telemetry_runtime.py`), or uses the one passed in, and the
app owns it. The runtime holds its own SDK `TracerProvider`; it is never
registered as the process-global provider, so several apps (tests, reloads)
never share or replace each other's processors. Building the app starts
nothing: the FastAPI lifespan adds the single batch span processor (its export
thread and exporter) at startup and shuts the provider down at shutdown, with
no `atexit` hook. When disabled, the runtime is the OTel no-op provider: no
exporter, thread, or network activity, and spans have no valid trace context.
Telemetry configuration and secrets are not stored on `app.state`.

**Configuration** (`app/observability/telemetry_config.py`), read with
standard names but only the subset below; validated at startup only when
enabled, failing with a sanitized message that never echoes the endpoint or
headers:

| Variable | Behavior |
|---|---|
| `OTEL_SDK_DISABLED` | Application default `true`. Only `true`/`false`. |
| `OTEL_TRACES_EXPORTER` | `none` (default; spans are created but not exported), `console` (local diagnostics, stdout), or `otlp`. One value. |
| `OTEL_SERVICE_NAME` | Default `blendify-ai`. |
| `OTEL_RESOURCE_ATTRIBUTES` | Only `service.version` and `deployment.environment.name` (percent-decoded, at most 255 characters); any other key stops startup. `deployment.environment.name` defaults to `AI_SERVICE_ENV`; `service.version` is omitted unless supplied. |
| `OTEL_TRACES_SAMPLER` | Only `parentbased_traceidratio` (default). |
| `OTEL_TRACES_SAMPLER_ARG` | Ratio in [0, 1]; default `1.0`. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Required for `otlp`: the complete traces URL (no `/v1/traces` is appended). `https` only, without credentials or fragment; plain `http` only for `localhost`/`127.0.0.1`/`::1`. |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS` | Optional secret `name=value` pairs (URL-encoded values). Never logged or rendered. |
| `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT` | **Seconds** (the Python SDK's unit, not milliseconds); default 2, greater than 0 and at most 3 (the cap comes from the shutdown budget, see "Shutdown"). One deadline for each export including the exporter's own retries; it is a socket timeout, not a wall-clock limit (DNS resolution and slow-drip reads are not covered). |

OTLP uses HTTP/protobuf. Batch processor and span limits are fixed in code
rather than read from `OTEL_BSP_*`/`OTEL_SPAN_*`: queue 1,024 spans, batches
of 256, 5 s schedule delay; at most 64 attributes, 16 events, 8 links per span,
attribute values truncated to 256 characters. The processor's
`export_timeout_millis` is passed only so `OTEL_BSP_EXPORT_TIMEOUT` is never
read: SDK 1.45 ignores it. Shutdown behavior is described under "Shutdown".

**Other `OTEL_*` variables.** The installed SDK, exporter, and instrumentation
read more variables on their own. Where an explicit argument overrides the
read, it is passed and the variable is ignored: `OTEL_EXPORTER_OTLP_ENDPOINT`,
`OTEL_EXPORTER_OTLP_TIMEOUT`, `OTEL_EXPORTER_OTLP[_TRACES]_COMPRESSION` (export
is always uncompressed), `OTEL_BSP_*`, `OTEL_SPAN_*`,
`OTEL_PYTHON_[FASTAPI_]EXCLUDED_URLS`, and the SDK's internal-metrics flag (no
meter provider is used). Variables that cannot be overridden stop startup when
tracing is enabled, naming the variables but never their values:
`OTEL_EXPORTER_OTLP_HEADERS` (it would be merged into the export headers), the
generic and trace-specific `*_CERTIFICATE`, `*_CLIENT_KEY`, and
`*_CLIENT_CERTIFICATE` variables, the OTLP HTTP credential-provider variables,
`OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_*`,
`OTEL_PYTHON_INSTRUMENTATION_HTTP_CAPTURE_ALL_METHODS`,
`OTEL_SEMCONV_STABILITY_OPT_IN`, and `OTEL_PROPAGATORS`. Disabled telemetry
ignores all of them.

**Request spans** (`app/observability/request_tracing.py`). When enabled,
`create_app()` instruments only its own app with
`FastAPIInstrumentor.instrument_app`, passing the runtime's `TracerProvider`
explicitly. That provider object exists from app construction and is the one
the lifespan later attaches the processor to, so requests and the
`traceId`/`spanId` in model logs always refer to the same provider. Requests
served before startup or after shutdown are not exported. Disabled telemetry
installs no instrumentation at all. Each request gets one SERVER span named
`<METHOD> <route template>`; unmatched paths are named by the method only.
ASGI receive/send spans are off. `/health` and, outside production, `/docs`,
`/docs/oauth2-redirect`, and `/openapi.json` are not traced; exclusions match
the whole path only.

The OTel middleware wraps the whole stack, so `RequestCorrelationMiddleware`
and the error handlers run inside the request span. A valid lowercase UUID
`X-Request-Id` becomes the `blendify.request_id` span attribute, using the same
validation as the logs. Valid W3C `traceparent`/`tracestate` continue the
caller's trace; a missing or malformed header starts a new trace without
affecting the request. The instrumentation extracts context with the
process-global propagator and has no per-app option, so the default
propagator also parses a caller's `baggage` into the request context
(bounded by the W3C baggage limits). Nothing reads, records, or forwards it,
and no span attribute comes from it. Removing that extraction would need a
process-wide propagator change, which is out of scope; a future span processor
that copies baggage into spans must not be added without revisiting this.
Trace context is not authentication:
the internal bearer token still guards every business route, and parent-based
sampling follows the caller's sampled flag. Unsampled requests still log
`traceId`/`spanId`, even though their trace is not exported. No response
headers are added.

`instrument_app` also patches Starlette's `BackgroundTask.__call__`
process-wide, once, with the first instrumented app's tracer; the
instrumentation offers no option to skip it. The service defines no
background tasks, so nothing is traced through it today; if one is added, its
spans would go to that first app's provider. Per-app isolation of background
tasks is not verified.

**Use-case and model spans** (`app/observability/model_call_tracing.py`).
`create_app()` passes the runtime's `TracerProvider` to the interpreter and
the refinement planner; without one they use a no-op tracer, never the global
provider. Each operation gets one INTERNAL span, `blendify.ai.interpret` or
`blendify.ai.refine`, covering `StructuredModelCaller.call` (the output
validation and retry loop, the same boundary as the `ai.model_call` event).
Inside it, each provider invocation (one `generate_intent` call plus the
validation of its output, the same boundary as an `ai.model_request` event)
gets one CLIENT span named `{gen_ai.operation.name} {gen_ai.request.model}`.
A span is one adapter invocation, not one HTTP request: retries inside a
provider SDK would stay inside a single span. The existing retry loop makes
at most two invocations, so a recovered retry has two model spans, the first
`ERROR` and the second unset, under a successful use-case span. Requests
rejected before the use case (401, 422) and the `disabled` provider create no
model span; the disabled path still has its use-case span, failed with
`MODEL_UNAVAILABLE`. The model logs carry the `spanId` of the span active when
they are written: the model span for `ai.model_request`, the use-case span for
`ai.model_call`.

| Span | Attributes |
|---|---|
| Use case | `blendify.ai.operation`, `blendify.ai.prompt.version` (the version sent), `blendify.request_id` (when valid), `blendify.ai.result` (`completed`/`failed`), `blendify.ai.outcome` (the result's own bounded outcome), `blendify.ai.error_code` (the service error code). |
| Model | `gen_ai.provider.name`, `gen_ai.operation.name`, `gen_ai.request.model` (from the adapter), `gen_ai.response.model` (only if the provider reported it), `gen_ai.usage.input_tokens`/`output_tokens` (only if reported, for this invocation alone), `blendify.ai.operation`, `blendify.ai.prompt.version`, `blendify.ai.attempt` (1-based, as in the logs), `blendify.ai.result` (the `ai.model_request` result), `blendify.ai.validation_error_count` (count only). |

Usage is never summed onto the use-case or request spans; the aggregate stays
in `ai.model_call`. A failure sets status `ERROR` and `error.type`: the
request result (`timeout`, `rate_limited`, `unavailable`, `misconfigured`,
`invalid_output`) on model spans, the service error code on the use-case span,
and `_OTHER` when an unexpected exception or a cancellation ends the span
(the exception is re-raised unchanged). Exceptions are never recorded on these
spans and status descriptions are never set. `needs_clarification` is a
successful outcome, not an error. GenAI names follow the GenAI semantic
conventions (development status, unreleased) at commit
[`b31e9e8ea26ac1c086d3313d474e31d7c3f391ae`](https://github.com/open-telemetry/semantic-conventions-genai/blob/b31e9e8ea26ac1c086d3313d474e31d7c3f391ae/docs/gen-ai/gen-ai-spans.md),
the `main` head on 2026-10-02. Every name and value used here was checked
against that commit: span kind `CLIENT`, span name
`{gen_ai.operation.name} {gen_ai.request.model}`, `gen_ai.provider.name`
(`openai`), `gen_ai.operation.name` (`chat`), `gen_ai.request.model`,
`gen_ai.response.model`, `gen_ai.usage.input_tokens`/`output_tokens`, and
`error.type` (stable, semantic conventions v1.44.0). The implementation was
first written against `main` as read on 2026-10-01, without recording a
commit; that commit is unknown and is not claimed to be this one. The
constants are defined in `span_privacy.py` because the installed
`opentelemetry-semantic-conventions` 0.66b0 marks its copies as moved.
`gen_ai.prompt.version` is not used because the conventions require it only
together with a `gen_ai.prompt.name`, which the service does not have.

**Export allowlist** (`app/observability/span_privacy.py`). Every exporter,
console included, receives copies of spans that keep only the exact attribute
names listed there: the HTTP attributes `http.method`, `http.route`,
`http.status_code`, `http.scheme`, `http.flavor`; `blendify.request_id`; the
use-case and model attributes in the table above; and `error.type`. No
attribute is allowed by prefix. Span events (including recorded exceptions) are
dropped, link attributes are removed, and status descriptions are cleared.
URLs, query strings, raw paths, host, user agent, peer address, headers,
bodies, and exception messages are never exported. HTTP attribute names are the
instrumentation's default (legacy) HTTP conventions, because the stable-names
opt-in is process-wide and only set through `OTEL_SEMCONV_STABILITY_OPT_IN`.
SERVER span status follows the HTTP rule: 5xx is `ERROR`, while a handled 4xx
such as 401 stays unset.

**Export pipeline.** `BatchSpanProcessor` → `ShutdownWindowSpanExporter`
(`app/observability/span_export_safety.py`) → `PrivacySpanExporter` → the
console or OTLP exporter. It is the only processor on the runtime's provider.

**Sampling.** `parentbased_traceidratio`: a request without a parent is
sampled when its trace ID falls under `OTEL_TRACES_SAMPLER_ARG`; a request with
a valid `traceparent` follows the caller's sampled flag, whatever the ratio;
use-case and model spans follow their request. Verified for ratios 0 and 1 and
for sampled and unsampled parents (`tests/test_telemetry_sampling.py`).
Consequences:

- The ratio is not a volume cap. Any caller that sends sampled `traceparent`
  headers gets all of its requests exported. The only bounds are the request
  rate, at most four spans per request (request, use case, two model
  attempts), and the queue, which drops spans when full. Today the API is the
  only caller and is not instrumented, so it sends no `traceparent`.
- Head sampling decides when a trace starts, before the outcome is known: at
  ratio 0.1 about 90 % of failed requests are not exported either. Keeping all
  errors would need tail sampling (a Collector), which is out of scope.
- Unsampled requests still create valid trace context, so the model logs carry
  `traceId`/`spanId` for traces that were never exported.

**Export failures.** A span is appended to the in-memory queue when it ends
(non-blocking); requests never wait for an export, which runs on one
background thread. A backend that is down, refuses connections, does not
answer, returns errors, an exporter that raises, and a full queue leave
response status and body, the retry loop, provider call counts, and `/health`
unchanged (`tests/test_telemetry_export_failures.py`, compared with telemetry
disabled). The service adds no export retries; the OTLP exporter retries 429,
502, 503, 504, and connection errors only within its timeout.

Memory and export duration are bounded differently:

- **Queue and memory: hard bound.** At most 1,024 queued spans (when full, the
  oldest is dropped and the SDK logs `Queue full, dropping Span.`,
  deduplicated over about 20 s) plus one batch of at most 256 spans being
  exported, each span within the limits above. This holds whatever the
  backend does.
- **Export duration: not a wall-clock bound.**
  `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT` is a urllib3 socket timeout: it bounds
  connecting and each wait for data, so an export to a backend that refuses,
  errors, or stays silent ends within it. DNS resolution is not covered, and a
  server that keeps sending bytes slowly can extend a read indefinitely. A
  slow export never blocks requests (it only delays later batches, and the
  queue bound still applies), but it does affect shutdown (below).

The OTLP exporter and urllib3 put the endpoint into their own log messages
(a refused connection logs the full URL, path and query included; a timeout
logs host and port; verified with exporter 1.45.0). When an exporter is
attached, the runtime adds a filter to those loggers (`EXPORT_PIPELINE_LOGGERS`
in `span_export_safety.py`). A message is kept only if it is exactly one of the
static OpenTelemetry templates read from the installed sources
(`STATIC_EXPORT_LOG_TEMPLATES`); its arguments keep numbers and `None`
(status codes, counts, delays), exceptions become their class name, and any
other argument becomes `[redacted]`, for example
`Failed to export spans batch code: None, reason: ReadTimeoutError`. Every
other record (an already formatted message, a message without arguments, an
unknown template such as urllib3's connection logs, a non-string message)
becomes the fixed `Span export pipeline log redacted`, followed only by
exception class names, for example
`Span export pipeline log redacted [MaxRetryError]`. Tracebacks and stack
information are always dropped. Headers never appear in those messages. A
dependency upgrade that changes a template only makes that message fall back
to the fixed text. The filter is added once per process and is never removed;
it only redacts.

**Shutdown.** Three separate mechanisms are involved, and only the first is
controlled by the service:

1. **Clean application shutdown.** Railway starts `python -m app.server`,
   which runs uvicorn with `timeout_graceful_shutdown` set to 25 s
   (`REQUEST_DRAIN_TIMEOUT_SECONDS` in `app/server.py`). On `SIGTERM` uvicorn
   stops accepting connections, pauses 0.1 s, waits up to 25 s for requests in
   flight, cancels whatever is still running, and then runs the FastAPI
   lifespan shutdown, which calls `TelemetryRuntime.shutdown()`. From then on,
   exports may start only during the first second
   (`SHUTDOWN_EXPORT_WINDOW_SECONDS`); batches that would start later are
   dropped and counted in one warning.
2. **SDK wait.** `TracerProvider.shutdown()` joins the export thread for a
   fixed 30 s; the SDK API offers no shutdown timeout, and SDK 1.45 ignores
   the processor's export timeout (opentelemetry-python issues 4555 and 4568).
   This is a wait, not a cancellation: if the join expires, the SDK shuts the
   exporter down and returns, the application exits, and an export still
   running on the (daemon) export thread is abandoned when the interpreter
   exits.
3. **Railway's external cut.** Railway kills the process 30 s after `SIGTERM`
   (`drainingSeconds: 30` in `.railway/railway.ts`). This, not the SDK, is
   what ends the process at 30 s at the latest. On its own, the application
   could take up to about 25.1 s plus the 30 s join.

Shutdown budget, which holds only under the conditions in the last column:

| Phase | Budget | Condition |
|---|---|---|
| Requests in flight | ≤ 25 s + uvicorn's 0.1 s pause | The event loop is not blocked, so uvicorn's timer fires and cancelled requests unwind without waiting on anything slow. |
| Telemetry flush | ≤ 1 s window + export timeout (≤ 3 s) | Every export that starts in the window ends within `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT` (no DNS hang, no slow-drip server; see "Export duration" above). |
| Total | ≤ 29.1 s | Both conditions above. `tests/test_server.py` checks the sum against `drainingSeconds` read from `.railway/railway.ts`; it checks the arithmetic, not the conditions. |

The 24 s used to size the request phase is two model attempts of 12 s
(`MAX_OUTPUT_VALIDATION_ATTEMPTS` × `MODEL_CALL_TIMEOUT_SECONDS`) and covers
only the model calls. The rest of a request (reading the body, authentication,
validation, prompt construction, output validation, writing the response) is
local work with no timeout of its own; a request that starts just before
`SIGTERM` has 1 s left for it. A request still running at 25 s is cancelled
and its client gets a 500. `tests/test_server.py` checks this with the drain
timeout reduced to 0.2 s: the model call receives the cancellation, no request
task is still unfinished when telemetry shuts down, and the request's server,
use-case and model spans end and are exported. That outcome relies on event
loop ordering, because uvicorn cancels tasks but does not await them before
the lifespan shutdown; the test's provider unwinds without yielding. It is not
verified for the real OpenAI client: if its cleanup on cancellation yields to
the event loop, telemetry can shut down first and those spans are dropped (the
response is not affected).

Measured locally (`python -m app.server`, OTLP to a loopback socket that never
answers, timeout 3 s, no request in flight): 3.15 s from `SIGTERM` to exit.

When the telemetry condition does not hold (an export that already started
hangs in DNS resolution or on a slow-drip server), no public API can cancel
it: the OTLP exporter's `shutdown()` only interrupts retry back-off and closes
idle pooled connections. The export thread keeps running, the SDK waits in its
join, and Railway's `SIGKILL` ends the process 30 s after `SIGTERM`, before
that join can expire. Requests have already finished by then, because the
request phase comes first. What can be lost at any shutdown: spans of
cancelled requests whose cleanup yields (above), batches that do not start
within the window, a batch whose export fails, and everything still queued
when the process is killed. Delivery is never guaranteed. A hard limit under
those conditions is still pending: it needs an SDK shutdown that stops the
export itself, or a local Collector. A shorter wait would not provide it,
because the export would keep running after the wait ended. Lifespan shutdown
blocks the event loop while it waits, which is harmless because no request is
being served by then. The model provider's HTTP client is not closed
explicitly and has nothing to flush.

**Local diagnostics.** In `apps/ai/.env`, keep `AI_PROVIDER=disabled` (a
real provider makes every interpretation a paid call) and set:

```bash
OTEL_SDK_DISABLED=false
OTEL_TRACES_EXPORTER=console
```

Run `npm run dev:ai` and send a request:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/intent/interpret \
  -H "Authorization: Bearer <AI_SERVICE_TOKEN from apps/ai/.env>" \
  -H 'Content-Type: application/json' -d '{"prompt":"Radiohead and Interpol"}'
```

It answers 503 (interpretation unavailable), and stdout shows the request
span and the use-case span, with no model span; console output is
batched, so spans appear after up to 5 s or at shutdown. `/health` produces no
span.

**Optional local OTLP smoke.** Run any OTLP/HTTP receiver bound to loopback
(for example a local OpenTelemetry Collector or the Jaeger all-in-one image,
publishing port 4318 on `127.0.0.1` only, with an image tag you pin), then set
`OTEL_TRACES_EXPORTER=otlp` and
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces`. This
step is not automated; the tests use an in-process loopback receiver instead.

**No remote destination.** Nothing exports anywhere today. Traces cannot be
viewed remotely until an explicit backend is configured in a later,
authorized step (production setup and rollback:
[`docs/deployment.md`](../../docs/deployment.md), section 19.8).

**Future processors (for example Langfuse).** Privacy is applied by an
exporter wrapper inside this runtime's single batch pipeline, not by a span
processor. A processor or exporter added directly to the `TracerProvider`
would receive raw spans, with URLs, query strings, user agent, peer address,
and exception events, and would skip the allowlist, the shutdown window, and
the log redaction. A future integration must attach through the same export
path (or an equivalent filter applied before any data leaves the process),
review context propagation (caller baggage is present in the request context,
see above), and fit its own shutdown inside the same budget: the SDK shuts
processors down one after another, so a second processor's flush adds to the
total.
