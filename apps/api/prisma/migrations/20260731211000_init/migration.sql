CREATE TYPE "PlaylistStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "SeedKind" AS ENUM ('ARTIST', 'GENRE');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "spotifyId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "imageUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "playlists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "spotifyId" TEXT,
    "spotifyUrl" TEXT,
    "kind" TEXT NOT NULL,
    "status" "PlaylistStatus" NOT NULL DEFAULT 'PENDING',
    "totalDurationMs" INTEGER NOT NULL DEFAULT 0,
    "seedCount" INTEGER NOT NULL DEFAULT 0,
    "trackCount" INTEGER NOT NULL DEFAULT 0,
    "tracksPerSeed" INTEGER,
    "seeds" JSONB NOT NULL,
    "tracks" JSONB NOT NULL,
    "generation" JSONB NOT NULL,
    "missingOnSpotify" BOOLEAN NOT NULL DEFAULT false,
    "syncedTrackCount" INTEGER,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_usage_stats" (
    "userId" TEXT NOT NULL,
    "artistMixCount" INTEGER NOT NULL DEFAULT 0,
    "genreMixCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_usage_stats_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "seed_usages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SeedKind" NOT NULL,
    "seedKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "seed_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_spotifyId_key" ON "users"("spotifyId");
CREATE INDEX "playlists_userId_createdAt_idx" ON "playlists"("userId", "createdAt");
CREATE UNIQUE INDEX "seed_usages_userId_kind_seedKey_key" ON "seed_usages"("userId", "kind", "seedKey");
CREATE INDEX "seed_usages_userId_kind_useCount_idx" ON "seed_usages"("userId", "kind", "useCount");

ALTER TABLE "playlists" ADD CONSTRAINT "playlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_usage_stats" ADD CONSTRAINT "user_usage_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seed_usages" ADD CONSTRAINT "seed_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
