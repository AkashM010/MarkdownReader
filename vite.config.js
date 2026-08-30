import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      // Icons are already picked up by globPatterns; avoid duplicate precache entries (D25).
      includeManifestIcons: false,
      manifest: {
        name: 'Read Your MD',
        short_name: 'ReadYourMD',
        description:
          'A fast, beautiful Markdown reader and editor with live preview, diagrams, outline navigation, and in-place saving.',
        theme_color: '#0c1120',
        background_color: '#0c1120',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Focus the running app instead of opening a new window per file (D30).
        launch_handler: { client_mode: 'focus-existing' },
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Lets the installed app register as an "Open with" target for .md files.
        file_handlers: [
          {
            action: '/',
            accept: { 'text/markdown': ['.md', '.markdown', '.mdown'], 'text/plain': ['.txt'] },
          },
        ],
      },
      workbox: {
        // Control the page on first install (no reload involved); updates still wait for the banner.
        clientsClaim: true,
        skipWaiting: false,
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // mermaid ships some large lazy chunks; cache them too.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    open: !process.env.NO_OPEN,
  },
  build: {
    target: 'es2020',
  },
});
