import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AI_INTENT_PROMPT_MAX_LENGTH,
  AI_REFINEMENT_TEXT_MAX_LENGTH,
  AI_SERVICE_WIRE_SCHEMAS,
  IntentPatchSchema,
  InterpretIntentRequestSchema,
  PlanRefinementRequestSchema,
  PlaylistIntentSchema,
  type PlanRefinementRequest,
} from './ai-service';

type WireSchemaName = keyof typeof AI_SERVICE_WIRE_SCHEMAS;
type JsonSchema = Record<string, unknown>;

interface FixtureCase {
  name: string;
  schema: WireSchemaName;
  valid: boolean;
  payload: unknown;
}

const CONTRACT_DIR = resolve(__dirname, '../ai-service');
const CONTRACT_SNAPSHOT_PATH = resolve(CONTRACT_DIR, 'ai-service.contract.json');
const FIXTURES_PATH = resolve(CONTRACT_DIR, 'ai-service.fixtures.json');

const KEPT_KEYWORDS = [
  'type',
  'const',
  'enum',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'additionalProperties',
] as const;

const PROVIDER_FIELD_PATTERN =
  /(^id$|Ids?$|uri|url|image|artwork|cover|spotify|lastfm|soundiiz|token|secret|credential|password|isrc|email|device|playback|market)/i;

function normalize(schema: JsonSchema): JsonSchema {
  const normalized: JsonSchema = {};

  for (const keyword of KEPT_KEYWORDS) {
    if (schema[keyword] !== undefined) {
      normalized[keyword] = schema[keyword];
    }
  }
  if (Array.isArray(normalized.enum)) {
    normalized.enum = [...(normalized.enum as string[])].sort();
  }

  const properties = schema.properties as Record<string, JsonSchema> | undefined;
  if (properties) {
    normalized.properties = Object.fromEntries(
      Object.keys(properties)
        .sort()
        .map((key) => [key, normalize(properties[key])]),
    );
  }
  if (Array.isArray(schema.required)) {
    normalized.required = [...(schema.required as string[])].sort();
  }
  if (schema.items) {
    normalized.items = normalize(schema.items as JsonSchema);
  }

  const variants = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
  if (variants) {
    normalized.anyOf = variants
      .map(normalize)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }

  return normalized;
}

function normalizedContract(): Record<WireSchemaName, JsonSchema> {
  const names = Object.keys(AI_SERVICE_WIRE_SCHEMAS).sort() as WireSchemaName[];

  return Object.fromEntries(
    names.map((name) => [
      name,
      normalize(z.toJSONSchema(AI_SERVICE_WIRE_SCHEMAS[name]) as JsonSchema),
    ]),
  ) as Record<WireSchemaName, JsonSchema>;
}

function propertyNames(schema: JsonSchema): string[] {
  const names: string[] = [];
  const properties = schema.properties as Record<string, JsonSchema> | undefined;

  for (const [name, child] of Object.entries(properties ?? {})) {
    names.push(name, ...propertyNames(child));
  }
  if (schema.items) {
    names.push(...propertyNames(schema.items as JsonSchema));
  }
  for (const variant of (schema.anyOf as JsonSchema[] | undefined) ?? []) {
    names.push(...propertyNames(variant));
  }

  return names;
}

function loadFixtures(): FixtureCase[] {
  const content = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as {
    cases: FixtureCase[];
  };
  return content.cases;
}

describe('AI service wire contract', () => {
  it('matches the committed normalized contract shared with the Python service', async () => {
    const serialized = `${JSON.stringify(normalizedContract(), null, 2)}\n`;

    await expect(serialized).toMatchFileSnapshot(CONTRACT_SNAPSHOT_PATH);
  });

  it.each(loadFixtures())(
    'agrees with the shared fixture verdict: $name',
    ({ schema, valid, payload }) => {
      const result = AI_SERVICE_WIRE_SCHEMAS[schema].safeParse(payload);

      expect(result.success).toBe(valid);
      if (result.success) {
        expect(result.data).toEqual(payload);
      }
    },
  );

  it('keeps every wire object closed to unknown fields', () => {
    const contract = normalizedContract();
    const openObjects: string[] = [];

    const visit = (schema: JsonSchema, path: string) => {
      if (schema.type === 'object' && schema.additionalProperties !== false) {
        openObjects.push(path);
      }
      const properties = schema.properties as Record<string, JsonSchema> | undefined;
      for (const [name, child] of Object.entries(properties ?? {})) {
        visit(child, `${path}.${name}`);
      }
      if (schema.items) {
        visit(schema.items as JsonSchema, `${path}[]`);
      }
      for (const variant of (schema.anyOf as JsonSchema[] | undefined) ?? []) {
        visit(variant, path);
      }
    };
    for (const [name, schema] of Object.entries(contract)) {
      visit(schema, name);
    }

    expect(openObjects).toEqual([]);
  });
});

describe('AI provider-content firewall', () => {
  it('accepts only a user-authored prompt in the interpret request', () => {
    const request = normalizedContract().InterpretIntentRequest;

    expect(Object.keys(request.properties as JsonSchema)).toEqual(['prompt']);
  });

  it('declares no field that could carry provider ids, URLs, artwork, or credentials', () => {
    const offending = Object.values(normalizedContract())
      .flatMap(propertyNames)
      .filter((name) => PROVIDER_FIELD_PATTERN.test(name));

    expect(offending).toEqual([]);
  });

  it.each([
    [
      'a Spotify track',
      {
        id: '4uLU6hMCjMI75M1A2tKUQC',
        name: 'Teardrop',
        artistId: '6FXMGgJwohJLUSr5nVlf9X',
        artistName: 'Massive Attack',
        durationMs: 330_000,
        popularity: 70,
        uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
      },
    ],
    [
      'an authenticated Spotify user',
      {
        id: 'spotify-user',
        displayName: 'Listener',
        email: 'listener@example.com',
        imageUrl: null,
      },
    ],
    [
      'provider track durations for duration fitting',
      {
        targetDurationMinutes: 60,
        candidateTrackDurationsMs: [215_000, 330_000, 248_000],
      },
    ],
    [
      'a generated playlist',
      {
        name: 'Blendify · Mix',
        tracks: [{ id: 'track-1', uri: 'spotify:track:track-1' }],
        coverImageUrl: 'https://i.scdn.co/image/cover',
      },
    ],
  ])('rejects %s serialized into the interpret request', (_label, providerObject) => {
    const result = InterpretIntentRequestSchema.safeParse({
      prompt: 'Make it less mainstream',
      ...providerObject,
    });

    expect(result.success).toBe(false);
  });

  it('bounds the prompt length', () => {
    const atLimit = 'a'.repeat(AI_INTENT_PROMPT_MAX_LENGTH);

    expect(InterpretIntentRequestSchema.safeParse({ prompt: atLimit }).success).toBe(true);
    expect(
      InterpretIntentRequestSchema.safeParse({ prompt: `${atLimit}a` }).success,
    ).toBe(false);
  });
});

describe('AI refinement provider-content firewall', () => {
  const VALID_REQUEST: PlanRefinementRequest = {
    intent: {
      kind: 'artist_mix',
      artists: ['Radiohead', 'Interpol'],
      genres: [],
      seedTracks: [],
      filters: {
        region: null,
        femaleVocals: false,
        releaseRange: null,
        excludeLive: false,
      },
      targetTrackCount: 30,
      targetDurationMinutes: null,
      mood: null,
      popularity: 'balanced',
      orderMode: null,
      excludeArtists: ['Coldplay'],
      excludeTracks: [],
      unsupportedConstraints: [],
    },
    preservation: { firstTracks: 5, positions: [8], artists: ['Radiohead'] },
    refinement: 'Make it less mainstream',
  };

  const PROVIDER_CONTENT: Array<[string, Record<string, unknown>]> = [
    ['a provider track id', { trackId: '4uLU6hMCjMI75M1A2tKUQC' }],
    ['a Spotify URL', { spotifyUrl: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' }],
    ['an artwork URL', { imageUrl: 'https://i.scdn.co/image/ab67616d0000b273' }],
    ['provider-derived durations', { durationMs: 330_000, durationsMs: [215_000] }],
    [
      'provider track metadata',
      { name: 'Teardrop', artistName: 'Massive Attack', popularity: 70, isrc: 'GBAAA9800001' },
    ],
    [
      'the generated playlist tracks',
      { tracks: [{ title: 'Teardrop', artists: ['Massive Attack'] }] },
    ],
    [
      'destination metadata',
      { destination: { status: 'published', spotifyPlaylistId: '37i9dQZF1DX0XUsuxWHRQd' } },
    ],
    ['an access or refresh token', { accessToken: 'BQD-token', refreshToken: 'AQD-token' }],
    [
      'the provider recipe or execution state',
      { recipe: { artistIds: ['4Z8W4fKeB5YxbusRsdQVPb'] }, execution: { status: 'generated' } },
    ],
  ];

  it('accepts only the AI-safe intent, preservation and user-authored refinement', () => {
    const request = normalizedContract().PlanRefinementRequest;
    const preservation = (request.properties as Record<string, JsonSchema>).preservation;

    expect(Object.keys(request.properties as JsonSchema)).toEqual([
      'intent',
      'preservation',
      'refinement',
    ]);
    expect(Object.keys(preservation.properties as JsonSchema)).toEqual([
      'artists',
      'firstTracks',
      'positions',
    ]);
    expect(PlanRefinementRequestSchema.parse(VALID_REQUEST)).toEqual(VALID_REQUEST);
  });

  it('sends the current intent with exactly the first-turn intent shape', () => {
    const request = normalizedContract().PlanRefinementRequest;
    const intent = (request.properties as Record<string, JsonSchema>).intent;

    expect(intent).toEqual(normalize(z.toJSONSchema(PlaylistIntentSchema) as JsonSchema));
  });

  it.each(PROVIDER_CONTENT)('rejects %s next to the refinement', (_label, content) => {
    expect(
      PlanRefinementRequestSchema.safeParse({ ...VALID_REQUEST, ...content }).success,
    ).toBe(false);
  });

  it.each(PROVIDER_CONTENT)('rejects %s inside the current intent', (_label, content) => {
    expect(
      PlanRefinementRequestSchema.safeParse({
        ...VALID_REQUEST,
        intent: { ...VALID_REQUEST.intent, ...content },
      }).success,
    ).toBe(false);
  });

  it.each(PROVIDER_CONTENT)('rejects %s inside the preservation constraints', (_label, content) => {
    expect(
      PlanRefinementRequestSchema.safeParse({
        ...VALID_REQUEST,
        preservation: { ...VALID_REQUEST.preservation, ...content },
      }).success,
    ).toBe(false);
  });

  it('rejects provider values smuggled through preserved positions or track references', () => {
    expect(
      PlanRefinementRequestSchema.safeParse({
        ...VALID_REQUEST,
        preservation: { ...VALID_REQUEST.preservation, positions: ['4uLU6hMCjMI75M1A2tKUQC'] },
      }).success,
    ).toBe(false);
    expect(
      PlanRefinementRequestSchema.safeParse({
        ...VALID_REQUEST,
        intent: {
          ...VALID_REQUEST.intent,
          seedTracks: [{ title: 'Teardrop', artist: null, uri: 'spotify:track:1' }],
        },
      }).success,
    ).toBe(false);
  });

  it('bounds the refinement text', () => {
    const atLimit = 'a'.repeat(AI_REFINEMENT_TEXT_MAX_LENGTH);

    expect(
      PlanRefinementRequestSchema.safeParse({ ...VALID_REQUEST, refinement: atLimit }).success,
    ).toBe(true);
    expect(
      PlanRefinementRequestSchema.safeParse({ ...VALID_REQUEST, refinement: `${atLimit}a` })
        .success,
    ).toBe(false);
  });

  it('patches only executable intent fields and never the unsupported constraints', () => {
    const intentFields = Object.keys(PlaylistIntentSchema.shape).filter(
      (field) => field !== 'unsupportedConstraints',
    );

    expect(Object.keys(IntentPatchSchema.shape).sort()).toEqual(intentFields.sort());
  });
});
