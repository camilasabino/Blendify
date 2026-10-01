import { useEffect, useState } from 'react'
import { aiRateLimitRetryAfterSeconds } from '@/components/ai/ai-copy'

const WAIT_REFRESH_MS = 30_000

type RetryClock = Readonly<{ error: unknown; deadline: number | null; now: number }>

function startClock(error: unknown): RetryClock {
  const now = Date.now()
  const seconds = aiRateLimitRetryAfterSeconds(error)
  return { error, now, deadline: seconds === null ? null : now + seconds * 1000 }
}

export function useAiRateLimitWait(error: unknown): number | null {
  const [clock, setClock] = useState(() => startClock(error))
  let current = clock
  if (clock.error !== error) {
    current = startClock(error)
    setClock(current)
  }
  const { deadline, now } = current

  useEffect(() => {
    if (deadline === null || now >= deadline) {
      return
    }
    const timer = window.setTimeout(
      () => setClock((previous) => ({ ...previous, now: Date.now() })),
      Math.min(WAIT_REFRESH_MS, deadline - now),
    )
    return () => window.clearTimeout(timer)
  }, [deadline, now])

  if (deadline === null || now >= deadline) {
    return null
  }
  return (deadline - now) / 1000
}
