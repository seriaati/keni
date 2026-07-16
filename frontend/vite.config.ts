import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function git(cmd: string): string {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

const pkgVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version as string

const commitHash =
  (process.env.COMMIT_HASH || process.env.CF_PAGES_COMMIT_SHA || git('git rev-parse HEAD')).slice(0, 7) || 'dev'
const appVersion = process.env.APP_VERSION || git('git describe --tags --abbrev=0') || `v${pkgVersion}`

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'favicon-96x96.png'],
      manifest: {
        name: 'Keni',
        short_name: 'Keni',
        description: 'A personal finance tracker built for people who want clarity without complexity.',
        theme_color: '#F9F5EC',
        background_color: '#F9F5EC',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            files: [{ name: 'files', accept: ['image/*', 'application/pdf'] }],
          },
        } as never,
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router-dom)/, priority: 30 },
            { name: 'vendor-charts', test: /node_modules[\\/]recharts/, priority: 20 },
            { name: 'vendor-utils', test: /node_modules[\\/](date-fns|lucide-react|clsx)/, priority: 10 },
          ],
        },
      },
    },
  },
})
