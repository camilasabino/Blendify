import { Injectable } from '@nestjs/common';
import { resolveAiGenreSeeds } from '@/domain/ai/ai-genre-seeds';
import { AI_DEFAULT_ORDER_MODE, type AiIntent } from '@/domain/ai/ai-intent';
import type { AiPreservation } from '@/domain/ai/ai-intent-patch';
import { moodExecutionFor } from '@/domain/ai/ai-mood-execution';
import type { AiRefinementClarification } from '@/domain/ai/ai-refinement';
import {
  assembleRefinementCandidate,
  fillCandidateTrackCount,
  refinementArrangement,
  refinementStrategy,
  retainedTracks,
  type AiRefinementStrategy,
} from '@/domain/ai/ai-refinement-candidate';
import {
  diffIntents,
  diffPlaylistTracks,
} from '@/domain/ai/ai-refinement-diff';
import { unsatisfiedRefinementConstraints } from '@/domain/ai/ai-refinement-constraints';
import { resolvePreservation } from '@/domain/ai/ai-refinement-preservation';
import type {
  AiGenerationFailure,
  AiGenerationResult,
  AiRefinementCandidate,
} from '@/domain/ai/ai-session';
import { totalDurationMs } from '@/domain/ai/ai-track-selection';
import { unmetGenerationConstraints } from '@/domain/ai/ai-unmet-constraints';
import { AiGenerationError } from '@/domain/errors/ai-generation.error';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import {
  GeneratedPlaylist,
  pickLinkedCoverArtwork,
  trackCoverSource,
  type CoverArtwork,
} from '@/domain/playlist/generated-playlist';
import type { Track } from '@/domain/track/track.entity';
import {
  fromTrackResponse,
  toGeneratedPlaylistPreview,
} from '@/application/dto/playlist-response.dto';
import { buildAiExecutionPlan } from '@/application/services/ai-execution-plan';
import { describeAiGenerationFailure } from '@/application/services/ai-generation-failure';
import { AiIntentResolver } from '@/application/services/ai-intent-resolver.service';
import { GeneratePlaylistUseCase } from '@/application/use-cases/generate-playlist.use-case';

const POSITIONS_UNFILLED_CODE = 'AI_REFINEMENT_POSITIONS_UNFILLED';
const CONSTRAINTS_UNMET_CODE = 'AI_REFINEMENT_CONSTRAINTS_UNMET';

export interface AiRefinementCandidateInput {
  current: AiIntent;
  proposed: AiIntent;
  preservation: AiPreservation;
  currentResult: AiGenerationResult;
  checkpoint: () => void;
}

export type AiRefinementCandidateOutcome =
  | {
      status: 'candidate';
      strategy: AiRefinementStrategy['kind'];
      candidate: AiRefinementCandidate;
    }
  | { status: 'needs_clarification'; clarification: AiRefinementClarification };

@Injectable()
export class AiRefinementCandidateBuilder {
  constructor(
    private readonly resolver: AiIntentResolver,
    private readonly generator: GeneratePlaylistUseCase,
  ) {}

  async build(
    input: AiRefinementCandidateInput,
  ): Promise<AiRefinementCandidateOutcome> {
    const currentTracks =
      input.currentResult.playlist.tracks.map(fromTrackResponse);
    const preservation = resolvePreservation({
      tracks: currentTracks,
      preservation: input.preservation,
      intent: input.proposed,
    });
    if (preservation.status === 'needs_clarification') {
      return preservation;
    }

    const strategy = refinementStrategy({
      current: input.current,
      proposed: input.proposed,
      currentTracks,
    });
    const failed = (failure: AiGenerationFailure) => ({
      status: 'candidate' as const,
      strategy: strategy.kind,
      candidate: { status: 'failed' as const, failure },
    });

    let generated: GeneratedPlaylist | null;
    try {
      generated =
        strategy.kind === 'transform'
          ? null
          : await this.generate(input, strategy, currentTracks);
    } catch (error) {
      if (error instanceof AiSessionError) {
        throw error;
      }
      return failed(describeAiGenerationFailure(error));
    }

    const assembly = assembleRefinementCandidate({
      currentTracks,
      preservedPositions: preservation.positions,
      strategy,
      generatedTracks: generated?.tracks ?? [],
      intent: input.proposed,
      arrangement: refinementArrangement(
        input.current,
        input.proposed,
        strategy,
      ),
      random: Math.random,
    });
    switch (assembly.status) {
      case 'order_conflict':
        return {
          status: 'needs_clarification',
          clarification: {
            reason: 'conflicting_changes',
            seedType: null,
            limit: null,
            names: [],
            unsupportedConstraints: [],
          },
        };
      case 'insufficient':
        return failed(
          assembly.reason === 'no_tracks'
            ? describeAiGenerationFailure(BusinessRuleError.noTracksFound())
            : {
                code: POSITIONS_UNFILLED_CODE,
                category: 'insufficient_results',
                retryAfterSeconds: null,
                seedNotFound: null,
              },
        );
      case 'assembled':
        break;
    }

    const result = this.resultOf(input, generated, assembly.tracks);
    const unsatisfied = unsatisfiedRefinementConstraints({
      intent: input.proposed,
      current: input.currentResult,
      candidate: result,
    });
    if (unsatisfied.length > 0) {
      return failed({
        code: CONSTRAINTS_UNMET_CODE,
        category: 'insufficient_results',
        retryAfterSeconds: null,
        seedNotFound: null,
      });
    }

    return {
      status: 'candidate',
      strategy: strategy.kind,
      candidate: {
        status: 'ready',
        result,
        preservedPositions: preservation.positions,
        diff: {
          tracks: diffPlaylistTracks(
            input.currentResult.playlist.tracks,
            result.playlist.tracks,
          ),
          intent: diffIntents(input.current, input.proposed),
        },
      },
    };
  }

  private async generate(
    input: AiRefinementCandidateInput,
    strategy: AiRefinementStrategy,
    currentTracks: readonly Track[],
  ): Promise<GeneratedPlaylist> {
    input.checkpoint();
    const resolution = await this.resolver.resolve(
      input.proposed,
      input.checkpoint,
    );
    if (resolution.status === 'not_found') {
      throw AiGenerationError.seedNotFound(
        resolution.seedType,
        resolution.names,
      );
    }

    input.checkpoint();
    const plan = buildAiExecutionPlan(
      input.proposed,
      resolution.seeds,
      strategy.kind === 'retain_and_fill'
        ? fillCandidateTrackCount(
            input.proposed,
            retainedTracks(currentTracks, input.proposed, strategy).length,
            currentTracks.length,
          )
        : undefined,
    );
    const generated = await this.generator.execute(plan.request);
    input.checkpoint();
    return generated;
  }

  private resultOf(
    input: AiRefinementCandidateInput,
    generated: GeneratedPlaylist | null,
    tracks: Track[],
  ): AiGenerationResult {
    const { currentResult, proposed } = input;
    const current = currentResult.playlist;
    const playlist = GeneratedPlaylist.create({
      name: generated?.name ?? current.name,
      description: generated?.description ?? current.description,
      generation: generated?.generation ?? {
        ...currentResult.recipe,
        orderMode: proposed.orderMode ?? AI_DEFAULT_ORDER_MODE,
      },
      seeds: [...(generated?.seeds ?? current.seeds)],
      tracks,
      coverArtwork: coverFor(
        tracks,
        generated ? generated.coverArtwork : current.coverArtwork,
      ),
    });
    const durationMs = totalDurationMs(playlist.tracks);

    return {
      playlist: toGeneratedPlaylistPreview(playlist),
      recipe: playlist.generation,
      durationMs,
      unmetConstraints: unmetGenerationConstraints({
        targetTrackCount: proposed.targetTrackCount,
        targetDurationMinutes: proposed.targetDurationMinutes,
        mood: moodExecutionFor({
          kind: proposed.kind,
          mood: proposed.mood,
          explicitGenreIds: resolveAiGenreSeeds(proposed.genres).genres.map(
            (genre) => genre.id,
          ),
        }),
        trackCount: playlist.tracks.length,
        durationMs,
      }),
    };
  }
}

function coverFor(
  tracks: readonly Track[],
  cover: CoverArtwork | undefined,
): CoverArtwork | undefined {
  if (cover && tracks.some((track) => track.albumImageUrl === cover.imageUrl)) {
    return cover;
  }
  return pickLinkedCoverArtwork(tracks.map(trackCoverSource));
}
