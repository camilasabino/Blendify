import type { MessageKey } from './en'

export const es: Record<MessageKey, string> = {
  'brand.tagline': 'Mezcla la música que te gusta en nuevas playlists.',
  'brand.description':
    'Elige artistas, géneros o una canción para crear tu playlist.',
  'brand.descriptionWithAi':
    'Elige artistas, géneros o una canción, o describe lo que quieres escuchar.',
  'nav.logOut': 'Cerrar sesión',
  'nav.deleteAccount': 'Eliminar cuenta',
  'account.delete.title': '¿Eliminar tu cuenta de Blendify?',
  'account.delete.body':
    'Esto elimina tu cuenta de Blendify del servicio: tu perfil, los tokens de Spotify guardados para ti, tu biblioteca de Blendify y tus estadísticas de uso. No se puede deshacer.',
  'account.delete.spotifyNote':
    'Tu cuenta de Spotify no se ve afectada y las playlists ya guardadas ahí siguen en Spotify. Blendify borra el acceso de Spotify que tenía guardado. No desconecta Blendify en tu cuenta de Spotify; eso puedes quitarlo en la configuración de Spotify.',
  'account.delete.confirm': 'Eliminar mi cuenta',
  'account.delete.working': 'Eliminando tu cuenta…',
  'account.delete.error':
    'No pudimos eliminar tu cuenta. No se borró nada. Vuelve a intentarlo.',
  'nav.account': 'Menú de cuenta',
  'nav.create': 'Mezclar',
  'nav.discover': 'Descubrir',
  'nav.library': 'Biblioteca',
  'nav.stats': 'Estadísticas',
  'nav.main': 'Menú principal',
  'nav.appHome': 'Inicio de Blendify',
  'nav.skipToContent': 'Saltar al contenido',
  'playlist.name.mix': 'Blendify · Mezcla · {seeds}',
  'playlist.name.mixEmpty': 'Blendify · Mezcla',
  'playlist.name.discover': 'Blendify · Descubrir · {seed}',
  'playlist.name.discoverFallback': 'Descubrir',
  'playlist.description.empty': 'Creada con Blendify.',
  'playlist.description.one': 'Creada con Blendify a partir de {name}.',
  'playlist.description.two':
    'Creada con Blendify a partir de {first} y {second}.',
  'playlist.description.many':
    'Creada con Blendify a partir de {first} y {count} más.',
  'playlist.discoverDescription.artist':
    'Inspirada en {seed}. Creada con Blendify.',
  'playlist.discoverDescription.track':
    'Inspirada en «{seed}» de {artist}. Creada con Blendify.',
  'lang.label': 'Idioma',
  'lang.en': 'EN',
  'lang.es': 'ES',
  'lang.pt': 'PT',
  'lang.enName': 'English',
  'lang.esName': 'Español',
  'lang.ptName': 'Português',
  'preferences.open': 'Preferencias',
  'preferences.title': 'Preferencias',
  'preferences.subtitle': 'Se aplica a cada playlist que creas en Blendify.',
  'preferences.persistToLibrary': 'Guardar en la biblioteca',
  'preferences.persistToLibraryHint':
    'Guarda las playlists en tu biblioteca de Blendify. Desactívalo para guardarlas solo en Spotify; tus estadísticas seguirán actualizándose.',
  'discover.eyebrow': 'Descubrir',
  'discover.title': 'Empieza con un artista o una canción',
  'discover.subtitle':
    'Elige un punto de partida y crearemos una playlist con música relacionada.',
  'discover.modeArtist': 'Artista',
  'discover.modeTrack': 'Canción',
  'discover.stepSeed': 'Punto de partida',
  'discover.stepDetails': 'Tamaño de la playlist',
  'discover.artist': 'Artista',
  'discover.track': 'Canción',
  'discover.addArtist': 'Elige un artista primero.',
  'discover.addTrack': 'Elige una canción primero.',
  'discover.needArtist': 'Elige un artista para continuar.',
  'discover.needTrack': 'Elige una canción para continuar.',
  'discover.removeTrack': 'Quitar {name}',
  'discover.generate': 'Crear playlist',
  'discover.generating': 'Creando…',
  'discover.working': 'Creando tu playlist',
  'discover.workingHint': 'Buscando canciones relacionadas…',
  'discover.failed': 'No se pudo crear la playlist. Vuelve a intentarlo.',
  'discover.notEnoughSimilar':
    'No hay suficiente música relacionada. Prueba con otro artista o canción.',
  'discover.resolveFailed':
    'No encontramos suficiente música relacionada en Spotify. Prueba con otro artista o canción.',
  'create.eyebrow': 'Mezclar',
  'create.title': 'Crea tu mezcla',
  'create.subtitle':
    'Elige artistas o géneros y ajusta la mezcla.',
  'create.modeArtists': 'Artistas',
  'create.modeGenres': 'Géneros',
  'create.stepSource': 'Artistas o géneros',
  'create.stepDetails': 'Tamaño y portada',
  'create.generateCover': 'Agregar una portada',
  'create.coverFailed': 'No se pudo agregar la portada.',
  'create.artists': 'Artistas',
  'create.genres': 'Géneros',
  'create.refineResults': 'Refinar resultados',
  'create.refineResultsNone': 'Opcional · Sin filtros',
  'create.region': 'Región',
  'create.regionAny': 'Cualquier región',
  'create.regionHint': 'Opcional · Filtra los artistas por región para todos los géneros seleccionados.',
  'discover.regionHint': 'Opcional · Limita los resultados a una escena o región.',
  'create.vocals': 'Voces',
  'create.vocalsAny': 'Cualquiera',
  'create.femaleVocals': 'Voces femeninas',
  'create.vocalsHint': 'Opcional · Filtra los artistas de los resultados por sus voces.',
  'create.decade': 'Década',
  'create.decadeAny': 'Cualquiera',
  'create.decadeHint': 'Opcional · Usa el año de lanzamiento de la versión de cada canción.',
  'create.eraAny': 'Cualquier época',
  'create.releaseRangeFrom': 'Desde {year}',
  'create.releaseRangeTo': 'Hasta {year}',
  'create.excludeLive': 'Excluir versiones en vivo',
  'create.excludeLiveHint': 'Evita grabaciones identificadas como en vivo o unplugged.',
  'create.noLiveVersions': 'Sin versiones en vivo',
  'region.latin': 'Latinoamérica',
  'region.american': 'Estados Unidos',
  'region.british': 'Reino Unido',
  'region.argentina': 'Argentina',
  'region.brazilian': 'Brasil',
  'region.uruguay': 'Uruguay',
  'region.colombia': 'Colombia',
  'region.mexico': 'México',
  'region.chile': 'Chile',
  'region.peru': 'Perú',
  'region.venezuela': 'Venezuela',
  'region.spanish': 'España',
  'create.paste': 'Pegar una lista de artistas',
  'create.pastePlaceholder': 'Radiohead\nTame Impala\n…',
  'create.resolve': 'Agregar artistas',
  'create.resolveEmpty': 'Pega al menos un nombre de artista.',
  'create.resolveTooMany': 'Puedes seleccionar hasta {max} artistas.',
  'create.resolveError':
    'No encontramos algunos artistas. Revisa los nombres e intenta de nuevo.',
  'create.tracksPerArtist': 'Canciones por artista',
  'create.tracksPerGenre': 'Canciones por género',
  'create.tracksMaxPerArtist': 'Hasta {max} canciones por artista',
  'create.tracksMaxPerGenre': 'Hasta {max} canciones por género',
  'create.tracksAdjusted': 'Ajustado a {count}',
  'create.reach': 'Familiaridad',
  'create.mix.popular': 'Más conocidas',
  'create.mix.balanced': 'Equilibrada',
  'create.mix.rarities': 'Menos obvias',
  'create.mixHint': 'Elige qué tan conocidas quieres que sean las canciones.',
  'create.mix.popular.hint': 'Prioriza las canciones más conocidas.',
  'create.mix.balanced.hint':
    'Combina canciones conocidas con opciones menos obvias.',
  'create.mix.rarities.hint':
    'Prioriza canciones menos conocidas del catálogo.',
  'create.order': 'Orden de la playlist',
  'create.orderHint': 'Cómo se acomodan las canciones en la lista.',
  'create.order.artist': 'Artista A–Z',
  'create.order.artist.hint':
    'Ordena por nombre de artista y después por canción.',
  'create.order.title': 'Título A–Z',
  'create.order.title.hint': 'Ordena por nombre de la canción.',
  'create.order.random': 'Al azar',
  'create.order.random.hint': 'Mezcla toda la lista al azar.',
  'create.perArtistOne': '1 canción por artista',
  'create.perArtist': '{songs} canciones por artista',
  'create.perGenreOne': '1 canción por género',
  'create.perGenre': '{songs} canciones por género',
  'create.addArtist': 'Agrega al menos un artista.',
  'create.addGenre': 'Agrega al menos un género.',
  'create.needArtist': 'Agrega al menos un artista para continuar.',
  'create.needGenre': 'Agrega al menos un género para continuar.',
  'create.maxArtists': 'Máximo de {max} artistas.',
  'create.maxGenres': 'Máximo de {max} géneros.',
  'create.clearAll': 'Limpiar todo',
  'create.removeArtist': 'Quitar {name}',
  'create.failed': 'No se pudo crear la playlist. Intenta de nuevo.',
  'create.failedTitle': 'No se pudo crear la playlist',
  'create.generating': 'Creando…',
  'create.generate': 'Crear playlist',
  'create.working': 'Creando tu playlist',
  'create.ready': 'Playlist lista',
  'create.createAnother': 'Crear otra',
  'create.adjustAndRecreate': 'Probar otra configuración',
  'create.settings': 'Configuración usada',
  'create.showSettings': 'Mostrar configuración',
  'create.hideSettings': 'Ocultar configuración',
  'create.summaryMore': '+{count} más',
  'create.workingHint': 'Buscando canciones para tu playlist…',
  'create.workingHintSlow':
    'Creando la playlist. Esto puede tardar un momento…',
  'create.workingHintLong':
    'Seguimos trabajando. Las playlists más grandes tardan más…',
  'create.workingHintVeryLong':
    'Sigue en proceso — gracias por la paciencia…',
  'create.progressResolving': 'Preparando tu selección',
  'create.progressMatching': 'Buscando canciones',
  'create.progressPublishing': 'Creando la playlist en Spotify',
  'create.progressCount': '{current} de {total}',
  'create.etaLessThanMinute': 'Menos de 1 min restante',
  'create.etaOneMinute': 'Aprox. 1 min restante',
  'create.etaMinutes': 'Aprox. {minutes} min restantes',
  'create.nearCompleteTracks':
    'Agregamos {count} de {requested} canciones: casi el total solicitado.',
  'create.partialTracks':
    'Encontramos {count} de {requested} canciones. Prueba con otros artistas, géneros u otra opción de familiaridad.',
  'create.noTracksFound':
    'No encontramos canciones para esta mezcla. Prueba con otros artistas, géneros u otra opción de familiaridad.',
  'create.openSpotify': 'Abrir en Spotify',
  'create.copyLink': 'Copiar enlace',
  'create.copied': 'Copiado',
  'create.linkPending': 'El enlace de Spotify aparece cuando la playlist esté lista.',
  'preview.player': 'Vista previa de la playlist',
  'preview.modeLabel': 'Escuchar',
  'preview.modeHere': 'Escuchar aquí',
  'preview.modeDevice': 'Reproducir en un dispositivo',
  'preview.playOnDevice': 'Reproducir todo',
  'preview.connectList': 'Reproducir en Spotify',
  'preview.connectHint':
    'Reproduce en la app de Spotify de tu celular, computadora o altavoz. Requiere Spotify Premium. Abre Spotify si es necesario.',
  'preview.show': 'Vista previa',
  'preview.hide': 'Ocultar vista previa',
  'preview.playOpened':
    'La reproducción se envió a Spotify. Si no empieza, presiona Reproducir en la app.',
  'preview.playError': 'No se pudo iniciar la reproducción. Inténtalo nuevamente.',
  'preview.premiumRequired':
    'Reproducir en un dispositivo requiere Spotify Premium.',
  'preview.sessionExpired':
    'Tu sesión de Spotify expiró. Inicia sesión de nuevo y vuelve a intentarlo.',
  'preview.invalidPlayback':
    'No se pudo reproducir esta selección en Spotify.',
  'preview.wakingDevice': 'Abriendo Spotify…',
  'preview.deviceMissing': 'No se encontró ningún dispositivo de Spotify. Abre Spotify e inténtalo nuevamente.',
  'preview.deviceStillMissing': 'Spotify está abierto, pero todavía no hay un dispositivo activo. Reproduce cualquier canción en Spotify y vuelve a intentarlo.',
  'preview.retryPlay': 'Reintentar',
  'search.placeholder': 'Buscar artistas…',
  'search.trackPlaceholder': 'Buscar canciones…',
  'search.clear': 'Limpiar búsqueda',
  'search.artistResults': 'Resultados de artistas',
  'search.trackResults': 'Resultados de canciones',
  'search.resultsOne': '1 resultado disponible.',
  'search.resultsMany': '{count} resultados disponibles.',
  'search.error': 'No se pudieron buscar artistas. Inténtalo nuevamente.',
  'search.trackError': 'No se pudieron buscar canciones. Inténtalo nuevamente.',
  'search.empty': 'No se encontraron artistas.',
  'search.trackEmpty': 'No se encontraron canciones.',
  'search.added': 'Agregado',
  'errors.rateLimited':
    'Hay demasiadas solicitudes. Intenta de nuevo en {wait}.',
  'errors.rateLimitedLater':
    'Hay demasiadas solicitudes. Intenta de nuevo más tarde.',
  'errors.concurrencyLimited':
    'Todavía se está creando otra playlist. Espera a que termine e intenta de nuevo.',
  'errors.capacityExceeded':
    'Blendify está ocupado en este momento. Intenta de nuevo en {wait}.',
  'errors.capacityExceededLater':
    'Blendify está ocupado en este momento. Intenta de nuevo más tarde.',
  'errors.serviceUnavailable':
    'Blendify no está disponible temporalmente. Intenta de nuevo en {wait}.',
  'errors.serviceUnavailableLater':
    'Blendify no está disponible temporalmente. Intenta de nuevo más tarde.',
  'errors.wait.oneSecond': 'cerca de 1 segundo',
  'errors.wait.seconds': 'cerca de {n} segundos',
  'errors.wait.oneMinute': 'cerca de 1 minuto',
  'errors.wait.minutes': 'cerca de {n} minutos',
  'errors.wait.oneHour': 'cerca de 1 hora',
  'errors.wait.hours': 'cerca de {n} horas',
  'errors.spotifyLimit.spotifyWait':
    'Spotify está limitando temporalmente las solicitudes de Blendify y pidió esperar {wait} antes de volver a intentarlo.',
  'errors.spotifyLimit.estimate':
    'Spotify está limitando temporalmente las solicitudes de Blendify. Blendify estima {wait}, pero podría tardar más.',
  'errors.spotifyLimit.unknown':
    'Spotify está limitando temporalmente las solicitudes de Blendify. Vuelve a intentarlo más tarde.',
  'errors.spotifyLimit.why':
    '¿Por qué veo esto?',
  'errors.spotifyLimit.hide':
    'Ocultar detalles',
  'errors.spotifyLimit.explanation':
    'Spotify limita cuántas solicitudes pueden hacer las aplicaciones durante un periodo de tiempo. Blendify alcanzó ese límite de forma temporal. Esto afecta la integración de Blendify con Spotify, no tu cuenta. No necesitas volver a conectarla; vuelve a intentarlo más tarde.',
  'errors.lastfmMissing':
    'Las recomendaciones de música relacionada no están disponibles. Intenta más tarde.',
  'errors.lastfmSimilar':
    'No se pudo cargar música relacionada. Intenta de nuevo.',
  'errors.regionLookupUnavailable':
    'No pudimos comprobar la región de los resultados. Intenta más tarde o quita la región.',
  'errors.artistFilterLookupUnavailable':
    'No pudimos comprobar la región o las voces de los resultados. Intenta más tarde o quita esos filtros.',
  'errors.genreLookupUnavailable':
    'No encontramos suficientes artistas para este género. Prueba con otro género o intenta más tarde.',
  'errors.artistResolve':
    'No pudimos encontrar uno de los artistas seleccionados en Spotify. Intenta buscarlo.',
  'errors.artistResolveNamed':
    'No encontramos «{name}» en Spotify. Intenta buscarlo.',
  'errors.trackResolveNamed':
    'No encontramos la canción «{name}» en Spotify. Prueba con otra.',
  'genre.searchPlaceholder': 'Buscar géneros…',
  'genre.loadError': 'No se pudieron cargar los géneros. Inténtalo de nuevo.',
  'genre.empty': 'No se encontraron géneros coincidentes.',
  'genre.remove': 'Quitar {name}',
  'genre.mains': 'Géneros principales',
  'genre.results': 'Coincidencias',
  'genre.exploreSeedHint': 'Basado en:',
  'genre.suggestMore': 'Mostrar más',
  'genre.exploreEmpty':
    'Aún no hay sugerencias. Prueba con otro género de tu lista.',
  'genre.exploreExhausted': 'Por ahora es todo.',
  'artist.exploreSeedHint': 'Basado en:',
  'artist.exploreError': 'No se pudieron cargar sugerencias ahora.',
  'artist.exploreEmpty':
    'Aún no hay sugerencias. Prueba con otro artista de tu lista.',
  'artist.exploreExhausted': 'Por ahora es todo.',
  'artist.exploreResolveError':
    'No se pudo agregar ese artista. Intenta buscarlo.',
  'artist.suggestMore': 'Mostrar más',
  'library.eyebrow': 'Biblioteca',
  'library.title': 'Tu biblioteca',
  'library.subtitle':
    'Playlists guardadas en Blendify. Ábrelas en Spotify, cámbiales el nombre o quítalas.',
  'library.loading': 'Cargando biblioteca…',
  'library.loadError': 'No se pudo cargar tu biblioteca.',
  'common.retry': 'Reintentar',
  'library.emptyTitle': 'Todavía no hay nada guardado',
  'library.emptyBody':
    'Cuando «Guardar en la biblioteca» está activo, las nuevas playlists aparecen aquí. Puedes cambiarlo en Preferencias.',
  'library.emptyCta': 'Empezar a mezclar',
  'library.refresh': 'Sincronizar con Spotify',
  'library.refreshError':
    'La sincronización no terminó. Revisa tu conexión e inténtalo en un rato.',
  'library.refreshSuccess': 'Biblioteca sincronizada con Spotify.',
  'library.refreshSuccessOne':
    'Biblioteca sincronizada con Spotify. Se eliminó 1 playlist que ya no existe en Spotify.',
  'library.refreshSuccessMany':
    'Biblioteca sincronizada con Spotify. Se eliminaron {count} playlists que ya no existen en Spotify.',
  'library.searchPlaceholder': 'Buscar playlists…',
  'library.clearSearch': 'Limpiar búsqueda',
  'library.searchEmptyTitle': 'Sin resultados',
  'library.searchEmptyBody': 'Prueba con otro nombre o borra la búsqueda.',
  'library.showingCount': 'Mostrando {shown} de {total}',
  'library.loadMore': 'Ver más',
  'library.confirmAction': 'Quitar',
  'library.dismiss': 'Cerrar',
  'library.deleteTitle': '¿Quitar de Blendify?',
  'library.purgeTitle': '¿Quitar de Spotify?',
  'library.bulkPurgeTitle': '¿Quitar de Spotify?',
  'library.actionFailedTitle': 'Algo salió mal',
  'library.actionPartialTitle': 'Completado en parte',
  'stats.eyebrow': 'Estadísticas',
  'stats.title': 'Tus estadísticas',
  'stats.subtitle':
    'Tus artistas y géneros más usados. Se conservan aunque borres la biblioteca.',
  'stats.loading': 'Cargando estadísticas…',
  'stats.loadError': 'No se pudieron cargar las estadísticas.',
  'stats.emptyTitle': 'Todavía no hay estadísticas',
  'stats.emptyBody':
    'Crea algunas playlists para ver los artistas y géneros que más usas.',
  'stats.emptyCta': 'Empezar a mezclar',
  'stats.topArtists': 'Artistas más usados',
  'stats.topGenres': 'Géneros más usados',
  'stats.topEmpty': 'Todavía no hay datos.',
  'stats.uniqueArtists': 'Artistas usados',
  'stats.uniqueGenres': 'Géneros usados',
  'stats.artistMixes': 'Playlists por artista',
  'stats.genreMixes': 'Playlists por género',
  'stats.reset': 'Restablecer estadísticas',
  'stats.resetTitle': '¿Restablecer tus estadísticas?',
  'stats.resetBody':
    'Borra tus clasificaciones y contadores. Tu biblioteca y las playlists de Spotify no cambiarán.',
  'stats.resetConfirm': 'Restablecer',
  'stats.resetWorking': 'Restableciendo…',
  'stats.resetError':
    'No se pudieron restablecer las estadísticas. Intenta de nuevo.',
  'library.selectAllVisible': 'Seleccionar todas',
  'library.deselectAll': 'Deseleccionar todas',
  'library.selectHint': 'Selecciona las playlists que quieres quitar.',
  'library.selectedCountOne': '1 seleccionada',
  'library.selectedCountMany': '{count} seleccionadas',
  'library.selectItem': 'Seleccionar {name}',
  'library.editSelection': 'Seleccionar',
  'library.doneSelecting': 'Cancelar',
  'library.working': 'Trabajando…',
  'library.bulkPurgeSelected': 'Quitar {count} de Spotify',
  'library.bulkRemoveSelected': 'Quitar {count} de Blendify',
  'library.bulkRemoveTitle': '¿Quitar de Blendify?',
  'library.bulkPurgeSelectedConfirm':
    '¿Quitar de Spotify las {count} playlists seleccionadas? También se quitarán de tu biblioteca de Blendify.',
  'library.bulkRemoveSelectedConfirm':
    '¿Quitar de Blendify las {count} playlists seleccionadas? Seguirán en Spotify.',
  'library.bulkPartial': 'Se completó para {affected}, pero {failed} no pudieron procesarse. Actualiza la página e inténtalo nuevamente si es necesario.',
  'library.bulkError':
    'No se pudo completar la acción seleccionada. Intenta de nuevo.',
  'library.openSpotify': 'Abrir en Spotify',
  'library.copy': 'Copiar enlace',
  'library.copied': 'Copiado',
  'library.more': 'Más acciones',
  'library.rename': 'Renombrar',
  'library.removeFromLibrary': 'Quitar de Blendify',
  'library.purgeSpotify': 'Quitar de Spotify',
  'library.deleteConfirmActive':
    '¿Quitar «{name}» de Blendify? Permanecerá en Spotify.',
  'library.purgeSpotifyConfirm':
    '¿Quitar «{name}» de Spotify? También se quitará de tu biblioteca de Blendify.',
  'library.purgeSpotifyError': 'No se pudo quitar la playlist de Spotify. Revisa tu conexión e inténtalo nuevamente.',
  'library.statusPending': 'Creando…',
  'library.statusFailed': 'No se pudo crear',
  'library.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.loading': 'Cargando…',
  'common.close': 'Cerrar',
  'create.coverHintArtists':
    'Se genera con el nombre de la playlist y las fotos de los artistas.',
  'create.coverHintGenres': 'Se genera con el nombre de la playlist.',
  'discover.coverHintArtist':
    'Se genera con el nombre de la playlist y la foto del artista.',
  'discover.coverHintTrack':
    'Se genera con el nombre de la playlist y la portada del álbum.',
  'discover.summarySeed': 'a partir de {seed}',
  'create.estimateSongsOne': '≈ 1 canción',
  'create.estimateSongs': '≈ {count} canciones',
  'create.artistsEmpty': 'Busca o pega hasta {max} artistas.',
  'create.pasteHint': 'Un artista por línea.',
  'create.suggestions': 'Sugerencias',
  'create.suggestionsFor': 'Sugerencias basadas en {name}',
  'create.suggestionsHint': 'Selecciona una para agregarla.',
  'create.addSuggestion': 'Agregar {name}',
  'create.recreateNote':
    'Si cambias esta configuración, se crea una playlist nueva. La que acabas de crear se queda en Spotify.',
  'create.generateNew': 'Crear playlist nueva',
  'create.leaveNoteLibrary':
    'Puedes explorar otras secciones mientras se crea. La playlist se guardará en Spotify y en tu biblioteca. Mantén esta pestaña abierta: si la recargas o la cierras, Blendify ya no podrá mostrar el resultado.',
  'create.leaveNoteSpotify':
    'Puedes explorar otras secciones mientras se crea. La playlist se guardará en Spotify. Mantén esta pestaña abierta: si la recargas o la cierras, Blendify ya no podrá mostrar el resultado.',
  'common.songsOne': '1 canción',
  'common.songsMany': '{count} canciones',
  'preview.showAll': 'Ver las {count} canciones',
  'preview.showFewer': 'Ver menos',
  'library.kindMix': 'Mezcla',
  'library.kindDiscover': 'Descubrir',
  'library.titleMany': '{first}, {second} y {count} más',
  'landing.accessNote':
    'La conexión con Spotify está limitada a cuentas habilitadas.',
  'landing.accessMore': 'Más información',
  'stats.useCountOne': '1 playlist',
  'stats.useCountMany': '{count} playlists',
  'stats.overview': 'Resumen',
  'nav.connectSpotify':
    'Conectar Spotify',
  'landing.ctaGuest': 'Continuar sin Spotify',
  'landing.ctaOpenApp': 'Ir a Blendify',
  'spotifyRequired.library':
    'Conecta Spotify para usar tu biblioteca.',
  'spotifyRequired.stats':
    'Conecta Spotify para ver tus estadísticas.',
  'authError.restricted':
    'Esta cuenta de Spotify no está habilitada para conectarse con Blendify. Spotify limita qué cuentas pueden conectarse a esta integración. Puedes seguir usando Blendify sin conectar Spotify.',
  'authError.denied':
    'No terminaste de conectar tu cuenta de Spotify. Puedes intentarlo de nuevo o seguir usando Blendify sin Spotify.',
  'authError.failed':
    'No pudimos conectar con Spotify. Inténtalo de nuevo en un momento. Mientras tanto, puedes seguir usando Blendify sin Spotify.',
  'authError.expired':
    'Ese intento de conexión ya no es válido. Inicia uno nuevo desde Conectar Spotify.',
  'authError.dismiss':
    'Cerrar',
  'authError.moreInfo':
    'Más información',
  'spotifyAccess.title':
    'Acceso a Spotify',
  'spotifyAccess.intro':
    'Esta cuenta de Spotify no está habilitada para conectarse con Blendify. Ese límite viene de Spotify y corresponde a esta cuenta.',
  'spotifyAccess.whyTitle':
    'Por qué sucede',
  'spotifyAccess.whyBody':
    'Blendify usa el modo de desarrollo de Spotify. En ese modo, solo pueden conectarse las cuentas de Spotify habilitadas para Blendify.',
  'spotifyAccess.retry':
    'Intentarlo de nuevo con la misma cuenta no elimina esa restricción.',
  'spotifyAccess.optionsTitle':
    'Qué puedes hacer',
  'spotifyAccess.withoutTitle':
    'Sin conectar Spotify',
  'spotifyAccess.withoutBody':
    'Puedes crear playlists en Blendify. Permanecen en este navegador hasta que sales de la página o la recargas, y puedes preparar una transferencia con Soundiiz. Los datos de las canciones siguen viniendo de Spotify.',
  'spotifyAccess.withTitle':
    'Con Spotify conectado',
  'spotifyAccess.withBody':
    'Guardar playlists en tu cuenta de Spotify, usar la biblioteca y ver tus estadísticas requiere una cuenta habilitada para esta integración.',
  'spotifyAccess.privatePlaylists':
    'Las playlists nuevas que Blendify guarda en Spotify se crean como privadas.',
  'spotifyAccess.otherAccount':
    'Si tienes otra cuenta de Spotify ya habilitada para Blendify, inicia sesión con ella en Spotify y luego conéctala desde Blendify. Conectar de nuevo mientras esta cuenta sigue con la sesión abierta en Spotify repite el mismo intento.',
  'spotifyAccess.continue':
    'Continuar en Blendify',
  'spotifyRequired.dismiss':
    'Cerrar aviso',
  'common.opensNewTab':
    '(se abre en una pestaña nueva)',
  'create.leaveNoteGuest':
    'Mantén esta página abierta hasta que la playlist esté lista. Si sales, se detiene y no se guarda nada.',
  'create.recreateNoteGuest':
    'Si cambias esta configuración, se crea una playlist nueva que reemplaza la que ves aquí.',
  'guestResult.temporary':
    'Esta playlist es temporal. Se perderá si sales de esta página o la recargas.',
  'attribution.lastfm':
    'Recomendaciones musicales con tecnología de',
  'guestResult.attribution':
    'Datos de las canciones de',
  'guestResult.attributionWithArtwork':
    'Datos de las canciones e imagen de',
  'guestResult.trackList':
    'Canciones de esta playlist',
  'guestResult.openTrackInSpotify':
    'Abrir {track} de {artists} en Spotify',
  'guestResult.openArtworkInSpotify':
    'Abrir en Spotify el origen de la portada',
  'footer.privacy':
    'Privacidad',
  'spotify.openArtist':
    'Abrir {name} en Spotify',
  'transfer.title':
    'Transferir con Soundiiz',
  'transfer.explainer':
    'Soundiiz abrirá una página externa donde podrás elegir el servicio de destino y completar la transferencia. La playlist todavía no se creó en ningún servicio.',
  'transfer.prepare':
    'Preparar transferencia',
  'transfer.preparing':
    'Preparando transferencia…',
  'transfer.readyOne':
    'Transferencia preparada para 1 canción. Disponible hasta el {expires}.',
  'transfer.readyMany':
    'Transferencia preparada para {count} canciones. Disponible hasta el {expires}.',
  'transfer.continue':
    'Continuar en Soundiiz',
  'transfer.failed':
    'No se pudo preparar la transferencia. Intenta de nuevo.',
  'transfer.regenerate':
    'Generar de nuevo',
  'transfer.errorInvalid':
    'Esta playlist ya no se puede transferir. Genérala de nuevo para transferirla.',
  'transfer.errorExpired':
    'La opción de transferencia de esta playlist venció. Genera la playlist de nuevo para transferirla.',
  'transfer.errorRejected':
    'Soundiiz no pudo aceptar esta playlist. Prueba generar otra.',
  'transfer.errorUnavailable':
    'Soundiiz no responde en este momento. Intenta de nuevo en {wait}.',
  'transfer.errorUnavailableLater':
    'Soundiiz no responde en este momento. Intenta de nuevo más tarde.',
  'errors.catalogUnavailable':
    'El catálogo de música no está disponible temporalmente. Intenta de nuevo en unos minutos.',
  'errors.spotifyReauthRequired':
    'Tu conexión con Spotify ya no es válida. Vuelve a conectar Spotify para continuar.',
  'errors.spotifyUnavailable':
    'No pudimos comunicarnos correctamente con Spotify. Vuelve a intentarlo.',
  'errors.spotifyUnavailableWait':
    'Spotify no está respondiendo en este momento y pidió esperar {wait} antes de volver a intentarlo.',
  'errors.spotifyPermissionDenied':
    'Spotify no permitió esta acción para tu cuenta.',
  'errors.spotifyRequestRejected':
    'Spotify no pudo procesar esta solicitud. Intenta de nuevo más tarde.',
  'errors.spotifyOutcomeUnknown':
    'Spotify no confirmó si se hizo el cambio. Revisa Spotify antes de volver a intentarlo.',
  'errors.spotifyPlaylistIncomplete':
    'Blendify creó la playlist en Spotify, pero no pudo terminarla. Ábrela en Spotify para revisarla.',
  'create.unconfirmedTitle':
    'No pudimos confirmar la playlist',
  'create.unconfirmed':
    'Spotify no confirmó si se creó la playlist. Es posible que ya esté en tu cuenta, así que revisa tus playlists en Spotify antes de crearla de nuevo.',
  'create.createNewAnyway':
    'Crear otra playlist igualmente',
  'create.createNewAnywayHint':
    'Esto envía la misma solicitud otra vez como una playlist aparte. Si la anterior se creó, tendrás las dos en Spotify.',
  'create.resubmitBlockedUncertain':
    'Primero revisa Spotify. Para crear otra playlist, usa “Crear otra playlist igualmente”, arriba.',
  'create.incompleteTitle':
    'No pudimos terminar la playlist',
  'create.incompleteNoTracks':
    'Blendify creó la playlist en Spotify, pero Spotify no aceptó sus canciones. Ábrela en Spotify para revisarla.',
  'create.incompleteUnknownTracks':
    'Blendify creó la playlist en Spotify, pero no pudo confirmar si se agregaron sus canciones. Ábrela en Spotify para revisarla.',
  'create.incompleteLibrary':
    'Tu playlist ya está en Spotify con todas sus canciones, pero Blendify no pudo guardarla en tu biblioteca.',
  'runStatus.unconfirmed.mix':
    'No pudimos confirmar tu mezcla',
  'runStatus.unconfirmed.discover':
    'No pudimos confirmar tu playlist de Descubrir',
  'runStatus.incomplete.mix':
    'Tu mezcla quedó sin terminar',
  'runStatus.incomplete.discover':
    'Tu playlist de Descubrir quedó sin terminar',
  'errors.invalidGenerationResponse':
    'Blendify recibió una respuesta inesperada. Intenta de nuevo.',
  'create.stepSize': 'Tamaño',
  'create.generateGuest': 'Generar playlist',
  'create.generatingGuest': 'Generando…',
  'create.generateNewGuest': 'Generar playlist nueva',
  'create.workingGuest': 'Generando tu playlist',
  'create.workingHintGuest': 'Buscando canciones para tu playlist…',
  'discover.workingHintGuest': 'Buscando canciones relacionadas para tu playlist…',
  'create.readyGuest': 'Playlist generada',
  'create.failedTitleGuest': 'No se pudo generar la playlist',
  'nav.ai': 'Crear con IA',
  'nav.aiShort': 'IA',
  'ai.eyebrow': 'Crear con IA',
  'ai.title': 'Describe la playlist que quieres',
  'ai.subtitle':
    'Nombra artistas, una canción o géneros, y agrega detalles como tamaño, familiaridad o canciones a evitar. Blendify te muestra lo que entendió antes de crear nada.',
  'ai.requestTitle': 'Tu pedido',
  'ai.promptLabel': 'Pedido de playlist',
  'ai.promptPlaceholder':
    'Por ejemplo: 30 canciones menos conocidas de Soda Stereo y Los Fabulosos Cadillacs, nada de Maná',
  'ai.promptHint': 'Presiona Ctrl+Enter o ⌘+Enter para enviar.',
  'ai.promptRequired': 'Primero describe la playlist que quieres.',
  'ai.suggestionsLabel': 'Prueba un ejemplo',
  'ai.suggestion.artists': '30 canciones menos conocidas de Radiohead e Interpol',
  'ai.suggestion.genres': 'Shoegaze y dream pop, unas 40 canciones',
  'ai.suggestion.discoverArtist': 'Música parecida a Björk',
  'ai.suggestion.discoverTrack': 'Empezar desde Teardrop de Massive Attack',
  'ai.submit': 'Revisar pedido',
  'ai.submitting': 'Leyendo tu pedido…',
  'ai.interpreting': 'Leyendo tu pedido…',
  'ai.error.unavailable':
    'Crear con IA no está disponible en este momento. Mezclar y Descubrir siguen disponibles.',
  'ai.error.timeout': 'Leer tu pedido tardó demasiado. Vuelve a intentarlo.',
  'ai.error.rateLimited':
    'Crear con IA está ocupado en este momento. Vuelve a intentarlo en un rato.',
  'ai.error.invalidOutput':
    'Blendify no pudo leer tu pedido esta vez. Vuelve a intentarlo o escríbelo de otra forma.',
  'ai.error.requestRejected':
    'Blendify no puede usar este pedido tal como está escrito. Prueba a escribirlo de otra forma.',
  'ai.error.sessionExpired':
    'Esta sesión expiró. Envía tu pedido de nuevo para empezar otra.',
  'ai.error.optionUnavailable':
    'Esa opción ya no está disponible. Blendify cargó la última versión de tu pedido.',
  'ai.error.paused.title': 'Crear con IA está temporalmente pausado',
  'ai.error.paused.wait':
    'Alcanzaste el límite temporal de Crear con IA. Puedes volver a intentarlo en {wait}.',
  'ai.error.paused.later':
    'Alcanzaste el límite temporal de Crear con IA. Vuelve a intentarlo en unos minutos.',
  'ai.error.paused.retryIn': 'Volver a intentar en {wait}',
  'ai.error.generic': 'No se pudo leer tu pedido. Vuelve a intentarlo.',
  'ai.clarify.title': 'Una cosa para confirmar',
  'ai.clarify.ambiguous':
    'Nombra al menos un artista, una canción o un género para que Blendify sepa por dónde empezar.',
  'ai.clarify.unsupportedOnly':
    'Blendify no puede crear una playlist solo con esto. Agrega un artista, una canción o un género.',
  'ai.clarify.notAPlaylist':
    'Eso no parece un pedido de playlist. Describe la música que quieres.',
  'ai.clarify.mixedSeeds':
    'Blendify parte de un solo tipo de punto de partida a la vez. ¿Cuál debería usar?',
  'ai.clarify.tooManyArtists':
    'Una mezcla puede usar hasta {limit} artistas y tu pedido nombra {count}. Edítalo para quedarte con los que quieras.',
  'ai.clarify.tooManyGenres':
    'Una mezcla puede usar hasta {limit} géneros y tu pedido nombra {count}. Edítalo para quedarte con los que quieras.',
  'ai.clarify.singleArtist':
    'Descubrir parte de un solo artista. Elige uno o mézclalos.',
  'ai.clarify.singleArtistOnly': 'Descubrir parte de un solo artista. Elige uno.',
  'ai.clarify.singleTrack': 'Descubrir parte de una sola canción. Elige una.',
  'ai.clarify.trackCount':
    'Las playlists pueden tener hasta {limit} canciones.',
  'ai.clarify.ordering':
    'Blendify no puede ordenar las canciones de esa forma con confianza. Elige otro orden:',
  'ai.clarify.unknownGenres':
    'Blendify no reconoce estos géneros: {names}. Prueba con otro nombre.',
  'ai.clarify.ambiguousGenres':
    'Estos géneros son demasiado amplios para una sola mezcla: {names}. Nombra un género o estilo más específico.',
  'ai.clarify.conflictingRegions':
    'Una playlist puede usar una sola región y tu pedido nombra más de una: {names}. Edítalo para quedarte con una región.',
  'ai.clarify.unknownRegion':
    'Blendify no puede limitar los resultados a {names}. Edita tu pedido con otra región o sin región.',
  'ai.clarify.regionNotSupported':
    'Una región ({names}) solo refina los artistas que descubre Blendify, no los que elegiste. Pide música parecida a ese artista o quita la región.',
  'ai.clarify.femaleVocalsNotSupported':
    'Las voces femeninas solo refinan los artistas que descubre Blendify, no los que elegiste. Pide música parecida a ese artista o quita el filtro de voces.',
  'ai.clarify.invalidReleaseRange':
    'Ese período ({names}) termina antes de empezar. Indica los años de nuevo.',
  'ai.option.discoverSimilarFiltered': 'Descubrir artistas parecidos con ese filtro',
  'ai.clarify.invalidDuration':
    'Esa duración no sirve. Pide una duración de al menos un minuto.',
  'ai.clarify.optionsLabel': 'Elige una opción',
  'ai.clarify.orEdit': 'O edita tu pedido y envíalo de nuevo.',
  'ai.clarify.edit': 'Edita tu pedido y envíalo de nuevo.',
  'ai.option.useArtists': 'Usar solo los artistas',
  'ai.option.useGenres': 'Usar solo los géneros',
  'ai.option.useSong': 'Usar solo la canción',
  'ai.option.discoverSimilar': 'Descubrir artistas parecidos en esa región',
  'ai.option.mixArtists': 'Mezclar estos artistas',
  'ai.option.keepSeed': 'Empezar desde {name}',
  'ai.option.trackCount': 'Usar {count} canciones',
  'ai.category.duration': 'Duración',
  'ai.category.era': 'Época',
  'ai.category.energy': 'Energía',
  'ai.category.mood': 'Estado de ánimo',
  'ai.category.activity': 'Actividad',
  'ai.category.tempo': 'Tempo',
  'ai.category.progression': 'Progresión',
  'ai.category.artist_attribute': 'Datos de artistas',
  'ai.category.genre_exclusion': 'Exclusión de género',
  'ai.category.other': 'Otro',
  'ai.summary.title': 'Esto es lo que entendió Blendify',
  'ai.summary.subtitle':
    'Revisa estos ajustes. Edita tu pedido si algo no está bien.',
  'ai.summary.contextSubtitle': 'El pedido con el que se creó esta vista previa.',
  'ai.summary.basedOn': 'Basado en',
  'ai.summary.genres': 'Géneros',
  'ai.summary.region': 'Región',
  'ai.summary.vocals': 'Voces',
  'ai.summary.femaleVocals': 'Femeninas',
  'ai.summary.era': 'Época',
  'ai.summary.versions': 'Versiones',
  'ai.summary.songs': 'Canciones',
  'ai.summary.duration': 'Duración',
  'ai.summary.durationValue': 'Unos {minutes} min',
  'ai.summary.mood': 'Estado de ánimo',
  'ai.mood.happy': 'Alegre',
  'ai.mood.calm': 'Tranquilo',
  'ai.mood.energetic': 'Enérgico',
  'ai.mood.sad': 'Triste',
  'ai.mood.romantic': 'Romántico',
  'ai.mood.angry': 'Furioso',
  'ai.mood.dark': 'Oscuro',
  'ai.mood.nostalgic': 'Nostálgico',
  'ai.mood.dreamy': 'Onírico',
  'ai.summary.avoiding': 'Evitando',
  'ai.summary.trackBy': '{title} de {artist}',
  'ai.summary.unmet': 'No se usarán',
  'ai.summary.unmetHint':
    'Estos detalles todavía no son compatibles, por lo que no afectarán esta playlist.',
  'ai.editRequest': 'Editar pedido',
  'ai.startOver': 'Empezar de nuevo',
  'ai.createPlaylist': 'Crear vista previa',
  'ai.createHint': 'Blendify creará una vista previa de tu playlist.',
  'ai.cancelEdit': 'Cancelar edición',
  'ai.restoring': 'Cargando tu pedido…',
  'ai.error.restoreFailed': 'No se pudo cargar tu pedido anterior. Vuelve a intentarlo o envíalo de nuevo.',
  'ai.generating.title': 'Creando tu playlist…',
  'ai.generating.hint': 'Buscando música para tu pedido',
  'ai.generating.stalled': 'Esto está tardando más de lo habitual.',
  'ai.generating.checkAgain': 'Volver a comprobar',
  'ai.result.eyebrow': 'Vista previa de la playlist',
  'ai.result.titleLabel': 'Título de la playlist',
  'ai.result.editTitle': 'Editar título',
  'ai.result.doneEditingTitle': 'Listo',
  'ai.result.previewNote': 'Es una vista previa. No se guardó en Spotify.',
  'ai.result.durationRequested': 'pediste unos {minutes} min',
  'ai.unmet.title': 'Algunas preferencias no se pudieron aplicar del todo',
  'ai.unmet.trackCount': 'Pediste {requested} canciones; esta playlist tiene {actual}.',
  'ai.unmet.duration': 'Pediste unos {requested} min; esta playlist dura {actual}.',
  'ai.moodNotApplied.title': 'No aplicado',
  'ai.moodNotApplied.seed':
    'Esta playlist se arma a partir de los artistas o la canción que nombraste. Por ahora, el estado de ánimo solo se usa para elegir géneros cuando no indicas uno.',
  'ai.moodNotApplied.explicitGenre':
    'Especificaste un género. Por ahora, el estado de ánimo solo se usa para elegir géneros cuando no indicas uno.',
  'ai.generationError.title': 'No se pudo crear tu playlist',
  'ai.generationError.seedNotFound': 'Blendify no encontró {names} en Spotify.',
  'ai.generationError.seedNotFoundGeneric': 'Blendify no encontró en Spotify uno de los artistas o canciones que nombraste.',
  'ai.generationError.seedNotFoundHint': 'Revisa cómo lo escribiste en tu pedido y vuelve a enviarlo.',
  'ai.generationError.spotifyUnavailable': 'Spotify no está respondiendo en este momento. Vuelve a intentarlo en unos minutos.',
  'ai.generationError.discoveryUnavailable': 'Los datos de música relacionada no están disponibles en este momento. Vuelve a intentarlo en unos minutos.',
  'ai.generationError.insufficient': 'Blendify no encontró suficiente música para este pedido. Prueba con otros artistas, géneros u otra canción.',
  'ai.generationError.interrupted': 'Se interrumpió la creación de tu playlist. Vuelve a intentarlo.',
  'ai.generationError.failed': 'No se pudo terminar de crear tu playlist. Vuelve a intentarlo.',
  'ai.destination.spotifyTitle': 'Guardar en Spotify',
  'ai.destination.spotifyHint':
    'Blendify creará una playlist privada con este título en tu cuenta de Spotify.',
  'ai.destination.spotifyHintLibrary':
    'Blendify creará una playlist privada con este título en tu cuenta de Spotify y la agregará a tu biblioteca.',
  'ai.destination.save': 'Guardar en Spotify',
  'ai.destination.saving': 'Guardando en Spotify…',
  'ai.destination.saved': 'Guardada en Spotify',
  'ai.destination.savedHint': 'La playlist ya está en tu cuenta de Spotify.',
  'ai.destination.savedHintLibrary':
    'La playlist ya está en tu cuenta de Spotify y en tu biblioteca.',
  'ai.destination.incompleteTitle': 'No se pudo terminar de guardar en Spotify',
  'ai.destination.incomplete':
    'Blendify creó la playlist en Spotify, pero no pudo terminar de guardarla. Ábrela en Spotify para ver qué canciones se agregaron.',
  'ai.destination.uncertain':
    'Blendify no pudo confirmar si la playlist se creó en Spotify. Revisa tu cuenta de Spotify antes de crearla de nuevo.',
  'ai.destination.failed':
    'No se pudo guardar la playlist en Spotify. Vuelve a intentarlo.',
  'ai.destination.reconnect':
    'Spotify necesita que vuelvas a conectarte antes de guardar esta playlist. La vista previa se queda aquí.',
  'ai.refine.open':
    'Refinar playlist',
  'ai.refine.openHint':
    'Cambia esta vista previa antes de guardarla. Nada cambia hasta que apliques la propuesta.',
  'ai.refine.title':
    'Refinar playlist',
  'ai.refine.label':
    '¿Qué te gustaría cambiar?',
  'ai.refine.hint':
    'Describe el cambio con tus palabras. Blendify te muestra la playlist propuesta antes de cambiar nada.',
  'ai.refine.placeholder':
    'Por ejemplo: menos conocida y sin Coldplay',
  'ai.refine.required':
    'Primero describe qué te gustaría cambiar.',
  'ai.refine.examplesLabel':
    'Prueba un ejemplo',
  'ai.refine.example.lessMainstream':
    'Que sea menos conocida',
  'ai.refine.example.removeArtist':
    'Quita a Coldplay',
  'ai.refine.example.keepFirst':
    'Mantén las primeras cinco canciones',
  'ai.refine.example.trackCount':
    'Que tenga 20 canciones',
  'ai.refine.submit':
    'Proponer cambios',
  'ai.refine.refining':
    'Refinando la playlist…',
  'ai.refine.cancel':
    'Cancelar',
  'ai.refine.keepHint':
    'Selecciona canciones abajo para mantenerlas en su posición actual.',
  'ai.refine.keepSelectedOne': '1 canción seleccionada para mantener',
  'ai.refine.keepSelectedMany': '{count} canciones seleccionadas para mantener',
  'ai.refine.keptAlreadyOne': '1 canción ya mantenida en su lugar',
  'ai.refine.keptAlreadyMany': '{count} canciones ya mantenidas en su lugar',
  'ai.refine.keepLabel':
    'Mantener',
  'ai.refine.keepTrack':
    'Mantener “{track}” en su lugar',
  'ai.refine.kept':
    'Mantenida',
  'ai.refine.keptTrack':
    '“{track}” se mantiene en su lugar por un cambio anterior',
  'ai.refine.applied':
    'Cambios aplicados. Esta es ahora tu playlist actual.',
  'ai.refine.dismissed':
    'Tu playlist actual no cambió.',
  'ai.refine.pendingDestination':
    'Termina o descarta el refinamiento actual antes de guardar esta playlist.',
  'ai.refine.review.title':
    'Cambios propuestos',
  'ai.refine.review.settingsOnlySubtitle':
    'No cambiaría ninguna canción. Aplica para guardar estos ajustes y Blendify los tendrá en cuenta en tus próximos cambios.',
  'ai.refine.review.unappliedMoodSubtitle':
    'No cambiaría ninguna canción, porque este estado de ánimo no se usa para elegir canciones. Aplica para conservarlo en tu pedido.',
  'ai.refine.review.subtitle':
    'Todavía no se aplicó ningún cambio. Aplica los cambios para actualizar tu playlist o cancela para conservar la playlist actual.',
  'ai.refine.review.apply':
    'Aplicar cambios',
  'ai.refine.review.applying':
    'Aplicando cambios…',
  'ai.refine.review.cancel':
    'Cancelar',
  'ai.refine.review.dismissing':
    'Descartando…',
  'ai.refine.review.proposedPlaylist':
    'Playlist propuesta',
  'ai.refine.review.proposedTrackList':
    'Canciones de la playlist propuesta',
  'ai.refine.review.notApplied':
    'No aplicado',
  'ai.refine.review.notAppliedHint':
    'Estas partes de tu refinamiento todavía no son compatibles, así que no se aplicaron.',
  'ai.refine.diff.settings':
    'Ajustes',
  'ai.refine.diff.noSongChanges':
    'Tus canciones actuales quedan igual.',
  'ai.refine.diff.tracks':
    'Playlist',
  'ai.refine.diff.to':
    'cambia a',
  'ai.refine.diff.added':
    'Agregadas',
  'ai.refine.diff.removed':
    'Quitadas',
  'ai.refine.diff.moved':
    'Movidas',
  'ai.refine.diff.retained':
    'Conservadas',
  'ai.refine.diff.replacements':
    'Reemplazos',
  'ai.refine.diff.kept':
    'Mantenidas en su lugar',
  'ai.refine.diff.songCount':
    'Canciones',
  'ai.refine.diff.length':
    'Duración',
  'ai.refine.diff.movedFrom':
    'Movida de la posición {from} a la {to}',
  'ai.refine.diff.addedItems':
    'Se agrega: {items}',
  'ai.refine.diff.removedItems':
    'Se quita: {items}',
  'ai.refine.diff.notSet':
    'Sin definir',
  'ai.refine.diff.noMood':
    'Sin estado de ánimo',
  'ai.refine.diff.defaultOrder':
    'Orden predeterminado',
  'ai.refine.diff.details':
    'Ver cambios de canciones',
  'ai.refine.field.kind':
    'Tipo de playlist',
  'ai.refine.field.artists':
    'Artistas',
  'ai.refine.field.genres':
    'Géneros',
  'ai.refine.field.seedTracks':
    'Canción de partida',
  'ai.refine.field.excludeArtists':
    'Artistas evitados',
  'ai.refine.field.excludeTracks':
    'Canciones evitadas',
  'ai.refine.kind.artist_mix':
    'Mezcla de artistas',
  'ai.refine.kind.genre_mix':
    'Mezcla de géneros',
  'ai.refine.kind.discover_artist':
    'Descubrir desde un artista',
  'ai.refine.kind.discover_track':
    'Descubrir desde una canción',
  'ai.refine.failed.title':
    'No se pudieron preparar estos cambios',
  'ai.refine.failed.hint':
    'Tu playlist actual no cambió.',
  'ai.refine.dismiss':
    'Descartar',
  'ai.refine.clarify.title':
    'Este cambio necesita otro intento',
  'ai.refine.tryAgain':
    'Probar otro refinamiento',
  'ai.refine.continue':
    'Seguir con la playlist actual',
  'ai.refine.unchanged.title':
    'No hace falta cambiar nada',
  'ai.refine.unchanged.body':
    'Tu playlist y tus ajustes ya cumplen con ese pedido, así que Blendify no cambió nada.',
  'ai.refine.clarify.conflicting':
    'Algunos de estos cambios se contradicen. Prueba otro refinamiento.',
  'ai.refine.clarify.conflictingNamed':
    'Estos cambios se contradicen entre sí o con las canciones que mantienes: {names}.',
  'ai.refine.clarify.conflictingLimit':
    'Las canciones que mantienes no entran en una playlist de {limit} canciones.',
  'ai.refine.clarify.outOfRange':
    'Esta playlist tiene {limit} canciones, así que Blendify no puede mantener una canción más allá de esa posición.',
  'ai.refine.clarify.ambiguous':
    'Blendify necesita más detalle para hacer este cambio. Indica un número exacto de canciones o minutos, o qué agregar, quitar o mantener.',
  'ai.refine.clarify.unsupported':
    'Blendify todavía no puede hacer este tipo de cambio. Prueba otro refinamiento.',
  'ai.refine.clarify.genreExclusion':
    'Blendify todavía no puede excluir canciones por género de forma confiable, así que no cambió tu playlist. Indica artistas o canciones para dejar afuera, o elige los géneros que quieres.',
  'ai.refine.clarify.unsupportedNamed':
    'Blendify todavía no puede hacer estos cambios: {items}. Prueba otro refinamiento.',
  'ai.refine.clarify.notARefinement':
    'Eso no parece un cambio para esta playlist. Indica qué agregar, quitar o mantener.',
  'ai.refine.clarify.mixedSeeds':
    'Una playlist parte de un solo tipo de punto de partida a la vez: artistas, canciones o géneros. Prueba un refinamiento que use solo uno de ellos.',
  'ai.refine.clarify.ordering':
    'Blendify no puede ordenar las canciones de esa forma. Pide el orden Artista A–Z, Título A–Z o Al azar.',
  'ai.refine.clarify.artistNotKept':
    'No hay canciones de {names} en la playlist actual para mantener.',
  'ai.refine.clarify.singleArtist':
    'Descubrir parte de un solo artista. Prueba un refinamiento que nombre solo uno o pide una mezcla.',
  'ai.refine.clarify.singleTrack':
    'Descubrir parte de una sola canción. Prueba un refinamiento que nombre solo una.',
  'ai.refine.clarify.tooManyArtists':
    'Una mezcla puede usar hasta {limit} artistas y este cambio usaría {count}. Prueba un refinamiento con menos artistas.',
  'ai.refine.clarify.tooManyGenres':
    'Una mezcla puede usar hasta {limit} géneros y este cambio usaría {count}. Prueba un refinamiento con menos géneros.',
  'ai.refine.error.inProgress':
    'Esta playlist ya se está refinando. Espera un momento y vuelve a intentarlo.',
  'ai.refine.error.limit':
    'Esta playlist no se puede refinar más. Guárdala así o empieza de nuevo.',
  'ai.refine.error.superseded':
    'Esta playlist cambió mientras Blendify leía tu refinamiento. Vuelve a intentarlo.',
  'ai.refine.error.unavailable':
    'Esta playlist ya se guardó o transfirió, así que no se puede refinar. Empieza de nuevo para crear otra versión.',
  'ai.refine.error.pending':
    'Hay otro cambio de esta playlist esperando tu revisión. Aplícalo o descártalo antes de volver a refinar.',
  'ai.refine.error.stale':
    'Esa propuesta ya no es la actual. Blendify cargó la última versión de tu playlist.',
  'ai.refine.error.generic':
    'No se pudo refinar la playlist. Vuelve a intentarlo.',
  'ai.refine.error.settle':
    'No se pudo actualizar la playlist. Vuelve a intentarlo.',
  'runStatus.label':
    'Creación de playlist',
  'runStatus.active.mix':
    'Creando tu mezcla',
  'runStatus.active.discover':
    'Creando en Descubrir',
  'runStatus.succeeded.mix':
    'Tu mezcla está lista',
  'runStatus.succeeded.discover':
    'Listo en Descubrir',
  'runStatus.failed.mix':
    'No se pudo crear tu mezcla',
  'runStatus.failed.discover':
    'No se pudo crear en Descubrir',
  'runStatus.uncertain.mix':
    'Se perdió la conexión al crear tu mezcla',
  'runStatus.uncertain.discover':
    'Se perdió la conexión en Descubrir',
  'runStatus.busy.mix':
    'Espera a que termine tu mezcla antes de crear otra playlist.',
  'runStatus.busy.discover':
    'Espera a que termine Descubrir antes de crear otra playlist.',
  'runStatus.viewProgress':
    'Ver progreso',
  'runStatus.viewPlaylist':
    'Ver playlist',
  'runStatus.viewDetails':
    'Ver detalles',
  'runStatus.dismiss':
    'Cerrar',
  'create.uncertainTitle':
    'Se perdió la conexión',
  'create.uncertainLibrary':
    'Blendify perdió la conexión antes de poder confirmar el resultado. Es posible que la playlist ya exista, así que revisa tu biblioteca o Spotify antes de crearla de nuevo.',
  'create.uncertainSpotify':
    'Blendify perdió la conexión antes de poder confirmar el resultado. Es posible que la playlist ya exista, así que revisa Spotify antes de crearla de nuevo.',
  'create.openLibrary':
    'Abrir biblioteca',
  'home.eyebrow': 'Inicio',
  'home.title': '¿Qué quieres crear?',
  'home.subtitle':
    'Elige por dónde empezar. Sin conectar Spotify, el resultado es temporal y puedes preparar una transferencia con Soundiiz. Blendify no lo guarda.',
  'home.actionsLabel': 'Formas de crear',
  'home.mixDescription': 'Combina artistas o géneros en una playlist.',
  'home.discoverDescription': 'Empieza con un artista o una canción y explora música relacionada.',
  'home.aiDescription': 'Describe la playlist que tienes en mente.',
  'home.secondaryTitle': 'También en Blendify',
  'home.libraryDescription': 'Las playlists que guardaste en Blendify.',
  'home.statsDescription': 'Tus artistas y géneros más usados.',
  'home.connectTitle': '¿Quieres guardar tus playlists directo en Spotify?',
  'home.connectBody':
    'Conecta Spotify para guardar playlists privadas en tu cuenta, tener una biblioteca y ver tus estadísticas. Las opciones de arriba funcionan sin conectar.',
}
