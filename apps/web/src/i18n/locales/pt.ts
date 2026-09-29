import type { MessageKey } from './en'

export const pt: Record<MessageKey, string> = {
  'brand.tagline': 'Misture as músicas que você ama em novas playlists.',
  'brand.description':
    'Misture artistas ou gêneros, ou comece por um artista ou uma música. O Blendify monta a playlist; conecte o Spotify para salvá-la na sua conta.',
  'nav.logOut': 'Sair',
  'nav.deleteAccount': 'Excluir conta',
  'account.delete.title': 'Excluir sua conta do Blendify?',
  'account.delete.body':
    'Isso remove sua conta do Blendify do serviço: seu perfil, os tokens do Spotify guardados para você, sua biblioteca do Blendify e suas estatísticas de uso. Não é possível desfazer.',
  'account.delete.spotifyNote':
    'Sua conta do Spotify não é afetada e as playlists já publicadas continuam no Spotify. O Blendify mantém o acesso que você concedeu até você removê-lo nas configurações da sua conta do Spotify.',
  'account.delete.confirm': 'Excluir minha conta',
  'account.delete.working': 'Excluindo sua conta…',
  'account.delete.error':
    'Não conseguimos excluir sua conta. Nada foi excluído; tente novamente.',
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
  'library.refreshSuccess': 'Biblioteca sincronizada com Spotify.',
  'library.refreshSuccessOne':
    'Biblioteca sincronizada com Spotify. 1 playlist foi removida porque não existe mais no Spotify.',
  'library.refreshSuccessMany':
    'Biblioteca sincronizada com Spotify. {count} playlists foram removidas porque não existem mais no Spotify.',
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
    'Remover do Spotify as {count} playlists selecionadas? Elas também serão removidas da sua biblioteca do Blendify.',
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
  'library.purgeSpotifyConfirm':
    'Remover “{name}” do Spotify? Ela também será removida da sua biblioteca do Blendify.',
  'library.purgeSpotifyError': 'Não foi possível remover a playlist do Spotify. Verifique sua conexão e tente novamente.',
  'library.statusPending': 'Criando…',
  'library.statusFailed': 'Não foi possível criar',
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
    'Você pode explorar outras seções enquanto ela é criada. A playlist será salva no Spotify e na sua biblioteca. Mantenha esta aba aberta: se você atualizar ou fechar a página, o Blendify não poderá mais mostrar o resultado.',
  'create.leaveNoteSpotify':
    'Você pode explorar outras seções enquanto ela é criada. A playlist será salva no Spotify. Mantenha esta aba aberta: se você atualizar ou fechar a página, o Blendify não poderá mais mostrar o resultado.',
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
  'authError.restricted':
    'Esta conta do Spotify não está autorizada a usar os recursos conectados do Blendify. O acesso conectado é limitado a contas autorizadas, e você pode continuar usando o Blendify no modo convidado.',
  'authError.denied':
    'Você não concluiu a conexão com o Spotify. Pode tentar de novo ou continuar usando o Blendify no modo convidado.',
  'authError.failed':
    'Não conseguimos conectar ao Spotify. Tente de novo em instantes; enquanto isso, o modo convidado continua funcionando.',
  'authError.expired':
    'Essa tentativa de conexão não é mais válida. Comece de novo em Conectar Spotify.',
  'authError.dismiss':
    'Fechar',
  'landing.spotifyAccess':
    'Os recursos conectados ao Spotify estão disponíveis para contas autorizadas. O modo convidado está disponível para todos.',
  'spotifyRequired.dismiss':
    'Fechar aviso',
  'common.opensNewTab':
    '(abre em uma nova aba)',
  'create.leaveNoteGuest':
    'Mantenha esta página aberta até a playlist ficar pronta. Se você sair, ela é interrompida e nada é salvo.',
  'create.recreateNoteGuest':
    'Alterar estas configurações cria uma nova playlist, que substitui a que aparece aqui.',
  'guestResult.temporary':
    'Esta playlist é temporária. Ela será perdida se você sair desta página ou recarregá-la.',
  'attribution.lastfm':
    'Recomendações musicais com tecnologia do',
  'guestResult.attribution':
    'Dados das músicas do',
  'guestResult.attributionWithArtwork':
    'Dados das músicas e imagem do',
  'guestResult.trackList':
    'Músicas desta playlist',
  'guestResult.openTrackInSpotify':
    'Abrir {track} de {artists} no Spotify',
  'guestResult.openArtworkInSpotify':
    'Abrir no Spotify a origem da capa',
  'footer.privacy':
    'Privacidade',
  'spotify.openArtist':
    'Abrir {name} no Spotify',
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
  'errors.spotifyReauthRequired':
    'Sua conexão com o Spotify não é mais válida. Conecte o Spotify de novo para continuar.',
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
  'nav.ai': 'Criar com IA',
  'nav.aiShort': 'IA',
  'ai.eyebrow': 'Criar com IA',
  'ai.title': 'Descreva a playlist que você quer',
  'ai.subtitle':
    'Cite artistas, uma música ou gêneros e adicione detalhes como tamanho, familiaridade ou músicas a evitar. O Blendify mostra o que entendeu antes de criar qualquer coisa.',
  'ai.requestTitle': 'Seu pedido',
  'ai.promptLabel': 'Pedido de playlist',
  'ai.promptPlaceholder':
    'Por exemplo: 30 músicas menos conhecidas de Caetano Veloso e Gilberto Gil, sem Roberto Carlos',
  'ai.promptHint': 'Pressione Ctrl+Enter ou ⌘+Enter para enviar.',
  'ai.promptRequired': 'Primeiro descreva a playlist que você quer.',
  'ai.suggestionsLabel': 'Experimente um exemplo',
  'ai.suggestion.artists':
    '30 músicas menos conhecidas de Radiohead e Interpol',
  'ai.suggestion.genres': 'Shoegaze e dream pop, umas 40 músicas',
  'ai.suggestion.discoverArtist': 'Músicas parecidas com Björk',
  'ai.suggestion.discoverTrack': 'Começar por Teardrop, de Massive Attack',
  'ai.submit': 'Revisar pedido',
  'ai.submitting': 'Lendo seu pedido…',
  'ai.interpreting': 'Lendo seu pedido…',
  'ai.error.unavailable':
    'Criar com IA está indisponível no momento. Mix e Descobrir continuam funcionando.',
  'ai.error.timeout': 'A leitura do seu pedido demorou demais. Tente de novo.',
  'ai.error.rateLimited':
    'Criar com IA está ocupado agora. Tente de novo em instantes.',
  'ai.error.invalidOutput':
    'O Blendify não conseguiu ler seu pedido desta vez. Tente de novo ou escreva de outro jeito.',
  'ai.error.requestRejected':
    'O Blendify não pode usar este pedido do jeito que está escrito. Tente escrever de outro jeito.',
  'ai.error.sessionExpired':
    'Esta sessão expirou. Envie seu pedido de novo para começar outra.',
  'ai.error.optionUnavailable':
    'Essa opção não está mais disponível. O Blendify carregou a versão mais recente do seu pedido.',
  'ai.error.generic': 'Não foi possível ler seu pedido. Tente de novo.',
  'ai.clarify.title': 'Uma coisa para confirmar',
  'ai.clarify.ambiguous':
    'Cite pelo menos um artista, uma música ou um gênero para o Blendify saber por onde começar.',
  'ai.clarify.unsupportedOnly':
    'O Blendify não consegue criar uma playlist só com isso. Adicione um artista, uma música ou um gênero.',
  'ai.clarify.notAPlaylist':
    'Isso não parece um pedido de playlist. Descreva a música que você quer.',
  'ai.clarify.mixedSeeds':
    'O Blendify parte de um tipo de ponto de partida por vez. Qual ele deve usar?',
  'ai.clarify.tooManyArtists':
    'Um mix pode usar até {limit} artistas e seu pedido cita {count}. Edite para manter os que você quer.',
  'ai.clarify.tooManyGenres':
    'Um mix pode usar até {limit} gêneros e seu pedido cita {count}. Edite para manter os que você quer.',
  'ai.clarify.singleArtist':
    'Descobrir parte de um único artista. Escolha um ou misture todos.',
  'ai.clarify.singleArtistOnly': 'Descobrir parte de um único artista. Escolha um.',
  'ai.clarify.singleTrack': 'Descobrir parte de uma única música. Escolha uma.',
  'ai.clarify.trackCount': 'As playlists podem ter até {limit} músicas.',
  'ai.clarify.ordering':
    'O Blendify não consegue ordenar as músicas desse jeito com confiança. Escolha outra ordem:',
  'ai.clarify.unknownGenres':
    'O Blendify não reconhece estes gêneros: {names}. Tente outro nome.',
  'ai.clarify.ambiguousGenres':
    'Estes gêneros são amplos demais para um único mix: {names}. Cite um gênero ou estilo mais específico.',
  'ai.clarify.invalidDuration':
    'Essa duração não funciona. Peça uma duração de pelo menos um minuto.',
  'ai.clarify.optionsLabel': 'Escolha uma opção',
  'ai.clarify.orEdit': 'Ou edite seu pedido e envie de novo.',
  'ai.clarify.edit': 'Edite seu pedido e envie de novo.',
  'ai.option.useArtists': 'Usar só os artistas',
  'ai.option.useGenres': 'Usar só os gêneros',
  'ai.option.useSong': 'Usar só a música',
  'ai.option.mixArtists': 'Misturar estes artistas',
  'ai.option.keepSeed': 'Começar por {name}',
  'ai.option.trackCount': 'Usar {count} músicas',
  'ai.category.duration': 'Duração',
  'ai.category.era': 'Época',
  'ai.category.energy': 'Energia',
  'ai.category.mood': 'Clima',
  'ai.category.activity': 'Atividade',
  'ai.category.tempo': 'Andamento',
  'ai.category.progression': 'Progressão',
  'ai.category.artist_attribute': 'Dados de artistas',
  'ai.category.genre_exclusion': 'Exclusão de gênero',
  'ai.category.other': 'Outro',
  'ai.summary.title': 'Isto é o que o Blendify entendeu',
  'ai.summary.subtitle':
    'Confira estas configurações. Edite seu pedido se algo não estiver certo.',
  'ai.summary.contextSubtitle': 'O pedido usado para criar esta prévia.',
  'ai.summary.basedOn': 'Baseado em',
  'ai.summary.genres': 'Gêneros',
  'ai.summary.songs': 'Músicas',
  'ai.summary.duration': 'Duração',
  'ai.summary.durationValue': 'Cerca de {minutes} min',
  'ai.summary.mood': 'Clima',
  'ai.mood.happy': 'Alegre',
  'ai.mood.calm': 'Calmo',
  'ai.mood.energetic': 'Energético',
  'ai.mood.sad': 'Triste',
  'ai.mood.romantic': 'Romântico',
  'ai.mood.angry': 'Furioso',
  'ai.mood.dark': 'Sombrio',
  'ai.mood.nostalgic': 'Nostálgico',
  'ai.mood.dreamy': 'Onírico',
  'ai.summary.avoiding': 'Evitando',
  'ai.summary.trackBy': '{title}, de {artist}',
  'ai.summary.unmet': 'Não serão usados',
  'ai.summary.unmetHint':
    'Esses detalhes ainda não são compatíveis, então não afetarão esta playlist.',
  'ai.editRequest': 'Editar pedido',
  'ai.startOver': 'Começar de novo',
  'ai.createPlaylist': 'Criar playlist',
  'ai.createHint': 'O Blendify vai criar uma prévia da sua playlist.',
  'ai.cancelEdit': 'Cancelar edição',
  'ai.restoring': 'Carregando seu pedido…',
  'ai.error.restoreFailed': 'Não foi possível carregar seu pedido anterior. Tente de novo ou envie-o outra vez.',
  'ai.generating.title': 'Criando sua playlist…',
  'ai.generating.hint': 'Buscando músicas para o seu pedido',
  'ai.generating.stalled': 'Isso está demorando mais do que o normal.',
  'ai.generating.checkAgain': 'Verificar de novo',
  'ai.result.eyebrow': 'Prévia da playlist',
  'ai.result.titleLabel': 'Título da playlist',
  'ai.result.editTitle': 'Editar título',
  'ai.result.doneEditingTitle': 'Concluir',
  'ai.result.previewNote': 'Esta é uma prévia. Ela não foi salva no Spotify.',
  'ai.result.durationRequested': 'você pediu cerca de {minutes} min',
  'ai.unmet.title': 'Algumas preferências não puderam ser aplicadas por completo',
  'ai.unmet.trackCount': 'Você pediu {requested} músicas; esta playlist tem {actual}.',
  'ai.unmet.duration': 'Você pediu cerca de {requested} min; esta playlist dura {actual}.',
  'ai.unmet.moodSeed': 'O Blendify montou esta playlist a partir dos artistas ou da música que você citou, então não conseguiu garantir esse clima.',
  'ai.unmet.moodGenres': 'O Blendify usou os gêneros que você citou do jeito que são, então não conseguiu garantir esse clima.',
  'ai.generationError.title': 'Não foi possível criar sua playlist',
  'ai.generationError.seedNotFound': 'O Blendify não encontrou {names} no Spotify.',
  'ai.generationError.seedNotFoundGeneric': 'O Blendify não encontrou no Spotify um dos artistas ou músicas que você citou.',
  'ai.generationError.seedNotFoundHint': 'Confira a grafia no seu pedido e envie de novo.',
  'ai.generationError.rateLimited': 'O Spotify está limitando temporariamente as solicitações do Blendify. Tente de novo em {wait}.',
  'ai.generationError.rateLimitedLater': 'O Spotify está limitando temporariamente as solicitações do Blendify. Tente de novo mais tarde.',
  'ai.generationError.spotifyUnavailable': 'O Spotify não está respondendo agora. Tente de novo em alguns minutos.',
  'ai.generationError.discoveryUnavailable': 'Os dados de músicas relacionadas não estão disponíveis agora. Tente de novo em alguns minutos.',
  'ai.generationError.insufficient': 'O Blendify não encontrou músicas suficientes para este pedido. Tente outros artistas, gêneros ou outra música.',
  'ai.generationError.interrupted': 'A criação da sua playlist foi interrompida. Tente de novo.',
  'ai.generationError.failed': 'Não foi possível terminar de criar sua playlist. Tente de novo.',
  'ai.destination.spotifyTitle': 'Salvar no Spotify',
  'ai.destination.spotifyHint':
    'O Blendify vai criar uma playlist privada com este título na sua conta do Spotify.',
  'ai.destination.spotifyHintLibrary':
    'O Blendify vai criar uma playlist privada com este título na sua conta do Spotify e adicioná-la à sua biblioteca.',
  'ai.destination.save': 'Salvar no Spotify',
  'ai.destination.saving': 'Salvando no Spotify…',
  'ai.destination.saved': 'Salva no Spotify',
  'ai.destination.savedHint': 'A playlist já está na sua conta do Spotify.',
  'ai.destination.savedHintLibrary':
    'A playlist já está na sua conta do Spotify e na sua biblioteca.',
  'ai.destination.incompleteTitle': 'Não foi possível terminar de salvar no Spotify',
  'ai.destination.incomplete':
    'O Blendify criou a playlist no Spotify, mas não conseguiu terminar de salvá-la. Abra no Spotify para ver quais músicas foram adicionadas.',
  'ai.destination.uncertain':
    'O Blendify não conseguiu confirmar se a playlist foi criada no Spotify. Confira sua conta do Spotify antes de criá-la de novo.',
  'ai.destination.failed':
    'Não foi possível salvar a playlist no Spotify. Tente de novo.',
  'ai.destination.reconnect':
    'O Spotify precisa que você se conecte de novo antes de salvar esta playlist. A prévia continua aqui.',
  'ai.refine.open':
    'Refinar playlist',
  'ai.refine.openHint':
    'Mude esta prévia antes de salvá-la. Nada muda até você aplicar a proposta.',
  'ai.refine.title':
    'Refinar playlist',
  'ai.refine.label':
    'O que você gostaria de mudar?',
  'ai.refine.hint':
    'Descreva a mudança com suas palavras. O Blendify mostra a playlist proposta antes de mudar qualquer coisa.',
  'ai.refine.placeholder':
    'Por exemplo: menos conhecida e sem Coldplay',
  'ai.refine.required':
    'Primeiro descreva o que você gostaria de mudar.',
  'ai.refine.examplesLabel':
    'Experimente um exemplo',
  'ai.refine.example.lessMainstream':
    'Deixe menos conhecida',
  'ai.refine.example.removeArtist':
    'Tire o Coldplay',
  'ai.refine.example.keepFirst':
    'Mantenha as cinco primeiras músicas',
  'ai.refine.example.trackCount':
    'Deixe com 20 músicas',
  'ai.refine.submit':
    'Propor mudanças',
  'ai.refine.refining':
    'Refinando a playlist…',
  'ai.refine.cancel':
    'Cancelar',
  'ai.refine.keepHint':
    'Selecione músicas abaixo para mantê-las na posição atual.',
  'ai.refine.keepSelected':
    'Músicas selecionadas para manter: {count}',
  'ai.refine.keptAlready':
    'Músicas já mantidas no lugar: {count}',
  'ai.refine.keepLabel':
    'Manter',
  'ai.refine.keepTrack':
    'Manter “{track}” no lugar',
  'ai.refine.kept':
    'Mantida',
  'ai.refine.keptTrack':
    '“{track}” é mantida no lugar por uma mudança anterior',
  'ai.refine.applied':
    'Mudanças aplicadas. Esta agora é a sua playlist atual.',
  'ai.refine.dismissed':
    'Sua playlist atual não mudou.',
  'ai.refine.pendingDestination':
    'Conclua ou descarte o refinamento atual antes de salvar esta playlist.',
  'ai.refine.review.title':
    'Mudanças propostas',
  'ai.refine.review.settingsOnlySubtitle':
    'Nenhuma música mudaria. Aplique para salvar estes ajustes e o Blendify vai respeitá-los nas próximas mudanças.',
  'ai.refine.review.subtitle':
    'Nada mudou ainda. Aplique as mudanças para atualizar sua playlist ou cancele para ficar com a atual.',
  'ai.refine.review.apply':
    'Aplicar mudanças',
  'ai.refine.review.applying':
    'Aplicando mudanças…',
  'ai.refine.review.cancel':
    'Cancelar',
  'ai.refine.review.dismissing':
    'Descartando…',
  'ai.refine.review.proposedPlaylist':
    'Playlist proposta',
  'ai.refine.review.proposedTrackList':
    'Músicas da playlist proposta',
  'ai.refine.review.notApplied':
    'Não aplicado',
  'ai.refine.review.notAppliedHint':
    'Estas partes do seu refinamento ainda não são compatíveis, então não foram aplicadas.',
  'ai.refine.diff.settings':
    'Configurações',
  'ai.refine.diff.noSongChanges':
    'Suas músicas atuais continuam iguais.',
  'ai.refine.diff.tracks':
    'Playlist',
  'ai.refine.diff.to':
    'muda para',
  'ai.refine.diff.added':
    'Adicionadas',
  'ai.refine.diff.removed':
    'Removidas',
  'ai.refine.diff.moved':
    'Movidas',
  'ai.refine.diff.retained':
    'Mantidas',
  'ai.refine.diff.replacements':
    'Substituições',
  'ai.refine.diff.kept':
    'Mantidas no lugar',
  'ai.refine.diff.songCount':
    'Músicas',
  'ai.refine.diff.length':
    'Duração',
  'ai.refine.diff.movedFrom':
    'Movida da posição {from} para a {to}',
  'ai.refine.diff.addedItems':
    'Adicionado: {items}',
  'ai.refine.diff.removedItems':
    'Removido: {items}',
  'ai.refine.diff.notSet':
    'Não definido',
  'ai.refine.diff.noMood':
    'Sem clima',
  'ai.refine.diff.defaultOrder':
    'Ordem padrão',
  'ai.refine.diff.details':
    'Ver mudanças nas músicas',
  'ai.refine.field.kind':
    'Tipo de playlist',
  'ai.refine.field.artists':
    'Artistas',
  'ai.refine.field.genres':
    'Gêneros',
  'ai.refine.field.seedTracks':
    'Música de partida',
  'ai.refine.field.excludeArtists':
    'Artistas evitados',
  'ai.refine.field.excludeTracks':
    'Músicas evitadas',
  'ai.refine.kind.artist_mix':
    'Mix de artistas',
  'ai.refine.kind.genre_mix':
    'Mix de gêneros',
  'ai.refine.kind.discover_artist':
    'Descobrir a partir de um artista',
  'ai.refine.kind.discover_track':
    'Descobrir a partir de uma música',
  'ai.refine.failed.title':
    'Não foi possível preparar estas mudanças',
  'ai.refine.failed.hint':
    'Sua playlist atual não mudou.',
  'ai.refine.dismiss':
    'Descartar',
  'ai.refine.clarify.title':
    'Esta mudança precisa de outra tentativa',
  'ai.refine.tryAgain':
    'Tentar outro refinamento',
  'ai.refine.continue':
    'Continuar com a playlist atual',
  'ai.refine.unchanged.title':
    'Nenhuma mudança necessária',
  'ai.refine.unchanged.body':
    'Sua playlist e seus ajustes já atendem a esse pedido, então o Blendify não mudou nada.',
  'ai.refine.clarify.conflicting':
    'Algumas destas mudanças se contradizem. Tente outro refinamento.',
  'ai.refine.clarify.conflictingNamed':
    'Estas mudanças se contradizem entre si ou com as músicas que você está mantendo: {names}.',
  'ai.refine.clarify.conflictingLimit':
    'As músicas que você está mantendo não cabem em uma playlist de {limit} músicas.',
  'ai.refine.clarify.outOfRange':
    'Esta playlist tem {limit} músicas, então o Blendify não pode manter uma música além dessa posição.',
  'ai.refine.clarify.ambiguous':
    'O Blendify precisa de mais detalhes para fazer esta mudança. Informe um número exato de músicas ou minutos, ou o que adicionar, remover ou manter.',
  'ai.refine.clarify.unsupported':
    'O Blendify ainda não consegue fazer esse tipo de mudança. Tente outro refinamento.',
  'ai.refine.clarify.genreExclusion':
    'O Blendify ainda não consegue excluir músicas por gênero de forma confiável, então não mudou sua playlist. Informe artistas ou músicas para deixar de fora, ou escolha os gêneros que você quer.',
  'ai.refine.clarify.unsupportedNamed':
    'O Blendify ainda não consegue fazer estas mudanças: {items}. Tente outro refinamento.',
  'ai.refine.clarify.notARefinement':
    'Isso não parece uma mudança para esta playlist. Diga o que adicionar, remover ou manter.',
  'ai.refine.clarify.mixedSeeds':
    'Uma playlist parte de um tipo de ponto de partida por vez: artistas, músicas ou gêneros. Tente um refinamento que use só um deles.',
  'ai.refine.clarify.ordering':
    'O Blendify não consegue ordenar as músicas desse jeito. Peça a ordem Artista A–Z, Título A–Z ou Aleatório.',
  'ai.refine.clarify.artistNotKept':
    'Não há músicas de {names} na playlist atual para manter.',
  'ai.refine.clarify.singleArtist':
    'Descobrir parte de um único artista. Tente um refinamento que cite só um ou peça um mix.',
  'ai.refine.clarify.singleTrack':
    'Descobrir parte de uma única música. Tente um refinamento que cite só uma.',
  'ai.refine.clarify.tooManyArtists':
    'Um mix pode usar até {limit} artistas e esta mudança usaria {count}. Tente um refinamento com menos artistas.',
  'ai.refine.clarify.tooManyGenres':
    'Um mix pode usar até {limit} gêneros e esta mudança usaria {count}. Tente um refinamento com menos gêneros.',
  'ai.refine.error.inProgress':
    'Esta playlist já está sendo refinada. Aguarde um momento e tente de novo.',
  'ai.refine.error.limit':
    'Esta playlist não pode mais ser refinada. Salve-a assim ou comece de novo.',
  'ai.refine.error.superseded':
    'Esta playlist mudou enquanto o Blendify lia seu refinamento. Tente de novo.',
  'ai.refine.error.unavailable':
    'Esta playlist já foi salva ou transferida, então não pode ser refinada. Comece de novo para criar outra versão.',
  'ai.refine.error.pending':
    'Há outra mudança nesta playlist aguardando sua revisão. Aplique ou descarte antes de refinar de novo.',
  'ai.refine.error.stale':
    'Essa proposta não é mais a atual. O Blendify carregou a versão mais recente da sua playlist.',
  'ai.refine.error.generic':
    'Não foi possível refinar a playlist. Tente de novo.',
  'ai.refine.error.settle':
    'Não foi possível atualizar a playlist. Tente de novo.',
  'runStatus.label':
    'Criação de playlist',
  'runStatus.active.mix':
    'Criando seu Mix',
  'runStatus.active.discover':
    'Criando sua playlist do Discover',
  'runStatus.succeeded.mix':
    'Seu Mix está pronto',
  'runStatus.succeeded.discover':
    'Sua playlist do Discover está pronta',
  'runStatus.failed.mix':
    'Não foi possível criar seu Mix',
  'runStatus.failed.discover':
    'Não foi possível criar sua playlist do Discover',
  'runStatus.uncertain.mix':
    'A conexão caiu ao criar seu Mix',
  'runStatus.uncertain.discover':
    'A conexão caiu ao criar sua playlist do Discover',
  'runStatus.busy.mix':
    'Espere seu Mix terminar antes de criar outra playlist.',
  'runStatus.busy.discover':
    'Espere sua playlist do Discover terminar antes de criar outra playlist.',
  'runStatus.viewProgress':
    'Ver progresso',
  'runStatus.viewPlaylist':
    'Ver playlist',
  'runStatus.viewDetails':
    'Ver detalhes',
  'runStatus.dismiss':
    'Dispensar',
  'create.uncertainTitle':
    'A conexão caiu',
  'create.uncertainLibrary':
    'O Blendify perdeu a conexão antes de confirmar o resultado. A playlist pode já existir, então confira sua biblioteca ou o Spotify antes de criá-la de novo.',
  'create.uncertainSpotify':
    'O Blendify perdeu a conexão antes de confirmar o resultado. A playlist pode já existir, então confira o Spotify antes de criá-la de novo.',
  'create.openLibrary':
    'Abrir biblioteca',
}
