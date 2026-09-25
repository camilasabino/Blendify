import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuestTransferGate,
  parseGuestTransferEnabled,
} from './guest-transfer.gate';

describe('parseGuestTransferEnabled', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    [' FALSE ', false],
    ['true', true],
    ['True', true],
  ])('parses %p as %p', (raw, expected) => {
    expect(parseGuestTransferEnabled(raw)).toBe(expected);
  });

  it.each(['1', 'yes', 'on', 'enabled'])('rejects %p at startup', (raw) => {
    expect(() => parseGuestTransferEnabled(raw)).toThrow(
      'GUEST_TRANSFER_ENABLED',
    );
  });
});

describe('GuestTransferGate', () => {
  it('hides the route while disabled', () => {
    const gate = new GuestTransferGate(new ConfigService({}));

    expect(gate.enabled).toBe(false);
    expect(() => gate.canActivate()).toThrow(NotFoundException);
  });

  it('allows the route when enabled', () => {
    const gate = new GuestTransferGate(
      new ConfigService({ GUEST_TRANSFER_ENABLED: 'true' }),
    );

    expect(gate.canActivate()).toBe(true);
  });
});
