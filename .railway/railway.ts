import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  redis,
  service,
} from 'railway/iac'

export default defineRailway(() => {
  const db = postgres('postgres')
  const cache = redis('redis')

  const api = service('api', {
    source: github('camilasabino/Blendify', {
      branch: 'main',
      checkSuites: true,
    }),
    build: {
      builder: 'RAILPACK',
      buildCommand: 'npm run build:api',
      watchPatterns: [
        'apps/api/**',
        'packages/contracts/**',
        'package.json',
        'package-lock.json',
        '.nvmrc',
      ],
    },
    deploy: {
      preDeployCommand: ['npm run prisma:deploy -w @blendify/api'],
      startCommand: 'npm run start:prod -w @blendify/api',
      healthcheckPath: '/api/health',
      healthcheckTimeout: 120,
      numReplicas: 1,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
    },
    env: {
      RAILPACK_NODE_NPM_INSTALL: 'npm ci',
      NODE_ENV: 'production',
      PORT: '8080',
      FRONTEND_URL: 'https://blendify.camilasabino.dev',
      SPOTIFY_REDIRECT_URI:
        'https://api.blendify.camilasabino.dev/api/auth/spotify/callback',
      SPOTIFY_SCOPES:
        'user-read-email user-read-private playlist-read-private playlist-modify-public playlist-modify-private ugc-image-upload user-read-playback-state user-modify-playback-state',
      SPOTIFY_CATALOG_MARKET: 'AR',
      TRUST_PROXY: '1',
      CLIENT_IP_SOURCE: 'railway-x-forwarded-for',
      GUEST_TRANSFER_ENABLED: 'false',
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      SPOTIFY_CLIENT_ID: preserve(),
      SPOTIFY_CLIENT_SECRET: preserve(),
      JWT_SECRET: preserve(),
      LASTFM_API_KEY: preserve(),
    },
  })

  return project('Blendify', { resources: [db, cache, api] })
})
