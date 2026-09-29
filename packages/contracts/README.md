# @blendify/contracts

Shared Zod schemas and inferred TypeScript types. It is the source of truth
for the HTTP boundary between `apps/api` and `apps/web` and for the wire
contract between the API and the AI service (`apps/ai`).

Both apps depend on this package and infer their types from the schemas
instead of redefining shapes. Domain entities in the API may intentionally
differ from these DTOs.

## Entry points

| Import | Contents |
|---|---|
| `@blendify/contracts` | Request, response, error, playlist recipe, stats, and Create with AI session schemas (`src/index.ts`). |
| `@blendify/contracts/ai-service` | Wire contract between the API and the AI service (`src/ai-service.ts`). |

## AI-service contract

The Zod schema is the owner. Python mirrors it with Pydantic models, and both
sides are checked against `ai-service/ai-service.contract.json` (normalized
schema) and `ai-service/ai-service.fixtures.json` (shared examples).

To change the contract:

1. Edit the Zod schema in `src/ai-service.ts`.
2. Run `npm test -w @blendify/contracts -- -u` to update the normalized files.
3. Update the Pydantic models in `apps/ai/app/models/` until `npm run test:ai`
   passes.

Request models carry only user-authored text and AI-safe state. Do not add
fields for provider data. See [`apps/ai/README.md`](../../apps/ai/README.md).

## Commands

```bash
npm run build:contracts          # tsc, emits dist/ (other workspaces consume dist)
npm test -w @blendify/contracts  # Vitest
```

`npm run build`, `npm test`, and the API and web builds rebuild this package
first.
