import { Inject, Injectable, Logger } from '@nestjs/common';
import { AI_DEFAULT_ORDER_MODE, type AiIntent } from '@/domain/ai/ai-intent';
import type { AiPreservation } from '@/domain/ai/ai-intent-patch';
import type { AiRefinementClarification } from '@/domain/ai/ai-refinement';
import {
  addsFemaleVocals,
  assembleRefinementCandidate,
  fillCandidateTrackCount,
  narrowedTrackFilters,
  refinementArrangement,
  refinementStrategy,
  retainedTracks,
  type AiRefinementStrategy,
  type AiTrackEligibility,
} from '@/domain/ai/ai-refinement-candidate';
import { aiSelectionFilters } from '@/domain/ai/ai-selection-filters';
import {
  DISCOVERY_CATALOG,
  type DiscoveryCatalogPort,
} from '@/domain/repositories/discovery-catalog.port';
import { trackSatisfiesFilters } from '@/domain/selection-filters/track-selection-filters';
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
import {
  exclusionMatcher,
  totalDurationMs,
} from '@/domain/ai/ai-track-selection';
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
import { ArtistFilterQualifier } from '@/application/services/artist-filter-qualifier';
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
  private readonly logger = new Logger(AiRefinementCandidateBuilder.name);

  constructor(
    private readonly resolver: AiIntentResolver,
    private readonly generator: GeneratePlaylistUseCase,
    @Inject(DISCOVERY_CATALOG)
    private readonly discoveryCatalog: DiscoveryCatalogPort,
  ) {}

  async build(
    input: AiRefinementCandidateInput,
  ): Promise<AiRefinementCandidateOutcome> {
    const currentTracks =
      input.currentResult.playlist.tracks.map(fromTrackResponse);
    let isEligible: AiTrackEligibility;
    try {
      isEligible = await this.filterEligibility(input, currentTracks);
    } catch (error) {
      if (error instanceof AiSessionError) {
        throw error;
      }
      return {
        status: 'candidate',
        strategy: 'retain_and_fill',
        candidate: {
          status: 'failed',
          failure: describeAiGenerationFailure(error),
        },
      };
    }
    const preservation = resolvePreservation({
      tracks: currentTracks,
      preservation: input.preservation,
      intent: input.proposed,
      isEligible,
    });
    if (preservation.status === 'needs_clarification') {
      return preservation;
    }

    const strategy = refinementStrategy({
      current: input.current,
      proposed: input.proposed,
      currentTracks,
      isEligible,
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
          : await this.generate(
              input,
              strategy,
              keptTracks(
                currentTracks,
                preservation.positions,
                input.proposed,
                strategy,
                isEligible,
              ),
            );
    } catch (error) {
      if (error instanceof AiSessionError) {
        throw error;
      }
      return failed(describeAiGenerationFailure(error));
    }

    const assembly = assembleRefinementCandidate({
      currentTracks,
      isEligible,
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

  /**
   * Current tracks stay only if they satisfy every filter the refinement
   * newly narrows; unknown artist evidence never counts as a match.
   */
  private async filterEligibility(
    input: AiRefinementCandidateInput,
    currentTracks: readonly Track[],
  ): Promise<AiTrackEligibility> {
    const trackFilters = narrowedTrackFilters(input.current, input.proposed);
    const meetsTrackFilters: AiTrackEligibility = trackFilters
      ? (track) => trackSatisfiesFilters(track, trackFilters)
      : () => true;
    if (!addsFemaleVocals(input.current, input.proposed)) {
      return meetsTrackFilters;
    }

    input.checkpoint();
    const qualifier = ArtistFilterQualifier.create(
      this.discoveryCatalog,
      { region: null, femaleVocals: true },
      this.logger,
    );
    const identities = currentTracks.map((track) => ({
      name: track.artistName,
    }));
    await qualifier.prefetch(identities);
    qualifier.assertEnforceable();
    const verdicts = await Promise.all(
      identities.map((identity) => qualifier.qualifies(identity)),
    );
    input.checkpoint();
    const qualified = new Set(
      currentTracks.filter((_, index) => verdicts[index]),
    );
    return (track) => qualified.has(track) && meetsTrackFilters(track);
  }

  private async generate(
    input: AiRefinementCandidateInput,
    strategy: AiRefinementStrategy,
    kept: readonly Track[],
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
            kept.length,
            input.currentResult.playlist.tracks.length,
          )
        : undefined,
    );
    const isExcluded = exclusionMatcher(plan.exclusions);
    const keptIds = new Set(kept.map((track) => track.id.getValue()));
    const generated = await this.generator.execute(plan.request, {
      acceptTrack: (track) =>
        !isExcluded(track) && !keptIds.has(track.id.getValue()),
    });
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
        filters: aiSelectionFilters(proposed),
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
        trackCount: playlist.tracks.length,
        durationMs,
      }),
    };
  }
}

function keptTracks(
  currentTracks: readonly Track[],
  preservedPositions: readonly number[],
  proposed: AiIntent,
  strategy: AiRefinementStrategy,
  isEligible: AiTrackEligibility,
): Track[] {
  const fixed = preservedPositions.map(
    (position) => currentTracks[position - 1],
  );
  const retained = retainedTracks(
    currentTracks,
    proposed,
    strategy,
    isEligible,
  );
  return [...new Set([...fixed, ...retained])];
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
