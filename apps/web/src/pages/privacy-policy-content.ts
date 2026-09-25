import type { Locale } from '@/i18n/messages'

export const PRIVACY_POLICY_UPDATED = '2026-09-25'
export const PRIVACY_CONTACT_EMAIL = 'contacto@camilasabino.dev'
export const SPOTIFY_APPS_URL = 'https://www.spotify.com/account/apps/'

export type PrivacySection = Readonly<{
  title: string
  paragraphs: readonly string[]
}>

export type PrivacyPolicy = Readonly<{
  title: string
  updated: string
  intro: string
  sections: readonly PrivacySection[]
  revokeLink: string
  contactLink: string
}>

export const PRIVACY_POLICY: Record<Locale, PrivacyPolicy> = {
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: {date}',
    intro:
      'Blendify is a personal portfolio project by Camila Sabino that builds playlists from Spotify catalog data and Last.fm recommendations. This page describes what Blendify actually stores and shares.',
    sections: [
      {
        title: 'Using Blendify without a Spotify account',
        paragraphs: [
          'You can search the catalog and generate playlists without signing in. Blendify does not create an account for you and does not save those searches or generated playlists; a generated playlist exists only in your browser tab until you leave or refresh the page.',
          'To protect the service from abuse, your IP address is used as a temporary rate-limit key in our cache for at most about ten minutes. Application logs record only a shortened one-way hash of it. Our hosting providers may keep standard request logs.',
        ],
      },
      {
        title: 'Connecting Spotify',
        paragraphs: [
          'When you connect Spotify, Blendify receives your Spotify user ID, display name, email address and profile image, plus an access token and a refresh token for the permissions you approve. The permissions are used only for features you request: creating playlists and uploading their cover, showing your Blendify library, and listing or controlling your playback devices.',
          'The Spotify tokens are stored on the Blendify server in its database. They are never sent to your browser and are used only to call Spotify on your behalf.',
          'Blendify also stores the playlists you create while connected (name, description, tracks, the recipe used to build them and the Spotify link), whether you saved them to your library, and usage counters such as how many mixes you created and which artists or genres you used.',
        ],
      },
      {
        title: 'Cookies and browser storage',
        paragraphs: [
          'blendify_session: an HttpOnly, Secure cookie that keeps you signed in for up to 7 days. oauth_state: a short-lived cookie (10 minutes) that protects the Spotify sign-in. Your browser also stores your language and library-saving preference locally. Blendify uses no analytics or advertising cookies.',
        ],
      },
      {
        title: 'Services Blendify relies on',
        paragraphs: [
          'Spotify provides catalog data, sign-in and playlist publishing; artwork is loaded from Spotify servers. Last.fm receives artist and track names to find similar music. If a transfer to another service through Soundiiz is offered and you use it, Soundiiz receives the playlist title, description and each track’s title, artists and ISRC. The website is served by Cloudflare, fonts are loaded from Google Fonts, and the API, database and cache run on Railway.',
          'Blendify does not sell your data or use it for advertising.',
        ],
      },
      {
        title: 'Your choices',
        paragraphs: [
          'Logging out removes the session cookie from your browser; it does not delete data stored on the server. You can delete playlists from your Blendify library at any time, and you can revoke Blendify’s access to your Spotify account from your Spotify account settings.',
          'To have your Blendify account data deleted (profile, tokens, library and usage data), or for any privacy question, email {email}. For deletion requests, we may ask you to contact us from the email address associated with your Spotify account or otherwise verify that you own the account. Deleting the account removes all of it together, and you will get a confirmation by email.',
        ],
      },
    ],
    revokeLink: 'Manage apps connected to Spotify',
    contactLink: 'Email {email}',
  },
  es: {
    title: 'Política de privacidad',
    updated: 'Última actualización: {date}',
    intro:
      'Blendify es un proyecto personal de portfolio de Camila Sabino que crea playlists a partir de datos del catálogo de Spotify y recomendaciones de Last.fm. Esta página describe qué guarda y comparte Blendify realmente.',
    sections: [
      {
        title: 'Usar Blendify sin una cuenta de Spotify',
        paragraphs: [
          'Puedes buscar en el catálogo y generar playlists sin iniciar sesión. Blendify no te crea una cuenta y no guarda esas búsquedas ni las playlists generadas; una playlist generada existe solo en la pestaña de tu navegador hasta que sales de la página o la recargas.',
          'Para proteger el servicio contra abusos, tu dirección IP se usa como clave temporal de límite de uso en nuestra caché durante unos diez minutos como máximo. Los logs de la aplicación registran solo un hash corto e irreversible. Nuestros proveedores de hosting pueden conservar logs estándar de solicitudes.',
        ],
      },
      {
        title: 'Conectar Spotify',
        paragraphs: [
          'Al conectar Spotify, Blendify recibe tu ID de usuario de Spotify, nombre visible, email e imagen de perfil, además de un token de acceso y un token de actualización para los permisos que apruebas. Los permisos se usan solo para funciones que pides: crear playlists y subir su portada, mostrar tu biblioteca de Blendify y listar o controlar tus dispositivos de reproducción.',
          'Los tokens de Spotify se guardan en la base de datos del servidor de Blendify. Nunca se envían a tu navegador y se usan solo para llamar a Spotify en tu nombre.',
          'Blendify también guarda las playlists que creas con Spotify conectado (nombre, descripción, canciones, la receta usada y el enlace de Spotify), si las guardaste en tu biblioteca, y contadores de uso como cuántas mezclas creaste y qué artistas o géneros usaste.',
        ],
      },
      {
        title: 'Cookies y almacenamiento del navegador',
        paragraphs: [
          'blendify_session: cookie HttpOnly y Secure que mantiene tu sesión hasta 7 días. oauth_state: cookie de corta duración (10 minutos) que protege el inicio de sesión con Spotify. Tu navegador también guarda localmente tu idioma y tu preferencia de guardado en la biblioteca. Blendify no usa cookies de analítica ni de publicidad.',
        ],
      },
      {
        title: 'Servicios que usa Blendify',
        paragraphs: [
          'Spotify provee datos del catálogo, el inicio de sesión y la publicación de playlists; las imágenes se cargan desde servidores de Spotify. Last.fm recibe nombres de artistas y canciones para encontrar música similar. Si se ofrece una transferencia a otro servicio mediante Soundiiz y la usas, Soundiiz recibe el título y la descripción de la playlist y, de cada canción, el título, los artistas y el ISRC. El sitio se sirve desde Cloudflare, las fuentes se cargan desde Google Fonts, y la API, la base de datos y la caché funcionan en Railway.',
          'Blendify no vende tus datos ni los usa para publicidad.',
        ],
      },
      {
        title: 'Tus opciones',
        paragraphs: [
          'Cerrar sesión elimina la cookie de sesión de tu navegador; no borra los datos guardados en el servidor. Puedes eliminar playlists de tu biblioteca de Blendify en cualquier momento y revocar el acceso de Blendify a tu cuenta desde la configuración de tu cuenta de Spotify.',
          'Para que se eliminen los datos de tu cuenta de Blendify (perfil, tokens, biblioteca y datos de uso), o por cualquier consulta de privacidad, escribe a {email}. Para pedidos de eliminación, podemos pedirte que nos escribas desde el email asociado a tu cuenta de Spotify o que verifiques de otra forma que la cuenta es tuya. Eliminar la cuenta borra todo en conjunto y recibirás una confirmación por email.',
        ],
      },
    ],
    revokeLink: 'Gestionar apps conectadas a Spotify',
    contactLink: 'Escribir a {email}',
  },
  pt: {
    title: 'Política de privacidade',
    updated: 'Última atualização: {date}',
    intro:
      'Blendify é um projeto pessoal de portfólio de Camila Sabino que cria playlists a partir de dados do catálogo do Spotify e recomendações do Last.fm. Esta página descreve o que o Blendify realmente armazena e compartilha.',
    sections: [
      {
        title: 'Usar o Blendify sem uma conta do Spotify',
        paragraphs: [
          'Você pode pesquisar o catálogo e gerar playlists sem entrar. O Blendify não cria uma conta para você e não salva essas pesquisas nem as playlists geradas; uma playlist gerada existe só na aba do seu navegador até você sair da página ou recarregá-la.',
          'Para proteger o serviço contra abusos, seu endereço IP é usado como chave temporária de limite de uso no nosso cache por no máximo cerca de dez minutos. Os logs da aplicação registram apenas um hash curto e irreversível. Nossos provedores de hospedagem podem manter logs padrão de requisições.',
        ],
      },
      {
        title: 'Conectar o Spotify',
        paragraphs: [
          'Ao conectar o Spotify, o Blendify recebe seu ID de usuário do Spotify, nome de exibição, e-mail e imagem de perfil, além de um token de acesso e um token de atualização para as permissões que você aprovar. As permissões são usadas apenas para recursos que você solicita: criar playlists e enviar a capa, mostrar sua biblioteca do Blendify e listar ou controlar seus dispositivos de reprodução.',
          'Os tokens do Spotify são armazenados no banco de dados do servidor do Blendify. Eles nunca são enviados ao seu navegador e são usados apenas para chamar o Spotify em seu nome.',
          'O Blendify também armazena as playlists que você cria com o Spotify conectado (nome, descrição, músicas, a receita usada e o link do Spotify), se você as salvou na biblioteca, e contadores de uso, como quantas mixagens você criou e quais artistas ou gêneros usou.',
        ],
      },
      {
        title: 'Cookies e armazenamento do navegador',
        paragraphs: [
          'blendify_session: cookie HttpOnly e Secure que mantém sua sessão por até 7 dias. oauth_state: cookie de curta duração (10 minutos) que protege o login com o Spotify. Seu navegador também armazena localmente o idioma e a preferência de salvar na biblioteca. O Blendify não usa cookies de análise nem de publicidade.',
        ],
      },
      {
        title: 'Serviços usados pelo Blendify',
        paragraphs: [
          'O Spotify fornece dados do catálogo, login e publicação de playlists; as imagens são carregadas dos servidores do Spotify. O Last.fm recebe nomes de artistas e músicas para encontrar músicas semelhantes. Se uma transferência para outro serviço pelo Soundiiz for oferecida e você usá-la, o Soundiiz recebe o título e a descrição da playlist e, de cada música, o título, os artistas e o ISRC. O site é servido pela Cloudflare, as fontes são carregadas do Google Fonts, e a API, o banco de dados e o cache rodam na Railway.',
          'O Blendify não vende seus dados nem os usa para publicidade.',
        ],
      },
      {
        title: 'Suas escolhas',
        paragraphs: [
          'Sair remove o cookie de sessão do seu navegador; isso não apaga os dados armazenados no servidor. Você pode excluir playlists da sua biblioteca do Blendify a qualquer momento e revogar o acesso do Blendify à sua conta nas configurações da sua conta do Spotify.',
          'Para excluir os dados da sua conta do Blendify (perfil, tokens, biblioteca e dados de uso), ou para qualquer dúvida sobre privacidade, envie um e-mail para {email}. Para pedidos de exclusão, podemos pedir que você entre em contato a partir do e-mail associado à sua conta do Spotify ou que confirme de outra forma que a conta é sua. Excluir a conta remove tudo em conjunto, e você receberá uma confirmação por e-mail.',
        ],
      },
    ],
    revokeLink: 'Gerenciar apps conectados ao Spotify',
    contactLink: 'Enviar e-mail para {email}',
  },
}
