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
errors, `name`, `is_available`). Interpretation, refinement planning, prompts,
routes, models, and observability use that interface and know nothing about
any vendor. Each provider is an adapter that implements it, and
`app/providers/registry.py` maps `AI_PROVIDER` to the adapter's factory.
Settings only checks generic invariants; the registry rejects unknown
providers at startup and each factory validates what its provider needs.

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
guarantees of other providers.

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
counts, `requestId`) and never prompts, outputs, or headers. The request id
comes from the API's `X-Request-Id`. See
[`docs/engineering/ai-data-handling.md`](../../docs/engineering/ai-data-handling.md).
