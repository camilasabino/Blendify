import {
  ReleaseDatePrecisionSchema,
  type ReleaseDatePrecision,
} from '@blendify/contracts';

export interface SpotifyAlbumRelease {
  release_date?: string | null;
  release_date_precision?: string | null;
}

export function readSpotifyRelease(album: SpotifyAlbumRelease | undefined): {
  releaseDate?: string;
  releaseDatePrecision?: ReleaseDatePrecision;
} {
  const releaseDate = album?.release_date?.trim();
  if (!releaseDate) {
    return {};
  }

  const precision = ReleaseDatePrecisionSchema.safeParse(
    album?.release_date_precision,
  );
  return {
    releaseDate,
    ...(precision.success ? { releaseDatePrecision: precision.data } : {}),
  };
}
