export interface WindowHit {
  count: number;
  resetInMs: number;
}

export interface PermitRequest {
  permitId: string;
  clientKey: string;
  globalKey: string;
  clientLimit: number;
  globalLimit: number;
  leaseMs: number;
}

export type PermitAcquisition =
  { acquired: true } | { acquired: false; scope: 'client' | 'global' };

export type PermitRef = Pick<
  PermitRequest,
  'permitId' | 'clientKey' | 'globalKey'
>;

export interface RequestLimitStore {
  isAvailable(): boolean;
  hit(key: string, windowMs: number): Promise<WindowHit>;
  acquire(request: PermitRequest): Promise<PermitAcquisition>;
  renew(permit: PermitRef, leaseMs: number): Promise<boolean>;
  release(permit: PermitRef): Promise<void>;
}

export class RequestLimitStoreUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Request limit store unavailable', options);
    this.name = 'RequestLimitStoreUnavailableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
