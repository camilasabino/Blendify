DELETE FROM "playlists" WHERE "missingOnSpotify" = true;

ALTER TABLE "playlists" DROP COLUMN "missingOnSpotify";
