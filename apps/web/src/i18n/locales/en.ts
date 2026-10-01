import { GENRE_REGION_NAMES } from '@blendify/contracts'

export const en = {
  'brand.tagline': 'Blend the music you love into new playlists.',
  'brand.description':
    'Choose artists, genres, or a song to build your playlist.',
  'brand.descriptionWithAi':
    'Choose artists, genres, or a song, or describe what you want to hear.',
  'nav.logOut': 'Log out',
  'nav.deleteAccount': 'Delete account',
  'account.delete.title': 'Delete your Blendify account?',
  'account.delete.body':
    'This removes your Blendify account from the service: your profile, the Spotify tokens stored for you, your Blendify library and your usage stats. You cannot undo it.',
  'account.delete.spotifyNote':
    'Your Spotify account is not affected, and playlists already saved there stay in Spotify. Blendify deletes the Spotify access it stored. It does not disconnect Blendify in your Spotify account; you can remove that in Spotify’s settings.',
  'account.delete.confirm': 'Delete my account',
  'account.delete.working': 'Deleting your account…',
  'account.delete.error':
    'We couldn’t delete your account. Nothing was deleted — please try again.',
  'nav.account': 'Account menu',
  'nav.create': 'Mix',
  'nav.discover': 'Discover',
  'nav.library': 'Library',
  'nav.stats': 'Stats',
  'nav.main': 'Main menu',
  'nav.appHome': 'Blendify home',
  'nav.skipToContent': 'Skip to content',
  'playlist.name.mix': 'Blendify · Mix · {seeds}',
  'playlist.name.mixEmpty': 'Blendify · Mix',
  'playlist.name.discover': 'Blendify · Discover · {seed}',
  'playlist.name.discoverFallback': 'Discover',
  'playlist.description.empty': 'Made with Blendify.',
  'playlist.description.one': 'Made with Blendify from {name}.',
  'playlist.description.two': 'Made with Blendify from {first} and {second}.',
  'playlist.description.many':
    'Made with Blendify from {first} and {count} more.',
  'playlist.discoverDescription.artist':
    'Inspired by {seed}. Made with Blendify.',
  'playlist.discoverDescription.track':
    'Inspired by “{seed}” by {artist}. Made with Blendify.',
  'lang.label': 'Language',
  'lang.en': 'EN',
  'lang.es': 'ES',
  'lang.pt': 'PT',
  'lang.enName': 'English',
  'lang.esName': 'Español',
  'lang.ptName': 'Português',
  'preferences.open': 'Preferences',
  'preferences.title': 'Preferences',
  'preferences.subtitle': 'Applies to every playlist you create in Blendify.',
  'preferences.persistToLibrary': 'Save to Library',
  'preferences.persistToLibraryHint':
    'Saves playlists to your Blendify Library. Turn this off to save them only on Spotify; your stats will still update.',
  'discover.eyebrow': 'Discover',
  'discover.title': 'Start with one artist or song',
  'discover.subtitle':
    'Choose a starting point and we’ll build a playlist with related music.',
  'discover.modeArtist': 'Artist',
  'discover.modeTrack': 'Song',
  'discover.stepSeed': 'Starting point',
  'discover.stepDetails': 'Playlist size',
  'discover.artist': 'Artist',
  'discover.track': 'Song',
  'discover.addArtist': 'Choose an artist first.',
  'discover.addTrack': 'Choose a song first.',
  'discover.needArtist': 'Choose an artist to continue.',
  'discover.needTrack': 'Choose a song to continue.',
  'discover.removeTrack': 'Remove {name}',
  'discover.generate': 'Create playlist',
  'discover.generating': 'Creating…',
  'discover.working': 'Creating your playlist',
  'discover.workingHint': 'Finding related songs for your playlist…',
  'discover.failed': 'Couldn’t create the playlist. Please try again.',
  'discover.notEnoughSimilar':
    'There isn’t enough related music for this choice. Try another artist or song.',
  'discover.resolveFailed':
    'Couldn’t find enough related music on Spotify. Try another artist or song.',
  'create.eyebrow': 'Mix',
  'create.title': 'Create your mix',
  'create.subtitle':
    'Choose artists or genres and fine-tune the mix.',
  'create.modeArtists': 'Artists',
  'create.modeGenres': 'Genres',
  'create.stepSource': 'Artists or genres',
  'create.stepDetails': 'Size and cover',
  'create.generateCover': 'Add a cover image',
  'create.coverFailed': 'Couldn’t add the cover.',
  'create.artists': 'Artists',
  'create.genres': 'Genres',
  'create.region': 'Region',
  'create.regionAny': 'Any region',
  'create.regionHint': 'Optional · Filters artists by region for all selected genres.',
  'region.latin': GENRE_REGION_NAMES.latin,
  'region.american': GENRE_REGION_NAMES.american,
  'region.british': GENRE_REGION_NAMES.british,
  'region.argentina': GENRE_REGION_NAMES.argentina,
  'region.brazilian': GENRE_REGION_NAMES.brazilian,
  'region.uruguay': GENRE_REGION_NAMES.uruguay,
  'region.colombia': GENRE_REGION_NAMES.colombia,
  'region.mexico': GENRE_REGION_NAMES.mexico,
  'region.chile': GENRE_REGION_NAMES.chile,
  'region.peru': GENRE_REGION_NAMES.peru,
  'region.venezuela': GENRE_REGION_NAMES.venezuela,
  'region.spanish': GENRE_REGION_NAMES.spanish,
  'create.paste': 'Paste a list of artists',
  'create.pastePlaceholder': 'Radiohead\nTame Impala\n…',
  'create.resolve': 'Add artists',
  'create.resolveEmpty': 'Paste at least one artist name.',
  'create.resolveTooMany': 'You can select up to {max} artists.',
  'create.resolveError': 'Some artists couldn’t be found. Check the names and try again.',
  'create.tracksPerArtist': 'Songs per artist',
  'create.tracksPerGenre': 'Songs per genre',
  'create.tracksMaxPerArtist': 'Up to {max} songs per artist',
  'create.tracksMaxPerGenre': 'Up to {max} songs per genre',
  'create.tracksAdjusted': 'Adjusted to {count}',
  'create.reach': 'Familiarity',
  'create.mix.popular': 'Popular',
  'create.mix.balanced': 'Balanced',
  'create.mix.rarities': 'Lesser-known',
  'create.mixHint': 'Choose how familiar the songs should feel.',
  'create.mix.popular.hint': 'Favor well-known songs.',
  'create.mix.balanced.hint':
    'Mix popular songs with lesser-known selections.',
  'create.mix.rarities.hint': 'Favor lesser-known songs.',
  'create.order': 'Playlist order',
  'create.orderHint': 'How songs are arranged in the playlist.',
  'create.order.artist': 'Artist A–Z',
  'create.order.artist.hint': 'Sort by artist name, then song title.',
  'create.order.title': 'Song title A–Z',
  'create.order.title.hint': 'Sort by song title.',
  'create.order.random': 'Random',
  'create.order.random.hint': 'Shuffle all songs in the playlist.',
  'create.perArtistOne': '1 song per artist',
  'create.perArtist': '{songs} songs per artist',
  'create.perGenreOne': '1 song per genre',
  'create.perGenre': '{songs} songs per genre',
  'create.addArtist': 'Add at least one artist.',
  'create.addGenre': 'Add at least one genre.',
  'create.needArtist': 'Add at least one artist to continue.',
  'create.needGenre': 'Add at least one genre to continue.',
  'create.maxArtists': 'Maximum of {max} artists.',
  'create.maxGenres': 'Maximum of {max} genres.',
  'create.clearAll': 'Clear all',
  'create.removeArtist': 'Remove {name}',
  'create.failed': 'Couldn’t create the playlist. Please try again.',
  'create.failedTitle': 'Couldn’t create the playlist',
  'create.generating': 'Creating…',
  'create.generate': 'Create playlist',
  'create.working': 'Creating your playlist',
  'create.ready': 'Playlist ready',
  'create.createAnother': 'Create another',
  'create.adjustAndRecreate': 'Try different settings',
  'create.settings': 'Settings used',
  'create.showSettings': 'Show settings',
  'create.hideSettings': 'Hide settings',
  'create.summaryMore': '+{count} more',
  'create.workingHint': 'Finding songs for your playlist…',
  'create.workingHintSlow':
    'Building the mix — this can take a little while…',
  'create.workingHintLong':
    'Still working — larger mixes usually take longer…',
  'create.workingHintVeryLong':
    'Still going — thanks for your patience…',
  'create.progressResolving': 'Preparing your selection',
  'create.progressMatching': 'Finding songs',
  'create.progressPublishing': 'Creating the playlist in Spotify',
  'create.progressCount': '{current} of {total}',
  'create.etaLessThanMinute': 'Less than 1 min remaining',
  'create.etaOneMinute': 'About 1 min remaining',
  'create.etaMinutes': 'About {minutes} min remaining',
  'create.nearCompleteTracks':
    'Added {count} of {requested} songs — almost the full amount.',
  'create.partialTracks':
    'Found {count} of {requested} songs. Try different artists, genres, or a broader Familiarity setting.',
  'create.noTracksFound':
    'Couldn’t find songs for this mix. Try different artists, genres, or a broader Familiarity setting.',
  'create.openSpotify': 'Open in Spotify',
  'create.copyLink': 'Copy link',
  'create.copied': 'Copied',
  'create.linkPending': 'The Spotify link will appear once your playlist is ready.',
  'preview.player': 'Playlist preview',
  'preview.modeLabel': 'Listen',
  'preview.modeHere': 'Listen here',
  'preview.modeDevice': 'Play on a device',
  'preview.playOnDevice': 'Play all',
  'preview.connectList': 'Play in Spotify',
  'preview.connectHint':
    'Plays in the Spotify app on your phone, computer, or speaker. Spotify Premium required. Opens Spotify if needed.',
  'preview.show': 'Preview',
  'preview.hide': 'Hide preview',
  'preview.playOpened':
    'Sent to Spotify. If nothing plays, press Play in the Spotify app.',
  'preview.playError': 'Couldn’t start playback. Please try again.',
  'preview.premiumRequired': 'Playing on a device requires Spotify Premium.',
  'preview.sessionExpired':
    'Your Spotify session expired. Log in again and retry.',
  'preview.invalidPlayback': 'Couldn’t play this selection on Spotify.',
  'preview.wakingDevice': 'Opening Spotify…',
  'preview.deviceMissing': 'No Spotify device found. Open Spotify and try again.',
  'preview.deviceStillMissing': 'Spotify is open, but no active device was found. Start playing something in Spotify, then try again.',
  'preview.retryPlay': 'Try again',
  'search.placeholder': 'Search artists…',
  'search.trackPlaceholder': 'Search songs…',
  'search.clear': 'Clear search',
  'search.artistResults': 'Artist results',
  'search.trackResults': 'Song results',
  'search.resultsOne': '1 result available.',
  'search.resultsMany': '{count} results available.',
  'search.error': 'Couldn’t search for artists. Please try again.',
  'search.trackError': 'Couldn’t search for songs. Please try again.',
  'search.empty': 'No artists found.',
  'search.trackEmpty': 'No songs found.',
  'search.added': 'Added',
  'errors.lastfmMissing':
    'Related-music suggestions aren’t available right now. Try again later.',
  'errors.lastfmSimilar':
    'Couldn’t load related music right now. Please try again.',
  'errors.genreLookupUnavailable':
    'Couldn’t find enough artists for this genre. Try another genre or try again later.',
  'errors.rateLimited':
    'Too many requests. Try again in {wait}.',
  'errors.rateLimitedLater':
    'Too many requests. Try again later.',
  'errors.concurrencyLimited':
    'Another playlist is still being created. Wait for it to finish and try again.',
  'errors.capacityExceeded':
    'Blendify is busy right now. Try again in {wait}.',
  'errors.capacityExceededLater':
    'Blendify is busy right now. Try again later.',
  'errors.serviceUnavailable':
    'Blendify is temporarily unavailable. Try again in {wait}.',
  'errors.serviceUnavailableLater':
    'Blendify is temporarily unavailable. Try again later.',
  'errors.wait.oneSecond': 'about 1 second',
  'errors.wait.seconds': 'about {n} seconds',
  'errors.wait.oneMinute': 'about 1 minute',
  'errors.wait.minutes': 'about {n} minutes',
  'errors.wait.oneHour': 'about 1 hour',
  'errors.wait.hours': 'about {n} hours',
  'errors.spotifyLimit.spotifyWait':
    'Spotify is temporarily limiting requests from Blendify and asked to wait {wait} before trying again.',
  'errors.spotifyLimit.estimate':
    'Spotify is temporarily limiting requests from Blendify. Blendify estimates {wait}, but it could take longer.',
  'errors.spotifyLimit.unknown':
    'Spotify is temporarily limiting requests from Blendify. Try again later.',
  'errors.spotifyLimit.why':
    'Why am I seeing this?',
  'errors.spotifyLimit.hide':
    'Hide details',
  'errors.spotifyLimit.explanation':
    'Spotify limits how many requests apps can make within a period of time. Blendify has temporarily reached that limit. This affects Blendify’s Spotify integration, not your account. You don’t need to reconnect; try again later.',
  'errors.artistResolve':
    'Couldn’t match one of the selected artists on Spotify. Try searching for it instead.',
  'errors.artistResolveNamed':
    'Couldn’t find “{name}” on Spotify. Try searching for it instead.',
  'errors.trackResolveNamed':
    'Couldn’t find the song “{name}” on Spotify. Try another one.',
  'genre.searchPlaceholder': 'Search genres…',
  'genre.loadError': 'Couldn’t load genres. Please try again.',
  'genre.empty': 'No matching genres found.',
  'genre.remove': 'Remove {name}',
  'genre.mains': 'Popular genres',
  'genre.results': 'Results',
  'genre.exploreSeedHint': 'Based on:',
  'genre.suggestMore': 'Show more',
  'genre.exploreEmpty': 'No suggestions yet. Try another genre from your list.',
  'genre.exploreExhausted': 'That’s all for now.',
  'artist.exploreSeedHint': 'Based on:',
  'artist.exploreError': 'Couldn’t load suggestions right now.',
  'artist.exploreEmpty': 'No suggestions yet. Try another artist from your list.',
  'artist.exploreExhausted': 'That’s all for now.',
  'artist.exploreResolveError':
    'Couldn’t add that artist. Try searching for them instead.',
  'artist.suggestMore': 'Show more',
  'library.eyebrow': 'Library',
  'library.title': 'Your Library',
  'library.subtitle':
    'Playlists saved in Blendify. Open them in Spotify, rename them, or remove them.',
  'library.loading': 'Loading library…',
  'library.loadError': 'Couldn’t load your library.',
  'common.retry': 'Try again',
  'library.emptyTitle': 'Nothing saved yet',
  'library.emptyBody':
    'When “Save to Library” is on, new playlists appear here. Change this anytime in Preferences.',
  'library.emptyCta': 'Start mixing',
  'library.refresh': 'Sync with Spotify',
  'library.refreshError':
    'Sync didn’t finish. Check your connection and try again in a bit.',
  'library.refreshSuccess': 'Library synced with Spotify.',
  'library.refreshSuccessOne':
    'Library synced with Spotify. 1 playlist removed because it no longer exists on Spotify.',
  'library.refreshSuccessMany':
    'Library synced with Spotify. {count} playlists removed because they no longer exist on Spotify.',
  'library.searchPlaceholder': 'Search playlists…',
  'library.clearSearch': 'Clear search',
  'library.searchEmptyTitle': 'No results',
  'library.searchEmptyBody': 'Try a different name or clear the search.',
  'library.showingCount': 'Showing {shown} of {total}',
  'library.loadMore': 'Show more',
  'library.confirmAction': 'Remove',
  'library.dismiss': 'Close',
  'library.deleteTitle': 'Remove from Blendify?',
  'library.purgeTitle': 'Remove from Spotify?',
  'library.bulkPurgeTitle': 'Remove from Spotify?',
  'library.actionFailedTitle': 'Something went wrong',
  'library.actionPartialTitle': 'Partially done',
  'stats.eyebrow': 'Stats',
  'stats.title': 'Your stats',
  'stats.subtitle':
    'Your most-used artists and genres — kept even if you clear your Library.',
  'stats.loading': 'Loading stats…',
  'stats.loadError': 'Couldn’t load stats.',
  'stats.emptyTitle': 'No stats yet',
  'stats.emptyBody':
    'Create a few playlists to see the artists and genres you use most.',
  'stats.emptyCta': 'Start mixing',
  'stats.topArtists': 'Top artists',
  'stats.topGenres': 'Top genres',
  'stats.topEmpty': 'Nothing here yet.',
  'stats.uniqueArtists': 'Artists used',
  'stats.uniqueGenres': 'Genres used',
  'stats.artistMixes': 'Artist playlists',
  'stats.genreMixes': 'Genre playlists',
  'stats.reset': 'Reset stats',
  'stats.resetTitle': 'Reset your stats?',
  'stats.resetBody':
    'Clears your rankings and counters. Your Library and Spotify playlists won’t change.',
  'stats.resetConfirm': 'Reset',
  'stats.resetWorking': 'Resetting…',
  'stats.resetError': 'Couldn’t reset stats. Try again.',
  'library.selectAllVisible': 'Select all',
  'library.deselectAll': 'Deselect all',
  'library.selectHint': 'Select the playlists you want to remove.',
  'library.selectedCountOne': '1 selected',
  'library.selectedCountMany': '{count} selected',
  'library.selectItem': 'Select {name}',
  'library.editSelection': 'Select',
  'library.doneSelecting': 'Cancel',
  'library.working': 'Working…',
  'library.bulkPurgeSelected': 'Remove {count} from Spotify',
  'library.bulkRemoveSelected': 'Remove {count} from Blendify',
  'library.bulkRemoveTitle': 'Remove from Blendify?',
  'library.bulkPurgeSelectedConfirm':
    'Remove {count} selected playlists from Spotify? They will also be removed from your Blendify Library.',
  'library.bulkRemoveSelectedConfirm':
    'Remove {count} selected playlists from Blendify? They stay on Spotify.',
  'library.bulkPartial':
    'Done for {affected}, but {failed} failed. Refresh and retry if needed.',
  'library.bulkError': 'Couldn’t complete the selected action. Try again.',
  'library.openSpotify': 'Open in Spotify',
  'library.copy': 'Copy link',
  'library.copied': 'Copied',
  'library.more': 'More actions',
  'library.rename': 'Rename',
  'library.removeFromLibrary': 'Remove from Blendify',
  'library.purgeSpotify': 'Remove from Spotify',
  'library.deleteConfirmActive':
    'Remove “{name}” from Blendify? It will remain on Spotify.',
  'library.purgeSpotifyConfirm':
    'Remove “{name}” from Spotify? It will also be removed from your Blendify Library.',
  'library.purgeSpotifyError':
    'Couldn’t remove the playlist from Spotify. Check your connection and try again.',
  'library.statusPending': 'Creating…',
  'library.statusFailed': 'Couldn’t create',
  'library.save': 'Save',
  'common.cancel': 'Cancel',
  'common.loading': 'Loading…',
  'common.close': 'Close',
  'create.coverHintArtists':
    'Generated from the playlist name and artist photos.',
  'create.coverHintGenres': 'Generated from the playlist name.',
  'discover.coverHintArtist':
    'Generated from the playlist name and the artist’s photo.',
  'discover.coverHintTrack':
    'Generated from the playlist name and the song’s album art.',
  'discover.summarySeed': 'based on {seed}',
  'create.estimateSongsOne': '≈ 1 song',
  'create.estimateSongs': '≈ {count} songs',
  'create.artistsEmpty': 'Search or paste up to {max} artists.',
  'create.pasteHint': 'One artist per line.',
  'create.suggestions': 'Suggestions',
  'create.suggestionsFor': 'Suggestions based on {name}',
  'create.suggestionsHint': 'Select one to add it.',
  'create.addSuggestion': 'Add {name}',
  'create.recreateNote':
    'Changing these settings creates a new playlist. The one you just made stays on Spotify.',
  'create.generateNew': 'Create new playlist',
  'create.leaveNoteLibrary':
    'You can browse other sections while this runs. The playlist will be saved to Spotify and your Library. Keep this tab open: if you refresh or close it, Blendify can no longer show the result.',
  'create.leaveNoteSpotify':
    'You can browse other sections while this runs. The playlist will be saved to Spotify. Keep this tab open: if you refresh or close it, Blendify can no longer show the result.',
  'common.songsOne': '1 song',
  'common.songsMany': '{count} songs',
  'preview.showAll': 'Show all {count} songs',
  'preview.showFewer': 'Show fewer',
  'library.kindMix': 'Mix',
  'library.kindDiscover': 'Discover',
  'library.titleMany': '{first}, {second} + {count} more',
  'landing.accessNote':
    'Only enabled Spotify accounts can connect to Blendify.',
  'landing.accessMore': 'Learn more',
  'stats.useCountOne': '1 playlist',
  'stats.useCountMany': '{count} playlists',
  'stats.overview': 'Overview',
  'nav.connectSpotify':
    'Connect Spotify',
  'landing.ctaGuest': 'Continue without Spotify',
  'landing.ctaOpenApp': 'Go to Blendify',
  'spotifyRequired.library':
    'Connect Spotify to use your Library.',
  'spotifyRequired.stats':
    'Connect Spotify to see your stats.',
  'authError.restricted':
    'This Spotify account isn’t enabled to connect with Blendify. Spotify currently limits which accounts can connect to this integration. You can keep using Blendify without connecting Spotify.',
  'authError.denied':
    'You didn’t finish connecting your Spotify account. You can try again or keep using Blendify without Spotify.',
  'authError.failed':
    'We couldn’t connect to Spotify. Try again in a moment. You can keep using Blendify without Spotify in the meantime.',
  'authError.expired':
    'That connection attempt is no longer valid. Start a new one from Connect Spotify.',
  'authError.dismiss':
    'Dismiss',
  'authError.moreInfo':
    'More information',
  'spotifyAccess.title':
    'Spotify access',
  'spotifyAccess.intro':
    'This Spotify account isn’t enabled to connect with Blendify. The limit comes from Spotify and applies to this account.',
  'spotifyAccess.whyTitle':
    'Why this happens',
  'spotifyAccess.whyBody':
    'Blendify uses Spotify’s development mode. In that mode, only Spotify accounts enabled for Blendify can connect.',
  'spotifyAccess.retry':
    'Trying again with the same account does not remove that restriction.',
  'spotifyAccess.optionsTitle':
    'What you can do',
  'spotifyAccess.withoutTitle':
    'Without connecting Spotify',
  'spotifyAccess.withoutBody':
    'You can create playlists in Blendify. They stay in this browser until you leave the page or refresh it, and you can prepare a transfer with Soundiiz. Song details still come from Spotify.',
  'spotifyAccess.withTitle':
    'With Spotify connected',
  'spotifyAccess.withBody':
    'Saving playlists to your Spotify account, using your Library and seeing your stats require an account enabled for this integration.',
  'spotifyAccess.privatePlaylists':
    'New playlists Blendify saves to Spotify are created as private.',
  'spotifyAccess.otherAccount':
    'If you have another Spotify account that is already enabled for Blendify, sign in to that account on Spotify and then connect it from Blendify. Connecting again while this account stays signed in on Spotify repeats the same attempt.',
  'spotifyAccess.continue':
    'Continue in Blendify',
  'spotifyRequired.dismiss':
    'Dismiss',
  'common.opensNewTab':
    '(opens in a new tab)',
  'create.leaveNoteGuest':
    'Keep this page open until the playlist is ready. Leaving stops it, and nothing is saved.',
  'create.recreateNoteGuest':
    'Changing these settings creates a new playlist that replaces the one shown here.',
  'guestResult.temporary':
    'This playlist is temporary. It will be lost if you leave this page or refresh it.',
  'attribution.lastfm':
    'Music recommendations powered by',
  'guestResult.attribution':
    'Track details from',
  'guestResult.attributionWithArtwork':
    'Track details and artwork from',
  'guestResult.trackList':
    'Songs in this playlist',
  'guestResult.openTrackInSpotify':
    'Open {track} by {artists} in Spotify',
  'guestResult.openArtworkInSpotify':
    'Open cover artwork source in Spotify',
  'footer.privacy':
    'Privacy',
  'spotify.openArtist':
    'Open {name} in Spotify',
  'transfer.title':
    'Transfer with Soundiiz',
  'transfer.explainer':
    'Soundiiz will open an external page where you can choose the destination service and complete the transfer. The playlist hasn’t been created on any service yet.',
  'transfer.prepare':
    'Prepare transfer',
  'transfer.preparing':
    'Preparing transfer…',
  'transfer.readyOne': 'Transfer prepared for 1 song. Available until {expires}.',
  'transfer.readyMany':
    'Transfer prepared for {count} songs. Available until {expires}.',
  'transfer.continue':
    'Continue on Soundiiz',
  'transfer.failed':
    'Couldn’t prepare the transfer. Please try again.',
  'transfer.regenerate':
    'Generate again',
  'transfer.errorInvalid':
    'This playlist can no longer be transferred. Generate it again to transfer it.',
  'transfer.errorExpired':
    'The transfer option for this playlist expired. Generate the playlist again to transfer it.',
  'transfer.errorRejected':
    'Soundiiz couldn’t accept this playlist. Try generating a different one.',
  'transfer.errorUnavailable':
    'Soundiiz isn’t responding right now. Try again in {wait}.',
  'transfer.errorUnavailableLater':
    'Soundiiz isn’t responding right now. Try again later.',
  'errors.catalogUnavailable':
    'The music catalog is temporarily unavailable. Try again in a few minutes.',
  'errors.spotifyReauthRequired':
    'Your Spotify connection is no longer valid. Connect Spotify again to continue.',
  'errors.spotifyUnavailable':
    'Blendify couldn’t communicate properly with Spotify. Try again.',
  'errors.spotifyUnavailableWait':
    'Spotify isn’t responding right now and asked to wait {wait} before trying again.',
  'errors.spotifyPermissionDenied':
    'Spotify didn’t allow this action for your account.',
  'errors.spotifyRequestRejected':
    'Spotify couldn’t process this request. Try again later.',
  'errors.spotifyOutcomeUnknown':
    'Spotify didn’t confirm whether the change was made. Check Spotify before trying again.',
  'errors.spotifyPlaylistIncomplete':
    'Blendify created the playlist on Spotify but couldn’t finish it. Open it in Spotify to check it.',
  'create.unconfirmedTitle':
    'Couldn’t confirm the playlist',
  'create.unconfirmed':
    'Spotify didn’t confirm whether the playlist was created. It may already be in your Spotify account, so check your playlists there before creating it again.',
  'create.createNewAnyway':
    'Create a new playlist anyway',
  'create.createNewAnywayHint':
    'This sends the same request again as a separate playlist. If the previous one was created, you’ll have both in Spotify.',
  'create.resubmitBlockedUncertain':
    'Check Spotify first. To create another playlist, use “Create a new playlist anyway” above.',
  'create.incompleteTitle':
    'Couldn’t finish the playlist',
  'create.incompleteNoTracks':
    'Blendify created the playlist on Spotify, but Spotify didn’t accept its songs. Open it in Spotify to check it.',
  'create.incompleteUnknownTracks':
    'Blendify created the playlist on Spotify, but couldn’t confirm whether its songs were added. Open it in Spotify to check it.',
  'create.incompleteLibrary':
    'Your playlist is on Spotify with all its songs, but Blendify couldn’t save it to your Library.',
  'runStatus.unconfirmed.mix':
    'Couldn’t confirm your Mix',
  'runStatus.unconfirmed.discover':
    'Couldn’t confirm your Discover playlist',
  'runStatus.incomplete.mix':
    'Your Mix wasn’t finished',
  'runStatus.incomplete.discover':
    'Your Discover playlist wasn’t finished',
  'errors.invalidGenerationResponse':
    'Blendify received an unexpected response. Please try again.',
  'create.stepSize': 'Size',
  'create.generateGuest': 'Generate playlist',
  'create.generatingGuest': 'Generating…',
  'create.generateNewGuest': 'Generate new playlist',
  'create.workingGuest': 'Generating your playlist',
  'create.workingHintGuest': 'Finding songs for your playlist…',
  'discover.workingHintGuest': 'Finding related songs for your playlist…',
  'create.readyGuest': 'Playlist generated',
  'create.failedTitleGuest': 'Couldn’t generate the playlist',
  'nav.ai': 'Create with AI',
  'nav.aiShort': 'AI',
  'ai.eyebrow': 'Create with AI',
  'ai.title': 'Describe the playlist you want',
  'ai.subtitle':
    'Name artists, a song or genres, and add details like size, familiarity or songs to avoid. Blendify shows what it understood before building anything.',
  'ai.requestTitle': 'Your request',
  'ai.promptLabel': 'Playlist request',
  'ai.promptPlaceholder':
    'For example: 30 deep cuts from Radiohead and Interpol, no Coldplay',
  'ai.promptHint': 'Press Ctrl+Enter or ⌘+Enter to submit.',
  'ai.promptRequired': 'Describe the playlist you want first.',
  'ai.suggestionsLabel': 'Try an example',
  'ai.suggestion.artists': '30 deep cuts from Radiohead and Interpol',
  'ai.suggestion.genres': 'Shoegaze and dream pop, around 40 songs',
  'ai.suggestion.discoverArtist': 'Music similar to Björk',
  'ai.suggestion.discoverTrack': 'Start from Teardrop by Massive Attack',
  'ai.submit': 'Review request',
  'ai.submitting': 'Reading your request…',
  'ai.interpreting': 'Reading your request…',
  'ai.error.unavailable':
    'Create with AI is temporarily unavailable. Mix and Discover still work.',
  'ai.error.timeout': 'Reading your request took too long. Try again.',
  'ai.error.rateLimited':
    'Create with AI is busy right now. Try again in a moment.',
  'ai.error.invalidOutput':
    'Blendify couldn’t read your request this time. Try again, or rephrase it.',
  'ai.error.requestRejected':
    'Blendify can’t use this request as written. Try rephrasing it.',
  'ai.error.sessionExpired':
    'This session expired. Submit your request again to start a new one.',
  'ai.error.optionUnavailable':
    'That choice is no longer available. Blendify loaded the latest version of your request.',
  'ai.error.paused.title': 'Create with AI is temporarily paused',
  'ai.error.paused.wait':
    'You’ve reached the temporary Create with AI limit. You can try again in {wait}.',
  'ai.error.paused.later':
    'You’ve reached the temporary Create with AI limit. Try again in a few minutes.',
  'ai.error.paused.retryIn': 'Try again in {wait}',
  'ai.error.generic': 'Couldn’t read your request. Try again.',
  'ai.clarify.title': 'One thing to confirm',
  'ai.clarify.ambiguous':
    'Name at least one artist, song or genre so Blendify knows where to start.',
  'ai.clarify.unsupportedOnly':
    'Blendify can’t build a playlist from these alone. Add an artist, a song or a genre.',
  'ai.clarify.notAPlaylist':
    'That doesn’t look like a playlist request. Describe the music you want.',
  'ai.clarify.mixedSeeds':
    'Blendify starts from one kind of starting point at a time. Which one should it use?',
  'ai.clarify.tooManyArtists':
    'A mix can use up to {limit} artists, and your request names {count}. Edit it to keep the ones you want.',
  'ai.clarify.tooManyGenres':
    'A mix can use up to {limit} genres, and your request names {count}. Edit it to keep the ones you want.',
  'ai.clarify.singleArtist':
    'Discover starts from one artist. Choose one, or mix them instead.',
  'ai.clarify.singleArtistOnly': 'Discover starts from one artist. Choose one.',
  'ai.clarify.singleTrack': 'Discover starts from one song. Choose one.',
  'ai.clarify.trackCount': 'Playlists can have up to {limit} songs.',
  'ai.clarify.ordering':
    'Blendify can’t reliably order songs this way. Choose an order instead:',
  'ai.clarify.unknownGenres':
    'Blendify doesn’t recognize these genres: {names}. Try another name.',
  'ai.clarify.ambiguousGenres':
    'These genres are too broad for one mix: {names}. Name a more specific genre or style.',
  'ai.clarify.conflictingRegions':
    'A mix can use one region, and your request names more than one: {names}. Edit it to keep one region.',
  'ai.clarify.invalidDuration':
    'That duration doesn’t work. Ask for a length of at least one minute.',
  'ai.clarify.optionsLabel': 'Choose an option',
  'ai.clarify.orEdit': 'Or edit your request and submit it again.',
  'ai.clarify.edit': 'Edit your request and submit it again.',
  'ai.option.useArtists': 'Use only the artists',
  'ai.option.useGenres': 'Use only the genres',
  'ai.option.useSong': 'Use only the song',
  'ai.option.mixArtists': 'Mix these artists instead',
  'ai.option.keepSeed': 'Start from {name}',
  'ai.option.trackCount': 'Use {count} songs',
  'ai.category.duration': 'Length',
  'ai.category.era': 'Era',
  'ai.category.energy': 'Energy',
  'ai.category.mood': 'Mood',
  'ai.category.activity': 'Activity',
  'ai.category.tempo': 'Tempo',
  'ai.category.progression': 'Progression',
  'ai.category.artist_attribute': 'Artist details',
  'ai.category.genre_exclusion': 'Genre exclusion',
  'ai.category.other': 'Other',
  'ai.summary.title': 'Here’s what Blendify understood',
  'ai.summary.subtitle':
    'Check these settings. Edit your request if something is off.',
  'ai.summary.contextSubtitle': 'The request used to create this preview.',
  'ai.summary.basedOn': 'Based on',
  'ai.summary.genres': 'Genres',
  'ai.summary.region': 'Region',
  'ai.summary.songs': 'Songs',
  'ai.summary.duration': 'Length',
  'ai.summary.durationValue': 'About {minutes} min',
  'ai.summary.mood': 'Mood',
  'ai.mood.happy': 'Happy',
  'ai.mood.calm': 'Calm',
  'ai.mood.energetic': 'Energetic',
  'ai.mood.sad': 'Sad',
  'ai.mood.romantic': 'Romantic',
  'ai.mood.angry': 'Angry',
  'ai.mood.dark': 'Dark',
  'ai.mood.nostalgic': 'Nostalgic',
  'ai.mood.dreamy': 'Dreamy',
  'ai.summary.avoiding': 'Avoiding',
  'ai.summary.trackBy': '{title} by {artist}',
  'ai.summary.unmet': 'Not used',
  'ai.summary.unmetHint':
    'These details aren’t supported yet, so they won’t affect this playlist.',
  'ai.editRequest': 'Edit request',
  'ai.startOver': 'Start over',
  'ai.createPlaylist': 'Create preview',
  'ai.createHint': 'Blendify will create a preview of your playlist.',
  'ai.cancelEdit': 'Cancel editing',
  'ai.restoring': 'Loading your request…',
  'ai.error.restoreFailed': 'Couldn’t load your previous request. Try again, or submit it again.',
  'ai.generating.title': 'Creating your playlist…',
  'ai.generating.hint': 'Finding music for your request',
  'ai.generating.stalled': 'This is taking longer than usual.',
  'ai.generating.checkAgain': 'Check again',
  'ai.result.eyebrow': 'Playlist preview',
  'ai.result.titleLabel': 'Playlist title',
  'ai.result.editTitle': 'Edit title',
  'ai.result.doneEditingTitle': 'Done',
  'ai.result.previewNote': 'This is a preview. It isn’t saved to Spotify.',
  'ai.result.durationRequested': 'about {minutes} min requested',
  'ai.unmet.title': 'Some preferences couldn’t be fully applied',
  'ai.unmet.trackCount': 'You asked for {requested} songs; this playlist has {actual}.',
  'ai.unmet.duration': 'You asked for about {requested} min; this playlist runs {actual}.',
  'ai.moodNotApplied.title': 'Not applied',
  'ai.moodNotApplied.seed':
    'This playlist is built from the artists or song you named. Mood is currently used only to choose genres when no genre is specified.',
  'ai.moodNotApplied.explicitGenre':
    'You specified a genre. Mood is currently used only to choose genres when no genre is specified.',
  'ai.generationError.title': 'Couldn’t create your playlist',
  'ai.generationError.seedNotFound': 'Blendify couldn’t find {names} on Spotify.',
  'ai.generationError.seedNotFoundGeneric': 'Blendify couldn’t find one of the artists or songs you named on Spotify.',
  'ai.generationError.seedNotFoundHint': 'Check the spelling in your request and review it again.',
  'ai.generationError.spotifyUnavailable': 'Spotify isn’t responding right now. Try again in a few minutes.',
  'ai.generationError.discoveryUnavailable': 'Related-music data isn’t available right now. Try again in a few minutes.',
  'ai.generationError.insufficient': 'Blendify couldn’t find enough music for this request. Try different artists, genres or another song.',
  'ai.generationError.interrupted': 'Creating your playlist was interrupted. Try again.',
  'ai.generationError.failed': 'Couldn’t finish creating your playlist. Try again.',
  'ai.destination.spotifyTitle': 'Save to Spotify',
  'ai.destination.spotifyHint':
    'Blendify will create a private playlist with this title in your Spotify account.',
  'ai.destination.spotifyHintLibrary':
    'Blendify will create a private playlist with this title in your Spotify account and add it to your Library.',
  'ai.destination.save': 'Save to Spotify',
  'ai.destination.saving': 'Saving to Spotify…',
  'ai.destination.saved': 'Saved to Spotify',
  'ai.destination.savedHint': 'The playlist is now in your Spotify account.',
  'ai.destination.savedHintLibrary':
    'The playlist is now in your Spotify account and your Library.',
  'ai.destination.incompleteTitle': 'Couldn’t finish saving to Spotify',
  'ai.destination.incomplete':
    'Blendify created the playlist on Spotify but couldn’t finish saving it. Open it in Spotify to check which songs were added.',
  'ai.destination.uncertain':
    'Blendify couldn’t confirm whether the playlist was created on Spotify. Check your Spotify account before creating it again.',
  'ai.destination.failed': 'Couldn’t save the playlist to Spotify. Try again.',
  'ai.destination.reconnect':
    'Spotify needs you to connect again before saving this playlist. The preview stays here.',
  'ai.refine.open':
    'Refine playlist',
  'ai.refine.openHint':
    'Change this preview before you save it. Nothing changes until you apply the proposal.',
  'ai.refine.title':
    'Refine playlist',
  'ai.refine.label':
    'What would you like to change?',
  'ai.refine.hint':
    'Describe the change in your own words. Blendify shows the proposed playlist before anything changes.',
  'ai.refine.placeholder':
    'For example: make it less mainstream and remove Coldplay',
  'ai.refine.required':
    'Describe what you’d like to change first.',
  'ai.refine.examplesLabel':
    'Try an example',
  'ai.refine.example.lessMainstream':
    'Make it less mainstream',
  'ai.refine.example.removeArtist':
    'Remove Coldplay',
  'ai.refine.example.keepFirst':
    'Keep the first five songs',
  'ai.refine.example.trackCount':
    'Make it 20 songs',
  'ai.refine.submit':
    'Propose changes',
  'ai.refine.refining':
    'Refining playlist…',
  'ai.refine.cancel':
    'Cancel',
  'ai.refine.keepHint':
    'Select songs below to keep them in their current position.',
  'ai.refine.keepSelectedOne': '1 song selected to keep',
  'ai.refine.keepSelectedMany': '{count} songs selected to keep',
  'ai.refine.keptAlreadyOne': '1 song already kept in place',
  'ai.refine.keptAlreadyMany': '{count} songs already kept in place',
  'ai.refine.keepLabel':
    'Keep',
  'ai.refine.keepTrack':
    'Keep “{track}” in place',
  'ai.refine.kept':
    'Kept',
  'ai.refine.keptTrack':
    '“{track}” is kept in place by an earlier change',
  'ai.refine.applied':
    'Changes applied. This is now your current playlist.',
  'ai.refine.dismissed':
    'Your current playlist is unchanged.',
  'ai.refine.pendingDestination':
    'Finish or dismiss the current refinement before saving this playlist.',
  'ai.refine.review.title':
    'Proposed changes',
  'ai.refine.review.settingsOnlySubtitle':
    'No songs would change. Apply to save these settings, and Blendify will follow them in your next changes.',
  'ai.refine.review.unappliedMoodSubtitle':
    'No songs would change, because this mood isn’t used to choose songs. Apply to keep it in your request.',
  'ai.refine.review.subtitle':
    'Nothing has changed yet. Apply these changes to update your playlist, or cancel to keep your existing playlist.',
  'ai.refine.review.apply':
    'Apply changes',
  'ai.refine.review.applying':
    'Applying changes…',
  'ai.refine.review.cancel':
    'Cancel',
  'ai.refine.review.dismissing':
    'Discarding…',
  'ai.refine.review.proposedPlaylist':
    'Proposed playlist',
  'ai.refine.review.proposedTrackList':
    'Songs in the proposed playlist',
  'ai.refine.review.notApplied':
    'Not applied',
  'ai.refine.review.notAppliedHint':
    'These parts of your refinement aren’t supported, so they weren’t applied.',
  'ai.refine.diff.settings':
    'Settings',
  'ai.refine.diff.noSongChanges':
    'Your current songs stay the same.',
  'ai.refine.diff.tracks':
    'Playlist',
  'ai.refine.diff.to':
    'changed to',
  'ai.refine.diff.added':
    'Added',
  'ai.refine.diff.removed':
    'Removed',
  'ai.refine.diff.moved':
    'Moved',
  'ai.refine.diff.retained':
    'Retained',
  'ai.refine.diff.replacements':
    'Replacements',
  'ai.refine.diff.kept':
    'Kept in place',
  'ai.refine.diff.songCount':
    'Songs',
  'ai.refine.diff.length':
    'Length',
  'ai.refine.diff.movedFrom':
    'Moved from position {from} to {to}',
  'ai.refine.diff.addedItems':
    'Added: {items}',
  'ai.refine.diff.removedItems':
    'Removed: {items}',
  'ai.refine.diff.notSet':
    'Not set',
  'ai.refine.diff.noMood':
    'No mood',
  'ai.refine.diff.defaultOrder':
    'Default order',
  'ai.refine.diff.details':
    'Show song changes',
  'ai.refine.field.kind':
    'Playlist type',
  'ai.refine.field.artists':
    'Artists',
  'ai.refine.field.genres':
    'Genres',
  'ai.refine.field.seedTracks':
    'Starting song',
  'ai.refine.field.excludeArtists':
    'Avoiding artists',
  'ai.refine.field.excludeTracks':
    'Avoiding songs',
  'ai.refine.kind.artist_mix':
    'Artist mix',
  'ai.refine.kind.genre_mix':
    'Genre mix',
  'ai.refine.kind.discover_artist':
    'Discover from an artist',
  'ai.refine.kind.discover_track':
    'Discover from a song',
  'ai.refine.failed.title':
    'Couldn’t prepare these changes',
  'ai.refine.failed.hint':
    'Your current playlist hasn’t changed.',
  'ai.refine.dismiss':
    'Dismiss',
  'ai.refine.clarify.title':
    'This change needs another try',
  'ai.refine.tryAgain':
    'Try a different refinement',
  'ai.refine.continue':
    'Continue with current playlist',
  'ai.refine.unchanged.title':
    'No changes needed',
  'ai.refine.unchanged.body':
    'Your playlist and settings already match that request, so Blendify didn’t change anything.',
  'ai.refine.clarify.conflicting':
    'Some of these changes contradict each other. Try a different refinement.',
  'ai.refine.clarify.conflictingNamed':
    'These changes contradict each other or the songs you’re keeping: {names}.',
  'ai.refine.clarify.conflictingLimit':
    'The songs you’re keeping don’t fit in a playlist of {limit} songs.',
  'ai.refine.clarify.outOfRange':
    'This playlist has {limit} songs, so Blendify can’t keep a song beyond that position.',
  'ai.refine.clarify.ambiguous':
    'Blendify needs more detail to make this change. Give an exact number of songs or minutes, or name what to add, remove or keep.',
  'ai.refine.clarify.unsupported':
    'Blendify can’t make this kind of change yet. Try a different refinement.',
  'ai.refine.clarify.genreExclusion':
    'Blendify can’t reliably exclude songs by genre yet, so it didn’t change your playlist. Name artists or songs to leave out, or choose the genres you want instead.',
  'ai.refine.clarify.unsupportedNamed':
    'Blendify can’t make these changes yet: {items}. Try a different refinement.',
  'ai.refine.clarify.notARefinement':
    'That doesn’t look like a change to this playlist. Say what to add, remove or keep.',
  'ai.refine.clarify.mixedSeeds':
    'A playlist starts from one kind of starting point at a time: artists, songs or genres. Try a refinement that uses only one of them.',
  'ai.refine.clarify.ordering':
    'Blendify can’t order songs this way. Ask for Artist A–Z, Song title A–Z or Random order instead.',
  'ai.refine.clarify.artistNotKept':
    'There are no songs by {names} in the current playlist to keep.',
  'ai.refine.clarify.singleArtist':
    'Discover starts from one artist. Try a refinement that names just one, or ask for a mix instead.',
  'ai.refine.clarify.singleTrack':
    'Discover starts from one song. Try a refinement that names just one.',
  'ai.refine.clarify.tooManyArtists':
    'A mix can use up to {limit} artists, and this change would use {count}. Try a refinement with fewer artists.',
  'ai.refine.clarify.tooManyGenres':
    'A mix can use up to {limit} genres, and this change would use {count}. Try a refinement with fewer genres.',
  'ai.refine.error.inProgress':
    'This playlist is already being refined. Wait a moment and try again.',
  'ai.refine.error.limit':
    'This playlist can’t be refined any further. Save it as it is or start over.',
  'ai.refine.error.superseded':
    'This playlist changed while Blendify was reading your refinement. Try again.',
  'ai.refine.error.unavailable':
    'This playlist was already saved or transferred, so it can’t be refined. Start over to create another version.',
  'ai.refine.error.pending':
    'Another change to this playlist is waiting for your review. Apply or dismiss it before refining again.',
  'ai.refine.error.stale':
    'That proposal is no longer current. Blendify loaded the latest version of your playlist.',
  'ai.refine.error.generic':
    'Couldn’t refine the playlist. Try again.',
  'ai.refine.error.settle':
    'Couldn’t update the playlist. Try again.',
  'runStatus.label':
    'Playlist creation',
  'runStatus.active.mix':
    'Creating your Mix',
  'runStatus.active.discover':
    'Creating your Discover playlist',
  'runStatus.succeeded.mix':
    'Your Mix is ready',
  'runStatus.succeeded.discover':
    'Your Discover playlist is ready',
  'runStatus.failed.mix':
    'Couldn’t create your Mix',
  'runStatus.failed.discover':
    'Couldn’t create your Discover playlist',
  'runStatus.uncertain.mix':
    'Lost connection while creating your Mix',
  'runStatus.uncertain.discover':
    'Lost connection while creating your Discover playlist',
  'runStatus.busy.mix':
    'Wait for your Mix to finish before creating another playlist.',
  'runStatus.busy.discover':
    'Wait for your Discover playlist to finish before creating another playlist.',
  'runStatus.viewProgress':
    'View progress',
  'runStatus.viewPlaylist':
    'View playlist',
  'runStatus.viewDetails':
    'View details',
  'runStatus.dismiss':
    'Close',
  'create.uncertainTitle':
    'Lost connection',
  'create.uncertainLibrary':
    'Blendify lost the connection before it could confirm the result. The playlist may already exist, so check your Library or Spotify before creating it again.',
  'create.uncertainSpotify':
    'Blendify lost the connection before it could confirm the result. The playlist may already exist, so check Spotify before creating it again.',
  'create.openLibrary':
    'Open Library',
  'home.eyebrow': 'Home',
  'home.title': 'What do you want to create?',
  'home.subtitle':
    'Choose where to start. Without connecting Spotify, the result is temporary and you can prepare a Soundiiz transfer. Blendify doesn’t save it.',
  'home.actionsLabel': 'Ways to create',
  'home.mixDescription': 'Combine artists or genres into one playlist.',
  'home.discoverDescription': 'Start with one artist or song and explore related music.',
  'home.aiDescription': 'Describe the playlist you have in mind.',
  'home.secondaryTitle': 'Also in Blendify',
  'home.libraryDescription': 'Playlists you saved in Blendify.',
  'home.statsDescription': 'Your most-used artists and genres.',
  'home.connectTitle': 'Want to save playlists straight to Spotify?',
  'home.connectBody':
    'Connect Spotify to save private playlists to your account, keep a Library and see your stats. The options above work without connecting.',
} as const

export type MessageKey = keyof typeof en
