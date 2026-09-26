import type { Locale } from '@/i18n/messages'

export const PRIVACY_POLICY_UPDATED = '2026-09-26'
export const PRIVACY_CONTACT_EMAIL = 'contacto@camilasabino.dev'

export const SPOTIFY_APPS_URL = 'https://www.spotify.com/account/apps/'
export const SPOTIFY_PRIVACY_URL = 'https://www.spotify.com/legal/privacy-policy/'
export const LASTFM_PRIVACY_URL = 'https://www.last.fm/legal/privacy'

const POLICY_DATE_SEPARATOR: Record<Locale, string> = {
  en: '-',
  es: '/',
  pt: '/',
}

export function formatPolicyDate(iso: string, locale: Locale): string {
  const [year, month, day] = iso.split('-')
  const parts = locale === 'en' ? [month, day, year] : [day, month, year]
  return parts.join(POLICY_DATE_SEPARATOR[locale])
}

export type PrivacyBlock = string | readonly string[]

export type PrivacySection = Readonly<{
  title: string
  body: readonly PrivacyBlock[]
}>

export type PrivacyResource = Readonly<{
  label: string
  href: string
}>

export type PrivacyPolicy = Readonly<{
  title: string
  updated: string
  intro: string
  sections: readonly PrivacySection[]
  resources: readonly PrivacyResource[]
  contactLink: string
}>

export const PRIVACY_POLICY: Record<Locale, PrivacyPolicy> = {
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: {date}',
    intro:
      'Blendify helps you discover music and build playlists, using catalog data from Spotify and recommendation data from Last.fm. This page explains what happens to information while you use it: what stays in your browser, what the Blendify server stores, and what is sent to the services Blendify depends on.',
    sections: [
      {
        title: 'Using Blendify without signing in',
        body: [
          'You can search the catalog and generate playlists without connecting a Spotify account. Blendify does not create an account for you, and the playlists you generate this way are not kept as account or database data: they live in your browser tab until you leave or reload the page. Short-lived request counters do exist, and they are described below.',
          'To build them, the Blendify server sends the artist, track and genre names involved to Spotify and Last.fm as ordinary catalog lookups. Those requests carry no identifier for you.',
          'To keep the service available, Blendify counts requests per client. Your IP address is the key for those counters in its cache; each counter expires on its own, at most about ten minutes after the last request it counted, and that cache keeps nothing on disk. Application logs record a short one-way hash of the key rather than the address.',
        ],
      },
      {
        title: 'When you connect Spotify',
        body: [
          'Signing in happens on Spotify’s own authorization screen, so Blendify never sees your Spotify password. Spotify then returns your profile and the tokens for the permissions you approved. From that point Blendify stores:',
          [
            'your Spotify user ID, display name, email address and profile image URL;',
            'the Spotify access token and refresh token, and when the access token expires — kept on the server, never sent to your browser, and used only to call Spotify on your behalf;',
            'the playlists you choose to save to your Blendify library: name, description, tracks, the recipe used to build them and the Spotify link;',
            'usage counters: how many mixes you have created, and which artists and genres you used as seeds and how often.',
          ],
          'Blendify reads the IDs of the playlists in your Spotify account so it can tell which of the playlists it created are still there. It does not read your listening history or your saved tracks, and it does not read the contents of playlists it did not create. When you publish a mix, Blendify writes that playlist — and its cover image, if you add one — to your Spotify account. Playback controls list your active Spotify devices and start playback on the one you pick; those devices are used live and not stored.',
        ],
      },
      {
        title: 'Cookies and browser storage',
        body: [
          [
            'blendify_session — an HttpOnly, Secure cookie set on the Blendify API domain. It holds a signed session token and expires 7 days after you sign in. Logging out clears it.',
            'oauth_state — a cookie that lasts 10 minutes and protects the Spotify sign-in against tampering.',
            'Your language choice and your “save to library” preference are stored by your browser on your device only.',
          ],
          'Blendify sets no advertising cookies and runs no behavioral tracking system of its own. Site usage and page performance are measured through Cloudflare Web Analytics, which does not use cookies for that.',
        ],
      },
      {
        title: 'Services Blendify relies on',
        body: [
          [
            'Spotify — catalog search, sign-in, publishing playlists and playback control. Cover art and profile images load directly from Spotify’s servers.',
            'Last.fm — receives artist, track and genre names to find similar and popular music. No account, session or device information is sent with them.',
            'Soundiiz — used by Guest playlist transfer. When that transfer is available and you choose to start it, Blendify sends Soundiiz the minimum metadata the transfer needs: the playlist title, its description when there is one, and for each track the title, the artists and the ISRC when one is known. You pick the destination service on Soundiiz; Blendify does not choose one for you and starts nothing on its own.',
            'Infrastructure — the site is served through Cloudflare, the API, database and cache run on Railway, and fonts load from Google Fonts. These providers necessarily see the requests your browser and the API make, including IP addresses, and handle them under their own policies. Cloudflare also measures traffic and page performance across this domain with Cloudflare Web Analytics, which records page views and web-performance metrics such as Core Web Vitals. It runs without cookies and is not used to follow individual visitors across unrelated websites.',
          ],
          'Blendify does not sell personal information and does not use it for advertising.',
        ],
      },
      {
        title: 'How long information is kept',
        body: [
          [
            'Your profile, Spotify tokens, saved playlists and usage counters stay until you remove them or delete your account. Blendify does not expire them on a schedule.',
            'Cache entries expire on their own: rate-limit counters within about ten minutes, catalog lookups after 5 to 30 minutes, Last.fm results after up to 7 days. Nothing in that cache is written to disk.',
            'Playlists generated without signing in, playback device lists and transfer links are never written to the database.',
            'Operational logs record the metadata needed to run and diagnose the service, such as which provider operation or URL was called, the resulting status and how long it took; those URLs contain the artist, track and genre names that were looked up. Authentication credentials, session cookie values, Spotify tokens and application secrets are kept out of those logs. Cloudflare and Railway keep their own request logs.',
          ],
        ],
      },
      {
        title: 'Deleting your account and other controls',
        body: [
          'Logging out clears the session cookie in your browser; it does not remove anything stored on the server.',
          [
            'You can remove individual playlists from your Blendify library whenever you want, and reset your usage statistics from the Stats page.',
            'Delete account, in the account menu, asks you to confirm and then deletes your Blendify user record together with your stored Spotify tokens, your saved playlists and your usage data, and ends your session. You do not need to email anyone to do it.',
          ],
          'Deleting your Blendify account does not delete your Spotify account, does not remove playlists already published to Spotify, and does not revoke Blendify’s access inside Spotify — you can remove that access yourself from your Spotify account settings. If you connect the same Spotify account again later, Blendify starts a new, empty account for it.',
          'Database dumps taken before earlier changes are kept outside the running service so it can be restored after a failure. They are not rewritten, so a dump made before you deleted your account can still contain data from that time.',
        ],
      },
      {
        title: 'Security',
        body: [
          'Blendify is served over HTTPS. Spotify tokens stay on the server and are never exposed to the browser, and the session cookie is HttpOnly and Secure. Requests that change data are accepted only when they come from the Blendify site, and the database and cache are reachable only over a private network. No service can promise perfect security; these are the measures in place.',
        ],
      },
      {
        title: 'Changes and contact',
        body: [
          'When this page changes in a way that affects what Blendify does with your information, the date at the top changes with it. Blendify is built and operated by Camila Sabino. For privacy questions, write to {email}.',
        ],
      },
    ],
    resources: [
      { label: 'Manage apps connected to Spotify', href: SPOTIFY_APPS_URL },
      { label: 'Spotify Privacy Policy', href: SPOTIFY_PRIVACY_URL },
      { label: 'Last.fm Privacy Policy', href: LASTFM_PRIVACY_URL },
    ],
    contactLink: 'Email {email}',
  },
  es: {
    title: 'Política de privacidad',
    updated: 'Última actualización: {date}',
    intro:
      'Blendify te ayuda a descubrir música y armar playlists, con datos del catálogo de Spotify y recomendaciones de Last.fm. Esta página explica qué pasa con la información mientras lo usas: qué queda en tu navegador, qué guarda el servidor de Blendify y qué se envía a los servicios de los que depende.',
    sections: [
      {
        title: 'Usar Blendify sin iniciar sesión',
        body: [
          'Puedes buscar en el catálogo y generar playlists sin conectar una cuenta de Spotify. Blendify no te crea una cuenta y las playlists que generas así no se conservan como datos de cuenta ni de base de datos: existen en la pestaña de tu navegador hasta que sales de la página o la recargas. Sí existen contadores de solicitudes de corta duración, descritos más abajo.',
          'Para armarlas, el servidor de Blendify envía a Spotify y a Last.fm los nombres de artistas, canciones y géneros involucrados, como consultas normales de catálogo. Esas consultas no llevan ningún identificador tuyo.',
          'Para mantener el servicio disponible, Blendify cuenta las solicitudes por cliente. Tu dirección IP es la clave de esos contadores en su caché; cada contador expira por sí solo, a más tardar unos diez minutos después de la última solicitud que contó, y esa caché no guarda nada en disco. Los logs de la aplicación registran un hash corto e irreversible de la clave, no la dirección.',
        ],
      },
      {
        title: 'Cuando conectas Spotify',
        body: [
          'El inicio de sesión ocurre en la pantalla de autorización de Spotify, así que Blendify nunca ve tu contraseña. Spotify devuelve entonces tu perfil y los tokens de los permisos que aprobaste. Desde ese momento Blendify guarda:',
          [
            'tu ID de usuario de Spotify, nombre visible, dirección de email y URL de imagen de perfil;',
            'el token de acceso y el token de actualización de Spotify, y cuándo expira el token de acceso: quedan en el servidor, nunca se envían a tu navegador y solo se usan para llamar a Spotify en tu nombre;',
            'las playlists que eliges guardar en tu biblioteca de Blendify: nombre, descripción, canciones, la receta con la que se armaron y el enlace de Spotify;',
            'contadores de uso: cuántas mezclas creaste y qué artistas y géneros usaste como semillas, y con qué frecuencia.',
          ],
          'Blendify lee los IDs de las playlists de tu cuenta de Spotify para saber cuáles de las que creó siguen ahí. No lee tu historial de escucha ni tus canciones guardadas, y no lee el contenido de playlists que no creó. Cuando publicas una mezcla, Blendify escribe esa playlist —y su portada, si agregas una— en tu cuenta de Spotify. Los controles de reproducción listan tus dispositivos activos de Spotify y empiezan la reproducción en el que elijas; esos dispositivos se usan en el momento y no se guardan.',
        ],
      },
      {
        title: 'Cookies y almacenamiento del navegador',
        body: [
          [
            'blendify_session: cookie HttpOnly y Secure en el dominio de la API de Blendify. Contiene un token de sesión firmado y expira 7 días después de iniciar sesión. Cerrar sesión la elimina.',
            'oauth_state: cookie que dura 10 minutos y protege el inicio de sesión con Spotify contra manipulaciones.',
            'Tu idioma y tu preferencia de “guardar en la biblioteca” los almacena tu navegador, solo en tu dispositivo.',
          ],
          'Blendify no usa cookies de publicidad ni un sistema propio de rastreo de comportamiento. El uso del sitio y el rendimiento de las páginas se miden con Cloudflare Web Analytics, que para eso no usa cookies.',
        ],
      },
      {
        title: 'Servicios de los que depende Blendify',
        body: [
          [
            'Spotify: búsqueda en el catálogo, inicio de sesión, publicación de playlists y control de reproducción. Las portadas y las imágenes de perfil se cargan desde servidores de Spotify.',
            'Last.fm: recibe nombres de artistas, canciones y géneros para encontrar música similar y popular. No se envía información de cuenta, sesión ni dispositivos.',
            'Soundiiz: lo usa la transferencia de playlists en modo invitado. Cuando esa transferencia está disponible y eliges iniciarla, Blendify le envía a Soundiiz los metadatos mínimos que necesita: el título de la playlist, su descripción cuando existe y, de cada canción, el título, los artistas y el ISRC cuando se conoce. El servicio de destino lo eliges en Soundiiz; Blendify no lo elige por ti ni inicia nada por su cuenta.',
            'Infraestructura: el sitio se sirve a través de Cloudflare, la API, la base de datos y la caché funcionan en Railway, y las fuentes se cargan desde Google Fonts. Estos proveedores ven necesariamente las solicitudes que hacen tu navegador y la API, incluidas las direcciones IP, y las tratan según sus propias políticas. Cloudflare además mide el tráfico y el rendimiento de las páginas de este dominio con Cloudflare Web Analytics, que registra vistas de página y métricas de rendimiento web como los Core Web Vitals. Funciona sin cookies y no se usa para seguir a visitantes concretos por sitios ajenos.',
          ],
          'Blendify no vende información personal ni la usa para publicidad.',
        ],
      },
      {
        title: 'Cuánto tiempo se conserva la información',
        body: [
          [
            'Tu perfil, los tokens de Spotify, las playlists guardadas y los contadores de uso se conservan hasta que los elimines o elimines tu cuenta. Blendify no los caduca por calendario.',
            'Las entradas de la caché expiran por sí solas: los contadores de límite de uso en unos diez minutos, las consultas de catálogo entre 5 y 30 minutos, los resultados de Last.fm hasta 7 días. Nada de esa caché se escribe en disco.',
            'Las playlists generadas sin iniciar sesión, las listas de dispositivos de reproducción y los enlaces de transferencia nunca se escriben en la base de datos.',
            'Los logs operativos registran los metadatos necesarios para operar y diagnosticar el servicio, como qué operación o URL de proveedor se llamó, el estado resultante y cuánto tardó; esas URLs contienen los nombres de artistas, canciones y géneros consultados. Las credenciales de autenticación, los valores de la cookie de sesión, los tokens de Spotify y los secretos de la aplicación quedan fuera de esos logs. Cloudflare y Railway conservan sus propios logs de solicitudes.',
          ],
        ],
      },
      {
        title: 'Eliminar tu cuenta y otras opciones',
        body: [
          'Cerrar sesión elimina la cookie de sesión de tu navegador; no borra nada de lo guardado en el servidor.',
          [
            'Puedes eliminar playlists de tu biblioteca de Blendify cuando quieras y reiniciar tus estadísticas de uso desde la página de estadísticas.',
            'Eliminar cuenta, en el menú de cuenta, te pide confirmación y luego borra tu registro de usuario de Blendify junto con los tokens de Spotify guardados, tus playlists guardadas y tus datos de uso, y cierra tu sesión. No necesitas escribirle a nadie para hacerlo.',
          ],
          'Eliminar tu cuenta de Blendify no elimina tu cuenta de Spotify, no borra las playlists ya publicadas en Spotify y no revoca el acceso de Blendify dentro de Spotify: ese acceso lo quitas tú desde la configuración de tu cuenta de Spotify. Si vuelves a conectar la misma cuenta de Spotify más adelante, Blendify crea para ella una cuenta nueva y vacía.',
          'Los volcados de la base de datos tomados antes de cambios anteriores se conservan fuera del servicio en funcionamiento para poder restaurarlo tras una falla. No se reescriben, así que un volcado hecho antes de que elimines tu cuenta todavía puede contener datos de ese momento.',
        ],
      },
      {
        title: 'Seguridad',
        body: [
          'Blendify se sirve por HTTPS. Los tokens de Spotify quedan en el servidor y nunca se exponen al navegador, y la cookie de sesión es HttpOnly y Secure. Las solicitudes que modifican datos solo se aceptan si vienen del sitio de Blendify, y la base de datos y la caché solo son accesibles por una red privada. Ningún servicio puede prometer seguridad perfecta; estas son las medidas que hay.',
        ],
      },
      {
        title: 'Cambios y contacto',
        body: [
          'Cuando esta página cambie de una manera que afecte lo que Blendify hace con tu información, la fecha de arriba cambia con ella. Blendify lo construye y lo opera Camila Sabino. Para consultas de privacidad, escribe a {email}.',
        ],
      },
    ],
    resources: [
      { label: 'Gestionar apps conectadas a Spotify', href: SPOTIFY_APPS_URL },
      { label: 'Política de privacidad de Spotify', href: SPOTIFY_PRIVACY_URL },
      { label: 'Política de privacidad de Last.fm', href: LASTFM_PRIVACY_URL },
    ],
    contactLink: 'Escribir a {email}',
  },
  pt: {
    title: 'Política de privacidade',
    updated: 'Última atualização: {date}',
    intro:
      'O Blendify ajuda você a descobrir música e montar playlists, com dados do catálogo do Spotify e recomendações do Last.fm. Esta página explica o que acontece com as informações enquanto você o usa: o que fica no seu navegador, o que o servidor do Blendify armazena e o que é enviado aos serviços dos quais ele depende.',
    sections: [
      {
        title: 'Usar o Blendify sem entrar',
        body: [
          'Você pode pesquisar o catálogo e gerar playlists sem conectar uma conta do Spotify. O Blendify não cria uma conta para você, e as playlists que você gera assim não são guardadas como dados de conta nem de banco de dados: elas existem na aba do seu navegador até você sair da página ou recarregá-la. Contadores de requisições de curta duração existem, sim, e estão descritos abaixo.',
          'Para montá-las, o servidor do Blendify envia ao Spotify e ao Last.fm os nomes de artistas, músicas e gêneros envolvidos, como consultas comuns de catálogo. Essas consultas não levam nenhum identificador seu.',
          'Para manter o serviço disponível, o Blendify conta as requisições por cliente. Seu endereço IP é a chave desses contadores no cache; cada contador expira sozinho, no máximo cerca de dez minutos depois da última requisição que contou, e esse cache não guarda nada em disco. Os logs da aplicação registram um hash curto e irreversível da chave, não o endereço.',
        ],
      },
      {
        title: 'Quando você conecta o Spotify',
        body: [
          'O login acontece na tela de autorização do próprio Spotify, então o Blendify nunca vê sua senha. O Spotify devolve então seu perfil e os tokens das permissões que você aprovou. A partir daí o Blendify armazena:',
          [
            'seu ID de usuário do Spotify, nome de exibição, endereço de e-mail e URL da imagem de perfil;',
            'o token de acesso e o token de atualização do Spotify, e quando o token de acesso expira: ficam no servidor, nunca são enviados ao seu navegador e servem apenas para chamar o Spotify em seu nome;',
            'as playlists que você escolhe salvar na sua biblioteca do Blendify: nome, descrição, músicas, a receita usada para montá-las e o link do Spotify;',
            'contadores de uso: quantas mixagens você criou e quais artistas e gêneros usou como sementes, e com que frequência.',
          ],
          'O Blendify lê os IDs das playlists da sua conta do Spotify para saber quais das que ele criou ainda estão lá. Ele não lê seu histórico de audição nem suas músicas salvas, e não lê o conteúdo de playlists que não criou. Quando você publica uma mixagem, o Blendify grava essa playlist — e a capa, se você adicionar uma — na sua conta do Spotify. Os controles de reprodução listam seus dispositivos ativos do Spotify e iniciam a reprodução no que você escolher; esses dispositivos são usados na hora e não são armazenados.',
        ],
      },
      {
        title: 'Cookies e armazenamento do navegador',
        body: [
          [
            'blendify_session: cookie HttpOnly e Secure no domínio da API do Blendify. Contém um token de sessão assinado e expira 7 dias depois do login. Sair da conta o remove.',
            'oauth_state: cookie que dura 10 minutos e protege o login com o Spotify contra manipulação.',
            'Seu idioma e sua preferência de “salvar na biblioteca” são guardados pelo seu navegador, somente no seu dispositivo.',
          ],
          'O Blendify não usa cookies de publicidade nem um sistema próprio de rastreamento de comportamento. O uso do site e o desempenho das páginas são medidos com o Cloudflare Web Analytics, que para isso não usa cookies.',
        ],
      },
      {
        title: 'Serviços dos quais o Blendify depende',
        body: [
          [
            'Spotify: busca no catálogo, login, publicação de playlists e controle de reprodução. As capas e as imagens de perfil são carregadas dos servidores do Spotify.',
            'Last.fm: recebe nomes de artistas, músicas e gêneros para encontrar música semelhante e popular. Nenhuma informação de conta, sessão ou dispositivo é enviada.',
            'Soundiiz: usado pela transferência de playlists no modo convidado. Quando essa transferência está disponível e você escolhe iniciá-la, o Blendify envia ao Soundiiz os metadados mínimos de que ela precisa: o título da playlist, a descrição quando existe e, de cada música, o título, os artistas e o ISRC quando conhecido. Você escolhe o serviço de destino no Soundiiz; o Blendify não escolhe por você nem inicia nada sozinho.',
            'Infraestrutura: o site é servido pela Cloudflare, a API, o banco de dados e o cache rodam na Railway, e as fontes são carregadas do Google Fonts. Esses provedores necessariamente veem as requisições que seu navegador e a API fazem, incluindo endereços IP, e as tratam conforme as próprias políticas. A Cloudflare também mede o tráfego e o desempenho das páginas deste domínio com o Cloudflare Web Analytics, que registra visualizações de página e métricas de desempenho web como os Core Web Vitals. Funciona sem cookies e não é usado para seguir visitantes específicos por sites não relacionados.',
          ],
          'O Blendify não vende informações pessoais e não as usa para publicidade.',
        ],
      },
      {
        title: 'Por quanto tempo as informações ficam guardadas',
        body: [
          [
            'Seu perfil, os tokens do Spotify, as playlists salvas e os contadores de uso ficam até você removê-los ou excluir sua conta. O Blendify não os expira por calendário.',
            'As entradas do cache expiram sozinhas: os contadores de limite de uso em cerca de dez minutos, as consultas de catálogo entre 5 e 30 minutos, os resultados do Last.fm em até 7 dias. Nada desse cache é gravado em disco.',
            'Playlists geradas sem login, listas de dispositivos de reprodução e links de transferência nunca são gravados no banco de dados.',
            'Os logs operacionais registram os metadados necessários para operar e diagnosticar o serviço, como qual operação ou URL de provedor foi chamada, o status resultante e quanto tempo levou; essas URLs contêm os nomes de artistas, músicas e gêneros consultados. As credenciais de autenticação, os valores do cookie de sessão, os tokens do Spotify e os segredos da aplicação ficam fora desses logs. A Cloudflare e a Railway mantêm os próprios logs de requisições.',
          ],
        ],
      },
      {
        title: 'Excluir sua conta e outras opções',
        body: [
          'Sair da conta remove o cookie de sessão do seu navegador; isso não apaga nada do que está guardado no servidor.',
          [
            'Você pode remover playlists da sua biblioteca do Blendify quando quiser e zerar suas estatísticas de uso na página de estatísticas.',
            'Excluir conta, no menu de conta, pede confirmação e então apaga seu registro de usuário do Blendify junto com os tokens do Spotify guardados, suas playlists salvas e seus dados de uso, e encerra sua sessão. Você não precisa escrever para ninguém para fazer isso.',
          ],
          'Excluir sua conta do Blendify não exclui sua conta do Spotify, não remove as playlists já publicadas no Spotify e não revoga o acesso do Blendify dentro do Spotify: esse acesso você remove nas configurações da sua conta do Spotify. Se você conectar a mesma conta do Spotify novamente mais tarde, o Blendify cria para ela uma conta nova e vazia.',
          'Os dumps do banco de dados feitos antes de mudanças anteriores são mantidos fora do serviço em funcionamento para que ele possa ser restaurado após uma falha. Eles não são reescritos, então um dump feito antes de você excluir sua conta ainda pode conter dados daquele momento.',
        ],
      },
      {
        title: 'Segurança',
        body: [
          'O Blendify é servido por HTTPS. Os tokens do Spotify ficam no servidor e nunca são expostos ao navegador, e o cookie de sessão é HttpOnly e Secure. As requisições que alteram dados só são aceitas quando vêm do site do Blendify, e o banco de dados e o cache só são acessíveis por uma rede privada. Nenhum serviço pode prometer segurança perfeita; estas são as medidas existentes.',
        ],
      },
      {
        title: 'Alterações e contato',
        body: [
          'Quando esta página mudar de forma que afete o que o Blendify faz com suas informações, a data no topo muda junto. O Blendify é construído e operado por Camila Sabino. Para dúvidas de privacidade, escreva para {email}.',
        ],
      },
    ],
    resources: [
      { label: 'Gerenciar apps conectados ao Spotify', href: SPOTIFY_APPS_URL },
      { label: 'Política de privacidade do Spotify', href: SPOTIFY_PRIVACY_URL },
      { label: 'Política de privacidade do Last.fm', href: LASTFM_PRIVACY_URL },
    ],
    contactLink: 'Enviar e-mail para {email}',
  },
}
