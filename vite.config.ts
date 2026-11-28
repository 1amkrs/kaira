import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  isAllowedImageUrl,
  resolveSafePublicPath,
  extractTitleMetadataFromHtml,
  isValidDetailPageHtml,
  isValidAppPageHtml,
  prepareServedHtml,
} from './src/utils/kairaMiddlewareUtils';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const titleMetaCache = new Map<string, any>();

function createKairaMiddleware(rootDir: string) {
  const publicPath = path.resolve(rootDir, 'public');

  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const reqUrl = req.url || '';

    // 1. Hardened Next.js image proxy with strict host allowlist
    if (reqUrl.startsWith('/_next/image')) {
      try {
        const parsed = new URL(reqUrl, 'http://localhost');
        const targetUrl = parsed.searchParams.get('url');
        if (!targetUrl || !isAllowedImageUrl(targetUrl)) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Image host not allowed' }));
        }
        const imgRes = await fetch(targetUrl, {
          headers: { 'User-Agent': BROWSER_UA, Referer: 'https://fli.cx/' },
        });
        res.statusCode = imgRes.status;
        res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const buf = Buffer.from(await imgRes.arrayBuffer());
        return res.end(buf);
      } catch {
        res.statusCode = 502;
        return res.end('Image fetch failed');
      }
    }

    // 1a. Missing static media/font proxy so Vite SPA fallback never returns HTML for .woff2 fonts
    if (reqUrl.startsWith('/_next/static/media/')) {
      const cleanMediaPath = reqUrl.split('?')[0].replace(/^\//, '');
      const localMedia = resolveSafePublicPath(publicPath, cleanMediaPath.replace(/\./g, ''));
      const rawMediaFile = path.resolve(publicPath, cleanMediaPath);
      if (
        rawMediaFile.startsWith(path.join(publicPath, '_next', 'static', 'media') + path.sep) &&
        !cleanMediaPath.includes('..') &&
        fs.existsSync(rawMediaFile)
      ) {
        return next();
      }
      // Proxy font asset directly from upstream instead of letting SPA fallback serve index.html
      try {
        const fontRes = await fetch(`https://fli.cx/${cleanMediaPath}`, {
          headers: { 'User-Agent': BROWSER_UA, Referer: 'https://fli.cx/' },
        });
        const ct = fontRes.headers.get('content-type') || '';
        if (fontRes.ok && !ct.includes('text/html')) {
          const buf = Buffer.from(await fontRes.arrayBuffer());
          res.statusCode = 200;
          res.setHeader('Content-Type', ct || 'font/woff2');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return res.end(buf);
        }
      } catch {
        // Fall through to clean 404
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      return res.end('Font asset not found');
    }

    // 1a-2. Missing static CSS chunk proxy so Vite SPA fallback never returns HTML for .css chunks
    if (reqUrl.startsWith('/_next/static/chunks/') && reqUrl.split('?')[0].endsWith('.css')) {
      const cleanChunkPath = reqUrl.split('?')[0].replace(/^\//, '');
      const rawChunkFile = path.resolve(publicPath, cleanChunkPath);
      if (
        rawChunkFile.startsWith(path.join(publicPath, '_next', 'static', 'chunks') + path.sep) &&
        !cleanChunkPath.includes('..') &&
        fs.existsSync(rawChunkFile)
      ) {
        return next();
      }
      try {
        const cssRes = await fetch(`https://fli.cx/${cleanChunkPath}`, {
          headers: { 'User-Agent': BROWSER_UA, Referer: 'https://fli.cx/' },
        });
        const ct = cssRes.headers.get('content-type') || '';
        if (cssRes.ok && !ct.includes('text/html')) {
          const buf = Buffer.from(await cssRes.arrayBuffer());
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/css; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return res.end(buf);
        }
      } catch {
        // Fall through to local CSS fallback
      }
      const fallbackCss = path.join(publicPath, '_next', 'static', 'chunks', '1tah4yxtfn-jp.css');
      if (fs.existsSync(fallbackCss)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
        return res.end(fs.readFileSync(fallbackCss));
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      return res.end('/* CSS chunk not found */');
    }

    // 1b. Native /api/title resolver (local cached HTML -> upstream search -> upstream detail HTML)
    if (reqUrl.startsWith('/api/title')) {
      try {
        const parsed = new URL(reqUrl, 'http://localhost');
        const rawSlug = (parsed.searchParams.get('slug') || '').trim().toLowerCase();
        const kindHint = parsed.searchParams.get('kind') === 'show' ? 'show' : 'movie';
        if (!rawSlug || !/^[a-z0-9-]+$/.test(rawSlug)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Invalid slug' }));
        }

        if (titleMetaCache.has(rawSlug)) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(titleMetaCache.get(rawSlug)));
        }

        let resolvedMeta: any = null;

        // Try locally cached detail HTML first (movie or tv)
        const order: Array<'movie' | 'show'> = kindHint === 'show' ? ['show', 'movie'] : ['movie', 'show'];
        for (const k of order) {
          const folder = k === 'show' ? 'tv' : 'movie';
          const safeDir = resolveSafePublicPath(publicPath, `${folder}/${rawSlug}`);
          if (safeDir) {
            const indexPath = path.join(safeDir, 'index.html');
            if (fs.existsSync(indexPath)) {
              const html = fs.readFileSync(indexPath, 'utf-8');
              const meta = extractTitleMetadataFromHtml(html, rawSlug, k);
              if (meta.id) {
                resolvedMeta = meta;
                break;
              }
            }
          }
        }

        // If not resolved locally, search upstream /api/search for exact slug match
        if (!resolvedMeta) {
          const queryWords = rawSlug.replace(/-\d{4}$/, '').replace(/-/g, ' ');
          try {
            const searchRes = await fetch(
              `https://fli.cx/api/search?q=${encodeURIComponent(queryWords)}`,
              { headers: { 'User-Agent': BROWSER_UA, Referer: 'https://fli.cx/' } }
            );
            if (searchRes.ok) {
              const searchJson: any = await searchRes.json();
              const results = Array.isArray(searchJson?.results) ? searchJson.results : [];
              const exact =
                results.find((item: any) => item && item.slug === rawSlug) ||
                results.find((item: any) => item && item.slug && item.slug.startsWith(rawSlug.replace(/-\d{4}$/, '')));
              if (exact && exact.id) {
                resolvedMeta = {
                  slug: exact.slug || rawSlug,
                  id: exact.id,
                  imdbId: exact.id,
                  title: exact.title,
                  year: exact.year ? String(exact.year) : '',
                  kind: exact.kind === 'show' ? 'show' : 'movie',
                  runtime: exact.runtime,
                  genres: exact.genres || [],
                  rating: exact.rating,
                  poster: `https://s.fli.cx/a/poster/medium/${exact.id}/img`,
                  still: exact.still || null,
                  trailerId: null,
                  trailers: [],
                };
              }
            }
          } catch {
            // Continue to HTML fallback
          }
        }

        // Fetch upstream detail page if we still need IMDb ID or trailer IDs
        if (!resolvedMeta || !resolvedMeta.id || !resolvedMeta.trailerId) {
          const tryPaths = resolvedMeta
            ? [resolvedMeta.kind === 'show' ? `tv/${rawSlug}` : `movie/${rawSlug}`]
            : order.map((k) => `${k === 'show' ? 'tv' : 'movie'}/${rawSlug}`);

          for (const rel of tryPaths) {
            try {
              const pageRes = await fetch(`https://fli.cx/${rel}`, {
                headers: { 'User-Agent': BROWSER_UA, Referer: 'https://fli.cx/' },
              });
              if (pageRes.ok) {
                const html = await pageRes.text();
                const parsedHtmlMeta = extractTitleMetadataFromHtml(
                  html,
                  rawSlug,
                  rel.startsWith('tv/') ? 'show' : 'movie'
                );
                if (parsedHtmlMeta.id || parsedHtmlMeta.trailerId) {
                  resolvedMeta = {
                    ...(resolvedMeta || {}),
                    ...parsedHtmlMeta,
                    id: parsedHtmlMeta.id || resolvedMeta?.id || null,
                    imdbId: parsedHtmlMeta.imdbId || resolvedMeta?.imdbId || null,
                    title: resolvedMeta?.title || parsedHtmlMeta.title,
                    year: resolvedMeta?.year || parsedHtmlMeta.year,
                    trailerId: parsedHtmlMeta.trailerId || resolvedMeta?.trailerId || null,
                    trailers: parsedHtmlMeta.trailers?.length
                      ? parsedHtmlMeta.trailers
                      : resolvedMeta?.trailers || [],
                  };
                  break;
                }
              }
            } catch {
              // Try next path
            }
          }
        }

        // Live Cinemeta fallback when slug is a raw IMDb ID (e.g. tt31969600)
        if ((!resolvedMeta || !resolvedMeta.id) && /^tt\d+$/i.test(rawSlug)) {
          for (const cType of kindHint === 'show' ? ['series', 'movie'] : ['movie', 'series']) {
            try {
              const cmRes = await fetch(`https://v3-cinemeta.strem.io/meta/${cType}/${encodeURIComponent(rawSlug)}.json`, {
                headers: { 'User-Agent': BROWSER_UA },
                signal: AbortSignal.timeout(4000),
              });
              if (cmRes.ok) {
                const cmJson: any = await cmRes.json();
                const m = cmJson?.meta;
                if (m && m.imdb_id) {
                  resolvedMeta = {
                    slug: rawSlug,
                    id: m.imdb_id,
                    imdbId: m.imdb_id,
                    title: m.name || rawSlug,
                    year: String(m.releaseInfo || m.year || '').slice(0, 4),
                    kind: cType === 'series' ? 'show' : 'movie',
                    runtime: m.runtime || '',
                    genres: Array.isArray(m.genres) ? m.genres : [],
                    rating: m.imdbRating ? String(m.imdbRating) : '',
                    poster: `https://s.fli.cx/a/poster/medium/${encodeURIComponent(m.imdb_id)}/img`,
                    still: m.background || null,
                    description: m.description || '',
                    trailerId: Array.isArray(m.trailers) && m.trailers[0] ? m.trailers[0].source : null,
                    trailers: [],
                  };
                  break;
                }
              }
            } catch {
              // Try next type
            }
          }
        }

        if (!resolvedMeta || !resolvedMeta.id) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Title not found', slug: rawSlug }));
        }

        if (titleMetaCache.size > 200) {
          const firstKey = titleMetaCache.keys().next().value;
          if (firstKey) titleMetaCache.delete(firstKey);
        }
        titleMetaCache.set(rawSlug, resolvedMeta);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(resolvedMeta));
      } catch (e: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: e?.message || 'Title lookup failed' }));
      }
    }

    // 1b-2. CORS-safe IntroDB proxy (api.introdb.app restricts ACAO to introdb.app)
    if (reqUrl.startsWith('/api/introdb')) {
      try {
        const parsed = new URL(reqUrl, 'http://localhost');
        const imdb = parsed.searchParams.get('imdb_id') || '';
        const s = parsed.searchParams.get('season') || '1';
        const e = parsed.searchParams.get('episode') || '1';
        if (!/^tt\d+$/i.test(imdb)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Invalid imdb_id' }));
        }
        const upstream = await fetch(
          `https://api.introdb.app/segments?imdb_id=${encodeURIComponent(imdb)}&season=${encodeURIComponent(s)}&episode=${encodeURIComponent(e)}`,
          { headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(4000) }
        );
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(buf);
      } catch {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ intro: null }));
      }
    }

    // 1c. Binary-safe, status-preserving API proxy directly to fli.cx
    if (reqUrl.startsWith('/api/')) {
      try {
        const apiRes = await fetch(`https://fli.cx${reqUrl}`, {
          headers: {
            'User-Agent': BROWSER_UA,
            Referer: 'https://fli.cx/',
          },
        });
        const buf = Buffer.from(await apiRes.arrayBuffer());
        res.statusCode = apiRes.status;
        res.setHeader('Content-Type', apiRes.headers.get('content-type') || 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(buf);
      } catch (e: any) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: e?.message || 'Upstream API error' }));
      }
    }

    // 1d. Status-preserving stream proxy for /s/ directly to s.fli.cx
    if (reqUrl.startsWith('/s/')) {
      try {
        const streamRes = await fetch(`https://s.fli.cx${reqUrl}`, {
          headers: {
            'User-Agent': BROWSER_UA,
            Referer: 'https://fli.cx/',
          },
        });
        res.statusCode = streamRes.status;
        res.setHeader('Content-Type', streamRes.headers.get('content-type') || 'application/x-mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        const data = Buffer.from(await streamRes.arrayBuffer());
        return res.end(data);
      } catch (e: any) {
        res.statusCode = 502;
        return res.end(e?.message || 'Stream proxy error');
      }
    }

    // 2. Clean URL HTML resolution with strict path confinement
    const rawUrl = reqUrl.split('?')[0];
    if (rawUrl === '/top-rated' || rawUrl === '/top-rated/') {
      res.statusCode = 302;
      res.setHeader('Location', '/discover?sort=rating');
      return res.end();
    }
    if (rawUrl === '/new' || rawUrl === '/new/') {
      res.statusCode = 302;
      res.setHeader('Location', '/just-added');
      return res.end();
    }
    if (rawUrl && !rawUrl.includes('.') && rawUrl !== '/') {
      const cleanPath = rawUrl.replace(/^\//, '').replace(/\/$/, '');
      const safeTargetDir = resolveSafePublicPath(publicPath, cleanPath);
      const safeHtmlFile = resolveSafePublicPath(publicPath, `${cleanPath}.html`);

      const detailRouteMatch = cleanPath.match(/^(movie|tv)\/([^/]+)$/);
      const isDetailRoute = Boolean(detailRouteMatch);

      if (safeTargetDir) {
        const indexFile = path.join(safeTargetDir, 'index.html');
        if (fs.existsSync(indexFile)) {
          const rawFile = fs.readFileSync(indexFile, 'utf-8');
          if (isValidAppPageHtml(rawFile, cleanPath)) {
            const content = prepareServedHtml(rawFile);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.end(content);
          }
        }
      }

      if (safeHtmlFile && fs.existsSync(safeHtmlFile)) {
        const rawFile = fs.readFileSync(safeHtmlFile, 'utf-8');
        if (isValidAppPageHtml(rawFile, cleanPath)) {
          const content = prepareServedHtml(rawFile);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(content);
        }
      }

      if (rawUrl.startsWith('/watch/')) {
        const watchTemplate = path.join(publicPath, 'watch', 'heart-of-the-beast-2026', 'index.html');
        if (fs.existsSync(watchTemplate)) {
          const content = prepareServedHtml(fs.readFileSync(watchTemplate, 'utf-8'));
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(content);
        }
      }

      // On-demand title resolver from fli.cx (only for validated safe route segments)
      if (safeTargetDir) {
        const candidatePaths = detailRouteMatch
          ? [
              cleanPath,
              `${detailRouteMatch[1] === 'movie' ? 'tv' : 'movie'}/${detailRouteMatch[2]}`,
            ]
          : [cleanPath];

        for (const candidate of candidatePaths) {
          try {
            const fetchResp = await fetch(`https://fli.cx/${candidate}`, {
              headers: { 'User-Agent': BROWSER_UA },
            });
            if (fetchResp.ok) {
              let pageHtml = await fetchResp.text();
              if (!isValidAppPageHtml(pageHtml, cleanPath)) {
                continue;
              }
              pageHtml = pageHtml.replace(/<script[^>]*src="\/_next\/static\/chunks\/[^"]+"[^>]*><\/script>/g, '');
              pageHtml = pageHtml.replace(/<script[^>]*src="https:\/\/static\.cloudflareinsights\.com\/[^"]+"[^>]*><\/script>/g, '');
              pageHtml = prepareServedHtml(pageHtml);

              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              return res.end(pageHtml);
            }
          } catch {
            // Try next candidate or fall through
          }
        }
      }
    }

    // 3. Root index.html
    if (rawUrl === '/' || rawUrl === '/index.html') {
      const rootIndex = path.resolve(rootDir, 'index.html');
      if (fs.existsSync(rootIndex)) {
        const content = prepareServedHtml(fs.readFileSync(rootIndex, 'utf-8'));
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(content);
      }
    }

    next();
  };
}

// Plugin to serve clean URLs matching Kaira static structure and proxy CDN assets
function flicxCleanUrlsPlugin(): Plugin {
  const middleware = createKairaMiddleware(__dirname);
  return {
    name: 'flicx-clean-urls',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    flicxCleanUrlsPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'brand/icon-192.png', 'brand/icon-512.png', 'brand/maskable-512.png'],
      workbox: {
        globPatterns: ['brand/og-image.png', 'brand/icon-192.png', 'brand/icon-512.png', 'brand/maskable-512.png'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 3000,
    strictPort: true,
  },
});
