import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type AiSession } from '@/lib/api'

export function useAiSession() {
  const [session, setSession] = useState<AiSession | null>(null)

  const interpret = useMutation({
    mutationFn: (prompt: string) => api.createAiSession(prompt),
    onSuccess: setSession,
  })

  const clarify = useMutation({
    mutationFn: ({ sessionId, optionId }: { sessionId: string; optionId: string }) =>
      api.answerAiClarification(sessionId, optionId),
    onSuccess: setSession,
  })

  const isPending = interpret.isPending || clarify.isPending
  const error = interpret.error ?? clarify.error

  function submit(prompt: string) {
    if (isPending) {
      return
    }
    clarify.reset()
    setSession(null)
    interpret.mutate(prompt)
  }

  function choose(optionId: string) {
    if (isPending || !session) {
      return
    }
    interpret.reset()
    clarify.mutate({ sessionId: session.sessionId, optionId })
  }

  function reset() {
    interpret.reset()
    clarify.reset()
    setSession(null)
  }

  return { session, error, isPending, submit, choose, reset }
}
