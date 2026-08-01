import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import {
  PlaybackDevice,
  StartPlaybackInput,
} from '../../domain/repositories/music-provider.port';
import { SpotifyApiClient } from './spotify-api.client';

export class SpotifyPlaybackClient {
  constructor(
    private readonly userId: string | null,
    private readonly api: SpotifyApiClient,
  ) {}

  async listPlaybackDevices(): Promise<PlaybackDevice[]> {
    const token = await this.api.accessToken(this.userId);
    try {
      return await this.fetchPlaybackDevices(token);
    } catch (error) {
      throw this.api.toPlaybackError('listPlaybackDevices', error);
    }
  }

  async startPlayback(input: StartPlaybackInput): Promise<void> {
    const token = await this.api.accessToken(this.userId);
    const body: Record<string, unknown> = {};
    if (input.contextUri) body.context_uri = input.contextUri;
    if (input.uris?.length) body.uris = input.uris;
    if (input.offsetUri) body.offset = { uri: input.offsetUri };

    if (!body.context_uri && !body.uris) {
      throw new BusinessRuleError(
        'Playback requires a playlist context or track URIs.',
        'PLAYBACK_INVALID',
      );
    }

    const deviceId =
      input.deviceId?.trim() || (await this.resolvePlaybackDeviceId(token));
    try {
      await this.putPlay(token, body, deviceId);
    } catch (error) {
      if (this.api.isNoActiveDeviceError(error) && deviceId) {
        try {
          await this.transferPlayback(token, deviceId, false);
          await this.putPlay(token, body, deviceId);
          return;
        } catch (retryError) {
          throw this.api.toPlaybackError('startPlayback', retryError);
        }
      }
      throw this.api.toPlaybackError('startPlayback', error);
    }
  }

  private async resolvePlaybackDeviceId(token: string): Promise<string> {
    const devices = await this.fetchPlaybackDevices(token);
    if (devices.length === 0) {
      throw new BusinessRuleError(
        'No active Spotify device. Open Spotify on your phone or computer, play anything once, then try again.',
        'NO_ACTIVE_DEVICE',
      );
    }
    return devices.find((device) => device.isActive)?.id ?? devices[0].id;
  }

  private async fetchPlaybackDevices(token: string): Promise<PlaybackDevice[]> {
    const { data } = await this.api.raw<{
      devices?: Array<{
        id: string | null;
        name: string;
        type: string;
        is_active: boolean;
      }>;
    }>(token, {
      method: 'GET',
      url: '/me/player/devices',
    });
    return (data.devices ?? [])
      .filter((device): device is typeof device & { id: string } =>
        Boolean(device.id),
      )
      .map((device) => ({
        id: device.id,
        name: device.name,
        type: device.type,
        isActive: device.is_active,
      }));
  }

  private async putPlay(
    token: string,
    body: Record<string, unknown>,
    deviceId?: string,
  ): Promise<void> {
    await this.api.raw(token, {
      method: 'PUT',
      url: '/me/player/play',
      data: body,
      params: deviceId ? { device_id: deviceId } : undefined,
      validateStatus: (status) => status === 204 || status === 200,
    });
  }

  private async transferPlayback(
    token: string,
    deviceId: string,
    play: boolean,
  ): Promise<void> {
    await this.api.raw(token, {
      method: 'PUT',
      url: '/me/player',
      data: { device_ids: [deviceId], play },
      validateStatus: (status) => status === 204 || status === 200,
    });
  }
}
