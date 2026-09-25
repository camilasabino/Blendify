import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const GUEST_TRANSFER_ENABLED = 'GUEST_TRANSFER_ENABLED';

export function parseGuestTransferEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error(
    `Invalid ${GUEST_TRANSFER_ENABLED} "${raw}". Use true or false.`,
  );
}

@Injectable()
export class GuestTransferGate implements CanActivate {
  readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.enabled = parseGuestTransferEnabled(
      config.get<string>(GUEST_TRANSFER_ENABLED),
    );
  }

  canActivate(): boolean {
    if (!this.enabled) throw new NotFoundException('Not found');
    return true;
  }
}
