import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';
import {
  GENERATION_LEASE_MS,
  GENERATION_LEASE_RENEW_INTERVAL_MS,
} from './generation-lease.policy';

export type AiGenerationLeaseEvent = 'lease_lost' | 'lease_renew_failed';

export class AiGenerationLease {
  private readonly timer: NodeJS.Timeout;
  private stopped = false;
  private lost = false;

  constructor(
    private readonly sessions: AiSessionRepositoryPort,
    private readonly token: string,
    readonly leaseId: string,
    private readonly onEvent: (event: AiGenerationLeaseEvent) => void,
  ) {
    this.timer = setInterval(
      () => void this.renew(),
      GENERATION_LEASE_RENEW_INTERVAL_MS,
    );
    this.timer.unref();
  }

  get isLost(): boolean {
    return this.lost;
  }

  async release(): Promise<void> {
    this.stop();
    await this.sessions.releaseGenerationLock(this.token, this.leaseId);
  }

  private stop(): void {
    this.stopped = true;
    clearInterval(this.timer);
  }

  private async renew(): Promise<void> {
    if (this.stopped) {
      return;
    }
    try {
      const renewed = await this.sessions.renewGenerationLock(
        this.token,
        this.leaseId,
        GENERATION_LEASE_MS,
      );
      if (renewed || this.stopped) {
        return;
      }
      this.lost = true;
      this.stop();
      this.onEvent('lease_lost');
    } catch {
      this.onEvent('lease_renew_failed');
    }
  }
}
