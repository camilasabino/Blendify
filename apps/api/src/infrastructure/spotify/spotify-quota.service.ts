import { Injectable } from '@nestjs/common';
import type { ProviderQuotaPort } from '../../domain/repositories/provider-quota.port';
import { throwIfSpotifyQuotaBlocked } from './spotify-quota-guard';

@Injectable()
export class SpotifyQuotaService implements ProviderQuotaPort {
  assertAvailable(): void {
    throwIfSpotifyQuotaBlocked();
  }
}
