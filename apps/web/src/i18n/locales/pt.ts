import type { MessageKey } from './en'

export const pt: Record<MessageKey, string> = {
  'brand.tagline': 'Misture as músicas que você ama em novas playlists.',
  'brand.description':
    'Misture artistas ou gêneros, ou comece por um artista ou uma música. O Blendify monta a playlist; conecte o Spotify para salvá-la na sua conta.',
  'nav.logOut': 'Sair',
  'nav.account': 'Menu da conta',
  'nav.create': 'Misturar',
  'nav.discover': 'Descobrir',
  'nav.library': 'Biblioteca',
  'nav.stats': 'Estatísticas',
  'nav.main': 'Menu principal',
  'nav.skipToContent': 'Pular para o conteúdo',
  'playlist.description.empty': 'Criada com o Blendify.',
  'playlist.description.one': 'Criada com o Blendify a partir de {name}.',
  'playlist.description.two':
    'Criada com o Blendify a partir de {first} e {second}.',
  'playlist.description.many':
    'Criada com o Blendify a partir de {first} e mais {count}.',
  'playlist.discoverDescription.artist':
    'Inspirada em {seed}. Criada com o Blendify.',
  'playlist.discoverDescription.track':
    'Inspirada em “{seed}”, de {artist}. Criada com o Blendify.',
  'lang.label': 'Idioma',
  'lang.en': 'EN',
  'lang.es': 'ES',
  'lang.pt': 'PT',
  'lang.enName': 'English',
  'lang.esName': 'Español',
  'lang.ptName': 'Português',
  'preferences.open': 'Preferências',
  'preferences.title': 'Preferências',
  'preferences.subtitle':
    'Aplica-se a todas as playlists que você criar no Blendify.',
  'preferences.persistToLibrary': 'Salvar na biblioteca',
  'preferences.persistToLibraryHint':
    'Salva as playlists na sua biblioteca do Blendify. Desative para salvá-las apenas no Spotify; suas estatísticas continuarão sendo atualizadas.',
  'discover.eyebrow': 'Descobrir',
  'discover.title': 'Comece com um artista ou uma música',
  'discover.subtitle':
    'Escolha um ponto de partida e criaremos uma playlist com músicas relacionadas.',
  'discover.modeArtist': 'Artista',
  'discover.modeTrack': 'Música',
  'discover.stepSeed': 'Ponto de partida',
  'discover.stepDetails': 'Tamanho da playlist',
  'discover.songsLabel': 'músicas',
  'discover.artist': 'Artista',
  'discover.track': 'Música',
  'discover.addArtist': 'Escolha um artista primeiro.',
  'discover.addTrack': 'Escolha uma música primeiro.',
  'discover.needArtist': 'Escolha um artista para continuar.',
  'discover.needTrack': 'Escolha uma música para continuar.',
  'discover.removeTrack': 'Remover {name}',
  'discover.generate': 'Criar playlist',
  'discover.generating': 'Criando…',
  'discover.working': 'Criando sua playlist',
  'discover.workingHint':
    'Buscando músicas relacionadas e adicionando ao Spotify…',
  'discover.failed':
    'Não foi possível criar a playlist. Tente outro artista ou outra música.',
  'discover.notEnoughSimilar':
    'Não há músicas relacionadas suficientes. Tente outro artista ou outra música.',
  'discover.resolveFailed':
    'Não encontramos músicas relacionadas suficientes no Spotify. Tente outro artista ou outra música.',
  'create.eyebrow': 'Misturar',
  'create.title': 'Crie sua mistura',
  'create.subtitle':
    'Escolha artistas ou gêneros e ajuste a mistura.',
  'create.modeArtists': 'Artistas',
  'create.modeGenres': 'Gêneros',
  'create.stepSource': 'Artistas ou gêneros',
  'create.stepDetails': 'Tamanho e capa',
  'create.generateCover': 'Adicionar uma capa',
  'create.coverScopeHint':
    'Se a capa não for enviada, saia e entre novamente para renovar as permissões do Spotify.',
  'create.coverFailed':
    'Não foi possível gerar a capa. A playlist será criada sem ela.',
  'create.artists': 'Artistas',
  'create.genres': 'Gêneros',
  'create.paste': 'Colar uma lista de artistas',
  'create.pastePlaceholder': 'Radiohead\nTame Impala\n…',
  'create.resolve': 'Adicionar artistas',
  'create.resolveEmpty': 'Cole pelo menos um nome de artista.',
  'create.resolveTooMany': 'Você pode selecionar no máximo {max} artistas.',
  'create.resolveError': 'Alguns artistas não foram encontrados. Confira os nomes e tente novamente.',
  'create.tracksPerArtist': 'Músicas por artista',
  'create.tracksPerGenre': 'Músicas por gênero',
  'create.tracksMaxHint': 'Até {max} com esta seleção',
  'create.reach': 'Familiaridade',
  'create.mix.popular': 'Mais conhecidas',
  'create.mix.balanced': 'Equilibrada',
  'create.mix.rarities': 'Menos conhecidas',
  'create.mixHint': 'Escolha o quanto as músicas devem ser conhecidas.',
  'create.mix.popular.hint': 'Prioriza as músicas mais conhecidas.',
  'create.mix.balanced.hint':
    'Combina músicas conhecidas com opções menos populares.',
  'create.mix.rarities.hint':
    'Prioriza músicas menos conhecidas do catálogo.',
  'create.order': 'Ordem da playlist',
  'create.orderHint': 'Como as músicas são organizadas na lista.',
  'create.order.artist': 'Artista A–Z',
  'create.order.artist.hint': 'Ordena por nome do artista e depois pela música.',
  'create.order.title': 'Título A–Z',
  'create.order.title.hint': 'Ordena pelo nome da música.',
  'create.order.random': 'Aleatório',
  'create.order.random.hint': 'Embaralha toda a lista.',
  'create.perArtist': '{songs} por artista',
  'create.perGenre': '{songs} por gênero',
  'create.addArtist': 'Adicione pelo menos um artista.',
  'create.addGenre': 'Adicione pelo menos um gênero.',
  'create.needArtist': 'Adicione pelo menos um artista para continuar.',
  'create.needGenre': 'Adicione pelo menos um gênero para continuar.',
  'create.maxArtists': 'Máximo de {max} artistas.',
  'create.maxGenres': 'Máximo de {max} gêneros.',
  'create.clearAll': 'Limpar tudo',
  'create.removeArtist': 'Remover {name}',
  'create.failed': 'Não foi possível criar a playlist. Tente novamente.',
  'create.failedTitle': 'Não foi possível criar a playlist',
  'create.generating': 'Criando…',
  'create.generate': 'Criar playlist',
  'create.working': 'Criando sua playlist',
  'create.ready': 'Playlist pronta',
  'create.createAnother': 'Criar outra',
  'create.adjustAndRecreate': 'Testar outras configurações',
  'create.settings': 'Configurações usadas',
  'create.showSettings': 'Mostrar configurações',
  'create.hideSettings': 'Ocultar configurações',
  'create.summaryMore': '+{count} mais',
  'create.summarySongs': '{count} músicas',
  'create.workingHint': 'Buscando músicas e adicionando-as ao Spotify…',
  'create.workingHintSlow':
    'Montando a mistura: pode demorar um pouco…',
  'create.workingHintLong':
    'Ainda trabalhando — misturas maiores costumam demorar mais…',
  'create.workingHintVeryLong':
    'Ainda em andamento — obrigado pela paciência…',
  'create.progressResolving': 'Preparando sua seleção',
  'create.progressMatching': 'Buscando músicas',
  'create.progressPublishing': 'Criando a playlist no Spotify',
  'create.progressCount': '{current} de {total}',
  'create.etaLessThanMinute': 'Menos de 1 min restante',
  'create.etaOneMinute': 'Cerca de 1 min restante',
  'create.etaMinutes': 'Cerca de {minutes} min restantes',
  'create.nearCompleteTracks':
    'Adicionamos {count} de {requested} músicas: quase o total solicitado.',
  'create.partialTracks':
    'Encontramos {count} de {requested} músicas. Tente outros artistas, gêneros ou outra opção de familiaridade.',
  'create.noTracksFound':
    'Não encontramos músicas para esta mistura. Tente outros artistas, gêneros ou outra opção de familiaridade.',
  'create.openSpotify': 'Abrir no Spotify',
  'create.copyLink': 'Copiar link',
  'create.copied': 'Copiado',
  'create.linkPending': 'O link do Spotify aparece quando a playlist estiver pronta.',
  'preview.player': 'Prévia da playlist',
  'preview.modeLabel': 'Ouvir',
  'preview.modeHere': 'Ouvir aqui',
  'preview.modeDevice': 'Tocar em um dispositivo',
  'preview.playOnDevice': 'Reproduzir tudo',
  'preview.connectList': 'Reproduzir no Spotify',
  'preview.connectHint':
    'Reproduz no app do Spotify no seu celular, computador ou caixa de som. Requer Spotify Premium. Abre o Spotify se necessário.',
  'preview.show': 'Prévia',
  'preview.hide': 'Ocultar prévia',
  'preview.playOpened':
    'A reprodução foi enviada ao Spotify. Se não começar, toque em Reproduzir no app.',
  'preview.playError': 'Não foi possível iniciar a reprodução. Tente novamente.',
  'preview.premiumRequired':
    'A reprodução em um dispositivo requer Spotify Premium.',
  'preview.sessionExpired':
    'Sua sessão do Spotify expirou. Entre novamente e tente outra vez.',
  'preview.invalidPlayback':
    'Não foi possível reproduzir esta seleção no Spotify.',
  'preview.wakingDevice': 'Abrindo o Spotify…',
  'preview.deviceMissing': 'Nenhum dispositivo do Spotify foi encontrado. Abra o Spotify e tente novamente.',
  'preview.deviceStillMissing': 'O Spotify está aberto, mas ainda não há um dispositivo ativo. Reproduza qualquer música no Spotify e tente novamente.',
  'preview.retryPlay': 'Tentar de novo',
  'search.placeholder': 'Buscar artistas…',
  'search.trackPlaceholder': 'Buscar músicas…',
  'search.clear': 'Limpar busca',
  'search.artistResults': 'Resultados de artistas',
  'search.trackResults': 'Resultados de músicas',
  'search.resultsOne': '1 resultado disponível.',
  'search.resultsMany': '{count} resultados disponíveis.',
  'search.error': 'Não foi possível buscar artistas. Tente novamente.',
  'search.trackError': 'Não foi possível buscar músicas. Tente novamente.',
  'search.empty': 'Nenhum artista encontrado.',
  'search.trackEmpty': 'Nenhuma música encontrada.',
  'search.added': 'Adicionado',
  'search.rateLimited':
    'O Spotify está limitando as solicitações. Aguarde alguns minutos e tente novamente.',
  'errors.spotifyQuota':
    'O Spotify está ocupado no momento. Tente novamente em {wait}.',
  'errors.spotifyRateLimit':
    'Há solicitações demais. Tente novamente em {wait}.',
  'errors.rateLimited':
    'Há solicitações demais. Tente novamente em {wait}.',
  'errors.concurrencyLimited':
    'Outra playlist ainda está sendo criada. Aguarde terminar e tente novamente.',
  'errors.capacityExceeded':
    'O Blendify está ocupado no momento. Tente novamente em {wait}.',
  'errors.serviceUnavailable':
    'O Blendify está temporariamente indisponível. Tente novamente em {wait}.',
  'errors.wait.seconds': 'cerca de {n} segundos',
  'errors.wait.minutes': 'cerca de {n} minutos',
  'errors.wait.hours': 'cerca de {n} horas',
  'errors.wait.severalHours': 'várias horas',
  'errors.lastfmMissing':
    'As recomendações de músicas relacionadas não estão disponíveis. Tente mais tarde.',
  'errors.lastfmSimilar':
    'Não foi possível carregar música relacionada agora. Tente de novo.',
  'errors.genreLookupUnavailable':
    'Não encontramos artistas suficientes para este gênero. Tente outro gênero ou tente mais tarde.',
  'errors.artistResolve':
    'Não encontramos um dos artistas selecionados no Spotify. Tente buscá-lo.',
  'errors.artistResolveNamed':
    'Não encontramos “{name}” no Spotify. Tente buscar esse artista.',
  'errors.trackResolveNamed':
    'Não encontramos a faixa “{name}” no Spotify. Tente outra semente.',
  'genre.searchPlaceholder': 'Buscar gêneros…',
  'genre.loadError': 'Não foi possível carregar os gêneros. Tente de novo.',
  'genre.empty': 'Nenhum gênero correspondente encontrado.',
  'genre.remove': 'Remover {name}',
  'genre.mains': 'Gêneros populares',
  'genre.results': 'Resultados',
  'genre.exploreSeedHint': 'Com base em:',
  'genre.suggestMore': 'Mostrar mais',
  'genre.exploreEmpty': 'Ainda não há sugestões. Tente outro gênero da sua lista.',
  'genre.exploreExhausted': 'Por enquanto é só isso.',
  'artist.exploreSeedHint': 'Com base em:',
  'artist.exploreError': 'Não foi possível carregar sugestões agora.',
  'artist.exploreEmpty': 'Ainda não há sugestões. Tente outro artista da sua lista.',
  'artist.exploreExhausted': 'Por enquanto é só isso.',
  'artist.exploreResolveError':
    'Não foi possível adicionar esse artista. Tente buscá-lo.',
  'artist.suggestMore': 'Mostrar mais',
  'library.eyebrow': 'Biblioteca',
  'library.title': 'Sua biblioteca',
  'library.subtitle':
    'Playlists salvas no Blendify. Abra no Spotify, renomeie ou remova.',
  'library.loading': 'Carregando biblioteca…',
  'library.loadError': 'Não foi possível carregar sua biblioteca.',
  'common.retry': 'Tentar de novo',
  'library.emptyTitle': 'Nada salvo ainda',
  'library.emptyBody':
    'Quando “Salvar na biblioteca” está ativo, as novas playlists aparecem aqui. Você pode mudar isso em Preferências.',
  'library.emptyCta': 'Começar a misturar',
  'library.refresh': 'Sincronizar com Spotify',
  'library.refreshError':
    'A sincronização não terminou. Verifique sua conexão e tente de novo em breve.',
  'library.searchPlaceholder': 'Buscar playlists…',
  'library.clearSearch': 'Limpar busca',
  'library.searchEmptyTitle': 'Sem resultados',
  'library.searchEmptyBody': 'Tente outro nome ou limpe a busca.',
  'library.showingCount': 'Mostrando {shown} de {total}',
  'library.loadMore': 'Ver mais',
  'library.confirmAction': 'Remover',
  'library.dismiss': 'Fechar',
  'library.deleteTitle': 'Remover do Blendify?',
  'library.purgeTitle': 'Remover do Spotify?',
  'library.bulkPurgeTitle': 'Remover do Spotify?',
  'library.actionFailedTitle': 'Algo deu errado',
  'library.actionPartialTitle': 'Concluído em parte',
  'stats.eyebrow': 'Estatísticas',
  'stats.title': 'Suas estatísticas',
  'stats.subtitle':
    'Seus artistas e gêneros mais usados. Eles permanecem mesmo se você limpar a biblioteca.',
  'stats.loading': 'Carregando estatísticas…',
  'stats.loadError': 'Não foi possível carregar as estatísticas.',
  'stats.emptyTitle': 'Ainda não há estatísticas',
  'stats.emptyBody':
    'Crie algumas playlists para ver os artistas e gêneros que você mais usa.',
  'stats.emptyCta': 'Começar a misturar',
  'stats.topArtists': 'Artistas mais usados',
  'stats.topGenres': 'Gêneros mais usados',
  'stats.topEmpty': 'Nada por aqui ainda.',
  'stats.uniqueArtists': 'Artistas usados',
  'stats.uniqueGenres': 'Gêneros usados',
  'stats.artistMixes': 'Playlists por artista',
  'stats.genreMixes': 'Playlists por gênero',
  'stats.reset': 'Redefinir estatísticas',
  'stats.resetTitle': 'Redefinir suas estatísticas?',
  'stats.resetBody':
    'Apaga suas classificações e seus contadores. Sua biblioteca e as playlists do Spotify não serão alteradas.',
  'stats.resetConfirm': 'Redefinir',
  'stats.resetWorking': 'Redefinindo…',
  'stats.resetError': 'Não foi possível redefinir as estatísticas. Tente de novo.',
  'library.selectAllVisible': 'Selecionar todas',
  'library.deselectAll': 'Desmarcar todas',
  'library.selectHint': 'Selecione as playlists que deseja remover.',
  'library.selectedCount': '{count} selecionadas',
  'library.selectItem': 'Selecionar {name}',
  'library.editSelection': 'Selecionar',
  'library.doneSelecting': 'Cancelar',
  'library.working': 'Trabalhando…',
  'library.bulkPurgeSelected': 'Remover {count} do Spotify',
  'library.bulkRemoveSelected': 'Remover {count} do Blendify',
  'library.bulkRemoveTitle': 'Remover do Blendify?',
  'library.bulkPurgeSelectedConfirm':
    'Remover do Spotify as {count} playlists selecionadas? Elas continuam na sua biblioteca do Blendify, marcadas como “Fora do Spotify”.',
  'library.bulkRemoveSelectedConfirm':
    'Remover do Blendify as {count} playlists selecionadas? Elas continuam no Spotify.',
  'library.bulkPartial': 'Concluído para {affected}, mas {failed} falharam. Atualize a página e tente novamente, se necessário.',
  'library.bulkError':
    'Não foi possível concluir a ação selecionada. Tente novamente.',
  'library.openSpotify': 'Abrir no Spotify',
  'library.copy': 'Copiar link',
  'library.copied': 'Copiado',
  'library.more': 'Mais ações',
  'library.rename': 'Renomear',
  'library.removeFromLibrary': 'Remover do Blendify',
  'library.purgeSpotify': 'Remover do Spotify',
  'library.deleteConfirmActive':
    'Remover “{name}” do Blendify? Ela permanecerá no Spotify.',
  'library.deleteConfirmDeleted':
    'Remover “{name}” do Blendify? Ela já não está no Spotify; apenas o registro do Blendify será apagado.',
  'library.purgeSpotifyConfirm':
    'Remover “{name}” do Spotify? Ela continua na sua biblioteca do Blendify, marcada como “Fora do Spotify”.',
  'library.purgeSpotifyError': 'Não foi possível remover a playlist do Spotify. Verifique sua conexão e tente novamente.',
  'library.statusPending': 'Criando…',
  'library.statusFailed': 'Não foi possível criar',
  'library.deleted': 'Fora do Spotify',
  'library.save': 'Salvar',
  'common.cancel': 'Cancelar',
  'common.loading': 'Carregando…',
  'common.close': 'Fechar',
  'create.coverHintArtists':
    'Gerada com o nome da playlist e as fotos dos artistas.',
  'create.coverHintGenres': 'Gerada com o nome da playlist.',
  'discover.coverHintArtist':
    'Gerada com o nome da playlist e a foto do artista.',
  'discover.coverHintTrack': 'Gerada com o nome da playlist e a capa do álbum.',
  'discover.summarySeed': 'a partir de {seed}',
  'create.estimateSongs': '≈ {count} músicas',
  'create.artistsEmpty': 'Busque ou cole até {max} artistas.',
  'create.pasteHint': 'Um artista por linha.',
  'create.suggestions': 'Sugestões',
  'create.suggestionsFor': 'Sugestões com base em {name}',
  'create.suggestionsHint': 'Selecione uma para adicionar.',
  'create.addSuggestion': 'Adicionar {name}',
  'create.recreateNote':
    'Alterar estas configurações cria uma nova playlist. A que você acabou de criar continua no Spotify.',
  'create.generateNew': 'Criar nova playlist',
  'create.leaveNoteLibrary':
    'Você pode sair desta página: a playlist será salva no Spotify e na sua biblioteca mesmo assim.',
  'create.leaveNoteSpotify':
    'Você pode sair desta página: a playlist será salva no Spotify mesmo assim.',
  'common.songsOne': '1 música',
  'common.songsMany': '{count} músicas',
  'preview.showAll': 'Ver todas as {count} músicas',
  'preview.showFewer': 'Ver menos',
  'library.kindMix': 'Mix',
  'library.kindDiscover': 'Descoberta',
  'library.titleMany': '{first}, {second} e mais {count}',
  'landing.trust':
    'Conectar o Spotify é opcional. As playlists que você salvar são criadas como privadas na sua conta do Spotify.',
  'stats.useCountOne': '1 playlist',
  'stats.useCountMany': '{count} playlists',
  'stats.overview': 'Resumo',
  'nav.connectSpotify':
    'Conectar Spotify',
  'landing.ctaTry':
    'Experimentar o Blendify',
  'spotifyRequired.library':
    'Conecte o Spotify para usar sua Biblioteca.',
  'spotifyRequired.stats':
    'Conecte o Spotify para ver suas estatísticas.',
  'spotifyRequired.dismiss':
    'Fechar aviso',
  'common.opensNewTab':
    '(abre em uma nova aba)',
  'create.leaveNoteGuest':
    'Mantenha esta página aberta até a playlist ficar pronta. Ela não é salva em lugar nenhum.',
  'create.recreateNoteGuest':
    'Alterar estas configurações cria uma nova playlist, que substitui a que aparece aqui.',
  'guestResult.temporary':
    'Esta playlist é temporária. Ela será perdida se você sair desta página ou recarregá-la.',
  'guestResult.attribution':
    'Dados das músicas do Spotify.',
  'guestResult.attributionWithArtwork':
    'Dados das músicas e imagem do Spotify.',
  'guestResult.trackList':
    'Músicas desta playlist',
  'guestResult.openTrackInSpotify':
    'Abrir {track} de {artists} no Spotify',
  'transfer.title':
    'Transferir com o Soundiiz',
  'transfer.explainer':
    'O Soundiiz vai abrir uma página externa onde você escolhe o serviço de destino e conclui a transferência. A playlist ainda não foi criada em nenhum serviço.',
  'transfer.prepare':
    'Preparar transferência',
  'transfer.preparing':
    'Preparando transferência…',
  'transfer.ready':
    'Transferência preparada para {count} músicas. Disponível até {expires}.',
  'transfer.continue':
    'Continuar no Soundiiz',
  'transfer.failed':
    'Não foi possível preparar a transferência. Tente novamente.',
  'transfer.regenerate':
    'Gerar de novo',
  'transfer.errorInvalid':
    'Esta playlist não pode mais ser transferida. Gere-a de novo para transferi-la.',
  'transfer.errorExpired':
    'A opção de transferência desta playlist expirou. Gere a playlist de novo para transferi-la.',
  'transfer.errorRejected':
    'O Soundiiz não conseguiu aceitar esta playlist. Tente gerar outra.',
  'transfer.errorUnavailable':
    'O Soundiiz não está respondendo agora. Tente novamente em {wait}.',
  'errors.catalogUnavailable':
    'O catálogo de músicas está temporariamente indisponível. Tente novamente em alguns minutos.',
  'errors.invalidGenerationResponse':
    'O Blendify recebeu uma resposta inesperada. Tente novamente.',
  'create.stepSize': 'Tamanho',
  'create.generateGuest': 'Gerar playlist',
  'create.generatingGuest': 'Gerando…',
  'create.generateNewGuest': 'Gerar nova playlist',
  'create.workingGuest': 'Gerando sua playlist',
  'create.workingHintGuest': 'Buscando músicas para sua playlist…',
  'discover.workingHintGuest': 'Buscando músicas relacionadas para sua playlist…',
  'create.readyGuest': 'Playlist gerada',
  'create.failedTitleGuest': 'Não foi possível gerar a playlist',
}
