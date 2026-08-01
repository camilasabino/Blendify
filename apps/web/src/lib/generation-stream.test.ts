import { describe, expect, it } from 'vitest'
import {
  parseGenerationStreamLine,
  readGenerationStream,
} from '@/lib/generation-stream'
import { ApiError } from '@/lib/api-error'
import type { PlaylistDetail } from '@blendify/contracts'

const playlist = {
  id: 'playlist-1',
  name: 'Mix',
  description: '',
  kind: 'artist_mix',
  seeds: [{ type: 'artist', id: 'a1', name: 'Sade' }],
  seedCount: 1,
  trackCount: 1,
  totalDurationMs: 1000,
  spotifyUrl: null,
  status: 'COMPLETED',
  missingOnSpotify: false,
  imageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tracks: [],
  generation: {
    version: 1,
    kind: 'artist_mix',
    tracksPerSeed: 1,
    seeds: [{ id: 'a1', name: 'Sade' }],
    popularity: 'balanced',
    orderMode: 'random',
  },
} satisfies PlaylistDetail

describe('parseGenerationStreamLine', () => {
  it('parses progress events', () => {
    expect(
      parseGenerationStreamLine(
        JSON.stringify({
          type: 'progress',
          phase: 'matching_tracks',
          current: 2,
          total: 10,
          percent: 26,
          etaSeconds: 12,
        }),
      ),
    ).toMatchObject({
      type: 'progress',
      phase: 'matching_tracks',
      current: 2,
      percent: 26,
    })
  })

  it('ignores blank and invalid lines', () => {
    expect(parseGenerationStreamLine('')).toBeNull()
    expect(parseGenerationStreamLine('{nope')).toBeNull()
    expect(parseGenerationStreamLine(JSON.stringify({ type: 'nope' }))).toBeNull()
  })
})

describe('readGenerationStream', () => {
  it('applies progress callbacks and returns the result playlist', async () => {
    const progress: number[] = []
    const body = [
      JSON.stringify({
        type: 'progress',
        phase: 'matching_tracks',
        current: 1,
        total: 2,
        percent: 50,
      }),
      JSON.stringify({ type: 'result', playlist }),
      '',
    ].join('\n')

    const response = new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    })

    const result = await readGenerationStream(response, (event) => {
      progress.push(event.percent)
    })

    expect(progress).toEqual([50])
    expect(result.id).toBe('playlist-1')
  })

  it('throws ApiError for stream error events', async () => {
    const body = `${JSON.stringify({
      type: 'error',
      statusCode: 422,
      code: 'NO_TRACKS_FOUND',
      message: 'No tracks',
    })}\n`

    await expect(
      readGenerationStream(
        new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      ),
    ).rejects.toEqual(expect.any(ApiError))
  })
})
