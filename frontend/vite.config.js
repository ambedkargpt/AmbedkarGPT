import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Open the connection to the API while the JavaScript is still downloading.
 *
 * The first request goes out only once React has mounted and the auth context
 * has run, and it pays for DNS, TCP and TLS before it can even ask - a few
 * hundred milliseconds on a phone, spent in series with everything else. This
 * moves that handshake into the parse, so the request lands on a socket that
 * is already open.
 *
 * The origin is read from VITE_API_URL at build time rather than written here,
 * because it is set by the host, not the repo. No variable, no tag: a
 * preconnect to the wrong place would waste a connection rather than save one.
 */
function preconnectApi(mode) {
  const url = loadEnv(mode, '.', '').VITE_API_URL
  let origin = null
  try {
    origin = url ? new URL(url).origin : null
  } catch {
    origin = null   // a malformed value must not fail the build
  }
  return {
    name: 'preconnect-api',
    transformIndexHtml() {
      if (!origin || origin.startsWith('http://localhost')) return []
      return [
        { tag: 'link', attrs: { rel: 'preconnect', href: origin, crossorigin: '' }, injectTo: 'head-prepend' },
        { tag: 'link', attrs: { rel: 'dns-prefetch', href: origin }, injectTo: 'head-prepend' },
      ]
    },
  }
}

/**
 * Link previews for pages that are shared as links.
 *
 * The app is a single-page shell: every URL is answered with the same
 * index.html, and the page's real title and content are filled in by
 * JavaScript. WhatsApp, Facebook, X, Telegram and LinkedIn do not run
 * JavaScript when they fetch a link to build its preview - they read the tags
 * in the HTML they are served. So a link to /bhimradio, answered with the
 * generic shell, previews as a bare URL with no image.
 *
 * This writes one extra file per shared page, dist/<name>.html: index.html
 * with that page's title, description and image swapped in. vercel.json
 * rewrites the path to it. The page is otherwise identical - same script
 * tags, same root - so a person who opens it gets the normal app and the
 * router takes over exactly as it does from index.html.
 *
 * In dev the same tags are injected into index.html when the URL matches, so
 * a preview can be checked before a build.
 *
 * VITE_SITE_URL overrides the origin; the default is the production host,
 * because a preview image must be an absolute URL and the build has no other
 * way to know where it will be served from.
 */
const SHARE_PAGES = [
  {
    path: '/bhimradio',
    file: 'bhimradio.html',
    title: 'भीम रेडियो · Bhim Radio - AmbedkarGPT',
    description: 'आज का राजनीतिक बुलेटिन, हिंदी में - बिना लॉगिन के सुनिए। '
      + "Today's political bulletin in Hindi. No login needed.",
    image: '/og/bhimradio-v3.jpg',
    imageAlt: 'भीम रेडियो - Bhim Radio, AmbedkarGPT का हिंदी राजनीतिक बुलेटिन',
  },
]

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function shareTags(page, site) {
  const url = site + page.path
  const image = site + page.image
  return [
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="AmbedkarGPT" />',
    '<meta property="og:locale" content="hi_IN" />',
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    '<meta property="og:image:type" content="image/jpeg" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${esc(page.imageAlt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join('\n    ')
}

function withShareTags(html, page, site) {
  // The site-wide description and og/twitter tags in index.html go first, so
  // a crawler reads this page's own (it takes the first og:image it finds).
  const bare = html.replace(/\s*<meta (?:name|property)="(?:description|og:[^"]+|twitter:[^"]+)"[^>]*>/g, '')
  const titled = bare.replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`)
  return titled.replace('</head>', `    ${shareTags(page, site)}\n  </head>`)
}

function sharePages(mode) {
  const site = (loadEnv(mode, '.', '').VITE_SITE_URL || 'https://www.ambedkargpt.in').replace(/\/+$/, '')
  let outDir = 'dist'
  return {
    name: 'share-pages',
    configResolved(config) { outDir = config.build.outDir },
    transformIndexHtml(html, ctx) {
      // Dev only: during a build the pages are written by closeBundle below.
      const page = SHARE_PAGES.find((p) => ctx.originalUrl?.split('?')[0] === p.path)
      return page ? withShareTags(html, page, site) : html
    },
    closeBundle() {
      const index = resolve(outDir, 'index.html')
      if (!existsSync(index)) return
      const base = readFileSync(index, 'utf8')
      for (const page of SHARE_PAGES) {
        writeFileSync(resolve(outDir, page.file), withShareTags(base, page, site))
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    react(),
    preconnectApi(mode),
    sharePages(mode),
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'unsafe-none',
    },
  },

  // Unit tests only. `e2e/` is Playwright's, and its `test.describe` throws
  // when another runner imports it - so the directory has to be named here
  // rather than left to the default glob.
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
    // The radio module reads this at import time, the way Vite inlines every
    // VITE_* value at build time. Set here so `npm test` needs no shell setup
    // and CI does not have to know about it.
    env: { VITE_RADIO_BASE_URL: 'https://radio.example.net' },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Leaflet is deliberately NOT named here. Naming a chunk promotes it
          // into the initial graph, so map-vendor was preloaded on every page
          // even once the map itself was lazy. Left alone, the bundler puts it
          // in the map's own dynamic chunk, which is the point.
          if (id.includes('leaflet')) return undefined;
          if (id.includes('react-router')) return 'react-vendor';
          // Match the package directory, not any path containing "react", so
          // lucide-react and friends are not swept in here too.
          if (/node_modules[\/]react(-dom)?[\/]/.test(id)) return 'react-vendor';
          if (id.includes('lucide-react')) return 'ui-vendor';
          if (id.includes('@react-oauth')) return 'auth-vendor';
          return undefined;
        },
      },
    },
  },
}))
