import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AiClarification,
  AiCurrentPreservationDto,
  AiGenerationFailureDto,
  AiRefinementDto,
  CreateAiRefinementRequest,
  AiIntentSummary,
  AiSessionDestinationDto,
  GenerationProgress,
  PlaylistTransferDto,
  PublishAiPlaylistRequest,
} from '@blendify/contracts'
import {
  api,
  ApiError,
  type AiGeneration,
  type AiSession,
  type AiSessionState,
} from '@/lib/api'
import {
  clearStoredAiSession,
  readStoredAiSession,
  writeStoredAiSession,
  type StoredAiSession,
} from '@/lib/ai-session-storage'
import { isCurrentGeneration, useGenerationStore } from '@/stores/generation-store'

const STATUS_CHECK_INTERVAL_MS = 3_000
const MAX_STATUS_CHECKS = 60

export const AI_SESSION_QUERY_KEY = 'ai-session'

export type AiGeneratedExecution = Extract<
  NonNullable<AiSessionState['execution']>,
  { status: 'generated' }
>

export type AiFlowState =
  | { phase: 'composing'; error: unknown; restoreFailed: boolean }
  | { phase: 'restoring' }
  | { phase: 'interpreting' }
  | {
      phase: 'clarifying'
      clarification: AiClarification
      isAnswering: boolean
      error: unknown
    }
  | { phase: 'reviewed'; intent: AiIntentSummary; requestError: unknown }
  | {
      phase: 'generating'
      intent: AiIntentSummary
      progress: GenerationProgress | null
      isStreaming: boolean
      isStalled: boolean
    }
  | {
      phase: 'generated'
      intent: AiIntentSummary
      result: AiGeneratedExecution
      destination: AiSessionDestinationDto | null
      isPublishing: boolean
      publishError: unknown
      preservation: AiCurrentPreservationDto | null
      refinement: AiRefinementDto | null
      refinementActivity: AiRefinementActivity | null
      refinementError: unknown
    }
  | {
      phase: 'generation_failed'
      intent: AiIntentSummary
      failure: AiGenerationFailureDto
      liveError: unknown
    }

export type AiFlowPhase = AiFlowState['phase']

export type AiRefinementActivity = 'refining' | 'applying' | 'dismissing'

export type AiRefinementSettlement = 'applied' | 'dismissed'

const EMPTY_CURRENT_PRESERVATION: AiCurrentPreservationDto = {
  firstTracks: null,
  positions: [],
  artists: [],
  preservedPositions: [],
}

const SESSION_REFRESH_CODES = new Set([
  'AI_DESTINATION_IN_PROGRESS',
  'AI_REFINEMENT_PENDING',
  'AI_REFINEMENT_UNAVAILABLE',
  'AI_REFINEMENT_IN_PROGRESS',
  'AI_REFINEMENT_SUPERSEDED',
  'AI_REFINEMENT_STALE',
  'AI_REFINEMENT_NOT_APPLICABLE',
  'AI_PLAYLIST_NOT_GENERATED',
])

type GenerationRun = { sessionId: string; epoch: number; signal: AbortSignal }

function aiSessionQueryKey(sessionId: string | null) {
  return [AI_SESSION_QUERY_KEY, sessionId] as const
}

function reviewedState(session: AiSession): AiSessionState {
  return {
    ...session,
    execution: null,
    destination: null,
    preservation: null,
    refinement: null,
  }
}

function generatedState(generation: AiGeneration): AiSessionState {
  return {
    sessionId: generation.sessionId,
    expiresAt: generation.expiresAt,
    status: 'ready',
    intent: generation.intent,
    clarification: null,
    execution: {
      status: 'generated',
      playlist: generation.playlist,
      trackCount: generation.trackCount,
      durationMs: generation.durationMs,
      unmetConstraints: generation.unmetConstraints,
      transferAvailable: generation.transferAvailable,
    },
    destination: null,
    preservation: EMPTY_CURRENT_PRESERVATION,
    refinement: null,
  }
}

function isSessionNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'AI_SESSION_NOT_FOUND'
}

function needsSessionRefresh(error: unknown): boolean {
  return error instanceof ApiError && error.code !== undefined && SESSION_REFRESH_CODES.has(error.code)
}

function sessionFlowState(
  session: AiSessionState,
  context: {
    isAnswering: boolean
    answerError: unknown
    progress: GenerationProgress | null
    isStreaming: boolean
    statusChecks: number
    generationError: unknown
    isPublishing: boolean
    publishError: unknown
    refinementActivity: AiRefinementActivity | null
    refinementError: unknown
  },
): AiFlowState {
  if (session.clarification) {
    return {
      phase: 'clarifying',
      clarification: session.clarification,
      isAnswering: context.isAnswering,
      error: context.answerError,
    }
  }
  if (!session.intent) {
    return { phase: 'composing', error: null, restoreFailed: false }
  }

  const intent = session.intent
  switch (session.execution?.status) {
    case undefined:
      return { phase: 'reviewed', intent, requestError: context.generationError }
    case 'generating':
      return {
        phase: 'generating',
        intent,
        progress: context.isStreaming ? context.progress : null,
        isStreaming: context.isStreaming,
        isStalled: !context.isStreaming && context.statusChecks >= MAX_STATUS_CHECKS,
      }
    case 'generated':
      return {
        phase: 'generated',
        intent,
        result: session.execution,
        destination: session.destination,
        isPublishing: context.isPublishing,
        publishError: context.publishError,
        preservation: session.preservation,
        refinement: session.refinement,
        refinementActivity: context.refinementActivity,
        refinementError: context.refinementError,
      }
    case 'generation_failed':
      return {
        phase: 'generation_failed',
        intent,
        failure: session.execution.error,
        liveError: context.generationError,
      }
  }
}

export function useAiSession() {
  const queryClient = useQueryClient()
  const [stored, setStored] = useState<StoredAiSession | null>(readStoredAiSession)
  const [composeError, setComposeError] = useState<unknown>(null)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [generationError, setGenerationError] = useState<unknown>(null)
  const [statusChecks, setStatusChecks] = useState(0)
  const sessionId = stored?.sessionId ?? null

  const sessionQuery = useQuery({
    queryKey: aiSessionQueryKey(sessionId),
    queryFn: () => api.getAiSession(sessionId ?? ''),
    enabled: sessionId !== null,
    staleTime: Infinity,
    refetchOnMount: 'always',
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const remember = useCallback(
    (next: StoredAiSession | null) => {
      if (next) {
        writeStoredAiSession(next)
      } else {
        clearStoredAiSession()
      }
      setStored(next)
    },
    [],
  )

  const cancelStream = useCallback(() => {
    useGenerationStore.getState().cancelActive()
  }, [])

  const expire = useCallback(
    (error: unknown) => {
      if (sessionId) {
        queryClient.removeQueries({ queryKey: aiSessionQueryKey(sessionId) })
      }
      remember(null)
      setComposeError(error)
    },
    [queryClient, remember, sessionId],
  )

  const interpret = useMutation({
    mutationFn: (prompt: string) => api.createAiSession(prompt),
    onSuccess: (session, prompt) => {
      queryClient.setQueryData(aiSessionQueryKey(session.sessionId), reviewedState(session))
      remember({ sessionId: session.sessionId, prompt, playlistTitle: null })
    },
    onError: setComposeError,
  })

  const clarify = useMutation({
    mutationFn: ({ sessionId: id, optionId }: { sessionId: string; optionId: string }) =>
      api.answerAiClarification(id, optionId),
    onSuccess: (session) => {
      queryClient.setQueryData(aiSessionQueryKey(session.sessionId), reviewedState(session))
    },
    onError: (error) => {
      if (isSessionNotFound(error)) {
        expire(error)
      }
    },
  })

  const generation = useMutation({
    mutationFn: (run: GenerationRun) =>
      api.generateAiPlaylist(run.sessionId, {
        signal: run.signal,
        onProgress: (next) => {
          if (isCurrentGeneration(run.epoch)) {
            setProgress(next)
          }
        },
      }),
    onMutate: (run) => {
      setProgress(null)
      setGenerationError(null)
      setStatusChecks(0)
      queryClient.setQueryData<AiSessionState>(aiSessionQueryKey(run.sessionId), (current) =>
        current ? { ...current, execution: { status: 'generating' } } : current,
      )
    },
    onSuccess: (result, run) => {
      useGenerationStore.getState().finish(run.epoch)
      queryClient.setQueryData(aiSessionQueryKey(run.sessionId), generatedState(result))
    },
    onError: (error, run) => {
      useGenerationStore.getState().finish(run.epoch)
      if (isCurrentGeneration(run.epoch) && isSessionNotFound(error)) {
        expire(error)
        return
      }
      if (isCurrentGeneration(run.epoch)) {
        setGenerationError(error)
      }
      void queryClient.invalidateQueries({ queryKey: aiSessionQueryKey(run.sessionId) })
    },
  })

  const publication = useMutation({
    mutationFn: ({ sessionId: id, input }: { sessionId: string; input: PublishAiPlaylistRequest }) =>
      api.publishAiPlaylist(id, input),
    onSuccess: (state) => {
      queryClient.setQueryData(aiSessionQueryKey(state.sessionId), state)
    },
    onError: (error, { sessionId: id }) => {
      if (isSessionNotFound(error)) {
        expire(error)
        return
      }
      if (needsSessionRefresh(error)) {
        void queryClient.invalidateQueries({ queryKey: aiSessionQueryKey(id) })
      }
    },
  })

  const refinementBusy = useRef(false)
  const [refinementSettlement, setRefinementSettlement] =
    useState<AiRefinementSettlement | null>(null)

  const handleRefinementError = useCallback(
    (error: unknown, id: string) => {
      if (isSessionNotFound(error)) {
        expire(error)
        return
      }
      if (needsSessionRefresh(error)) {
        void queryClient.invalidateQueries({ queryKey: aiSessionQueryKey(id) })
      }
    },
    [expire, queryClient],
  )

  const refinement = useMutation({
    mutationFn: ({ sessionId: id, input }: { sessionId: string; input: CreateAiRefinementRequest }) =>
      api.refineAiPlaylist(id, input),
    onSuccess: (result) => {
      queryClient.setQueryData<AiSessionState>(aiSessionQueryKey(result.sessionId), (current) =>
        current
          ? { ...current, expiresAt: result.expiresAt, refinement: result.refinement }
          : current,
      )
    },
    onError: (error, { sessionId: id }) => handleRefinementError(error, id),
    onSettled: () => {
      refinementBusy.current = false
    },
  })

  const settlement = useMutation({
    mutationFn: ({
      sessionId: id,
      refinementId,
      action,
    }: {
      sessionId: string
      refinementId: string
      action: AiRefinementSettlement
    }) =>
      action === 'applied'
        ? api.applyAiRefinement(id, refinementId)
        : api.dismissAiRefinement(id, refinementId),
    onSuccess: (state, { action }) => {
      queryClient.setQueryData(aiSessionQueryKey(state.sessionId), state)
      setRefinementSettlement(action)
    },
    onError: (error, { sessionId: id }) => handleRefinementError(error, id),
    onSettled: () => {
      refinementBusy.current = false
    },
  })

  const session = sessionQuery.data ?? null
  const isStreaming = generation.isPending
  const isWaitingForGeneration =
    (session?.execution?.status === 'generating' && !isStreaming) ||
    (session?.destination?.status === 'publishing' && !publication.isPending)

  useEffect(() => {
    if (sessionQuery.error && isSessionNotFound(sessionQuery.error)) {
      expire(sessionQuery.error)
    }
  }, [expire, sessionQuery.error])

  const { refetch } = sessionQuery
  useEffect(() => {
    if (!isWaitingForGeneration || statusChecks >= MAX_STATUS_CHECKS) {
      return
    }
    const timer = window.setTimeout(() => {
      void refetch().finally(() => setStatusChecks((count) => count + 1))
    }, STATUS_CHECK_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [isWaitingForGeneration, refetch, statusChecks])

  function flowState(): AiFlowState {
    if (interpret.isPending) {
      return { phase: 'interpreting' }
    }
    if (!sessionId) {
      return { phase: 'composing', error: composeError, restoreFailed: false }
    }
    if (!session) {
      if (sessionQuery.isError) {
        return {
          phase: 'composing',
          error: sessionQuery.error,
          restoreFailed: !isSessionNotFound(sessionQuery.error),
        }
      }
      return { phase: 'restoring' }
    }
    return sessionFlowState(session, {
      isAnswering: clarify.isPending,
      answerError: clarify.error,
      progress,
      isStreaming,
      statusChecks,
      generationError,
      isPublishing: publication.isPending,
      publishError: publication.isPending ? null : publication.error,
      refinementActivity: refinementActivity(),
      refinementError: refinement.error ?? settlement.error,
    })
  }

  function refinementActivity(): AiRefinementActivity | null {
    if (refinement.isPending) {
      return 'refining'
    }
    if (!settlement.isPending) {
      return null
    }
    return settlement.variables.action === 'applied' ? 'applying' : 'dismissing'
  }

  function clearGeneration() {
    if (generation.isPending) {
      cancelStream()
    }
    generation.reset()
    publication.reset()
    refinement.reset()
    settlement.reset()
    refinementBusy.current = false
    setRefinementSettlement(null)
    setProgress(null)
    setGenerationError(null)
    setStatusChecks(0)
  }

  function submit(prompt: string) {
    if (interpret.isPending) {
      return
    }
    clearGeneration()
    clarify.reset()
    setComposeError(null)
    remember(null)
    interpret.mutate(prompt)
  }

  function choose(optionId: string) {
    if (clarify.isPending || !sessionId) {
      return
    }
    clarify.mutate({ sessionId, optionId })
  }

  function generate() {
    if (generation.isPending || !sessionId) {
      return
    }
    const { epoch, signal } = useGenerationStore.getState().start()
    generation.mutate({ sessionId, epoch, signal })
  }

  function checkStatus() {
    setStatusChecks(0)
    void refetch()
  }

  function publish(input: PublishAiPlaylistRequest) {
    if (publication.isPending || !sessionId) {
      return
    }
    publication.mutate({ sessionId, input })
  }

  function refine(input: CreateAiRefinementRequest) {
    if (refinementBusy.current || !sessionId || session?.refinement) {
      return
    }
    refinementBusy.current = true
    refinement.reset()
    settlement.reset()
    setRefinementSettlement(null)
    refinement.mutate({ sessionId, input })
  }

  function settleRefinement(action: AiRefinementSettlement) {
    const refinementId = session?.refinement?.id
    if (refinementBusy.current || !sessionId || !refinementId) {
      return
    }
    refinementBusy.current = true
    refinement.reset()
    settlement.reset()
    setRefinementSettlement(null)
    settlement.mutate({ sessionId, refinementId, action })
  }

  function clearRefinementError() {
    refinement.reset()
    settlement.reset()
  }

  async function prepareTransfer(name: string): Promise<PlaylistTransferDto> {
    if (!sessionId) {
      throw new ApiError('Create with AI session missing', 404)
    }
    try {
      const state = await api.transferAiPlaylist(sessionId, { name })
      queryClient.setQueryData(aiSessionQueryKey(sessionId), state)
      if (state.destination?.status !== 'transfer_prepared') {
        throw new ApiError('Invalid Create with AI response', 502)
      }
      return state.destination.transfer
    } catch (error) {
      if (isSessionNotFound(error)) {
        expire(error)
      } else if (needsSessionRefresh(error)) {
        void queryClient.invalidateQueries({ queryKey: aiSessionQueryKey(sessionId) })
      }
      throw error
    }
  }

  function renamePlaylist(playlistTitle: string | null) {
    if (stored) {
      remember({ ...stored, playlistTitle })
    }
  }

  function reset() {
    clearGeneration()
    interpret.reset()
    clarify.reset()
    setComposeError(null)
    if (sessionId) {
      queryClient.removeQueries({ queryKey: aiSessionQueryKey(sessionId) })
    }
    remember(null)
  }

  return {
    flow: flowState(),
    submittedPrompt: stored?.prompt ?? '',
    playlistTitle: stored?.playlistTitle ?? null,
    renamePlaylist,
    submit,
    choose,
    generate,
    publish,
    prepareTransfer,
    refine,
    applyRefinement: () => settleRefinement('applied'),
    dismissRefinement: () => settleRefinement('dismissed'),
    refinementSettlement,
    clearRefinementError,
    checkStatus,
    reset,
  }
}
