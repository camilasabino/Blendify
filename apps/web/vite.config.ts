import path from 'node:path'
import { loadEnv } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { assertProductionApiUrl } from './config/api-url.ts'

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') {
    assertProductionApiUrl(loadEnv(mode, __dirname, 'VITE_').VITE_API_URL)
  }

  return {
    plugins: [react(), tailwindcss()],
    build: {
      assetsInlineLimit: (filePath: string) =>
        filePath.includes('/assets/spotify/') ? false : undefined,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@blendify/contracts': path.resolve(
          __dirname,
          '../../packages/contracts/src/index.ts',
        ),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // Playwright owns browser specs. Vitest owns the QA redaction unit file.
      include: [...configDefaults.include, 'e2e/fixtures/**/*.unit.ts'],
      exclude: [...configDefaults.exclude, 'e2e/**/*.spec.ts', 'e2e/**/*.visual.ts'],
    },
  }
})
