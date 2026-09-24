import type {
  PermitAcquisition,
  PermitRef,
  PermitRequest,
  RequestLimitStore,
  WindowHit,
} from './request-limit.store';

const SWEEP_THRESHOLD = 10_000;

export class MemoryRequestLimitStore implements RequestLimitStore {
  private readonly windows = new Map<
    string,
    { count: number; expiresAt: number }
  >();
  private readonly leases = new Map<string, Map<string, number>>();

  constructor(private readonly now: () => number = Date.now) {}

  isAvailable(): boolean {
    return true;
  }

  hit(key: string, windowMs: number): Promise<WindowHit> {
    const now = this.now();
    if (this.windows.size > SWEEP_THRESHOLD) this.sweepWindows(now);

    let window = this.windows.get(key);
    if (!window || window.expiresAt <= now) {
      window = { count: 0, expiresAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return Promise.resolve({
      count: window.count,
      resetInMs: window.expiresAt - now,
    });
  }

  acquire(request: PermitRequest): Promise<PermitAcquisition> {
    const now = this.now();
    const client = this.activeLeases(request.clientKey, now);
    const global = this.activeLeases(request.globalKey, now);

    if (client.size >= request.clientLimit) {
      return Promise.resolve({ acquired: false, scope: 'client' });
    }
    if (global.size >= request.globalLimit) {
      return Promise.resolve({ acquired: false, scope: 'global' });
    }

    const expiresAt = now + request.leaseMs;
    client.set(request.permitId, expiresAt);
    global.set(request.permitId, expiresAt);
    return Promise.resolve({ acquired: true });
  }

  renew(permit: PermitRef, leaseMs: number): Promise<boolean> {
    const now = this.now();
    const client = this.activeLeases(permit.clientKey, now);
    const global = this.activeLeases(permit.globalKey, now);

    if (!client.has(permit.permitId) || !global.has(permit.permitId)) {
      client.delete(permit.permitId);
      global.delete(permit.permitId);
      return Promise.resolve(false);
    }

    client.set(permit.permitId, now + leaseMs);
    global.set(permit.permitId, now + leaseMs);
    return Promise.resolve(true);
  }

  release(permit: PermitRef): Promise<void> {
    for (const key of [permit.clientKey, permit.globalKey]) {
      const leases = this.leases.get(key);
      leases?.delete(permit.permitId);
      if (leases?.size === 0) this.leases.delete(key);
    }
    return Promise.resolve();
  }

  private activeLeases(key: string, now: number): Map<string, number> {
    let leases = this.leases.get(key);
    if (!leases) {
      leases = new Map();
      this.leases.set(key, leases);
    }
    for (const [permitId, expiresAt] of leases) {
      if (expiresAt <= now) leases.delete(permitId);
    }
    return leases;
  }

  private sweepWindows(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.expiresAt <= now) this.windows.delete(key);
    }
  }
}
