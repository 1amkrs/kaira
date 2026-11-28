import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();
const distDir = path.resolve(rootDir, 'dist');

function normalizeBasePath(raw) {
  if (!raw || raw === '/' || raw === './') return '/';
  let out = String(raw).trim();
  if (!out.startsWith('/')) out = '/' + out;
  if (!out.endsWith('/')) out = out + '/';
  return out;
}

const basePath = normalizeBasePath(process.env.VITE_BASE_PATH || process.env.BASE_PATH || '/');
const apiProxyBase = String(process.env.VITE_API_PROXY_URL || process.env.KAIRA_API_PROXY_URL || '').trim().replace(/\/$/, '');
const interactiveJsPath = path.resolve(process.cwd(), 'public', 'flicx-interactive.js');
const interactiveJsHash = fs.existsSync(interactiveJsPath)
  ? crypto.createHash('sha1').update(fs.readFileSync(interactiveJsPath)).digest('hex').slice(0, 8)
  : Date.now().toString(36);
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Decodes Next.js image proxy URLs (/_next/image?url=...) directly to their upstream HTTPS URLs
 * so hero logos, backdrops, and posters load natively on Firebase Hosting and GitHub Pages without a Node proxy.
 */
function rewriteNextImageUrls(html) {
  return html.replace(
    /\/_next\/image\?url=([^&"'\s\\]+)(?:(?:&amp;|&|\\u0026)[^"'\s,)\\]*)*/g,
    (_match, encoded) => {
      try {
        const decoded = decodeURIComponent(encoded);
        if (/^https:\/\/(s\.fli\.cx|fli\.cx|image\.tmdb\.org|i\.ytimg\.com|img\.youtube\.com|m\.media-amazon\.com)\//i.test(decoded)) {
          return decoded;
        }
      } catch {
        // Keep original URL if decoding fails
      }
      return _match;
    }
  );
}

function injectRuntimeConfig(html, base, proxyBase) {
  let out = html;
  if (base !== '/') {
    const prefix = base.slice(0, -1); // e.g. "/kaira"
    // Prefix root-relative asset and route URLs cleanly (avoid double-prefixing or protocol-relative //)
    out = out.replace(
      /((?:href|src)=["'])\/(?!\/)([^"']*["'])/gi,
      (_m, attrStart, rest) => {
        if (rest.startsWith(prefix.slice(1) + '/')) return attrStart + '/' + rest;
        return `${attrStart}${prefix}/${rest}`;
      }
    );
    if (!out.includes('__KAIRA_BASE_PATH__')) {
      out = out.replace(
        '</head>',
        `<script>window.__KAIRA_BASE_PATH__=${JSON.stringify(base)};</script></head>`
      );
    }
  }
  if (proxyBase && !out.includes('__KAIRA_API_PROXY__')) {
    out = out.replace(
      '</head>',
      `<script>window.__KAIRA_API_PROXY__=${JSON.stringify(proxyBase)};</script></head>`
    );
  }
  return out;
}

function prepareStaticHtml(html, base) {
  let out = html;
  // Remove unused Next.js preload chunk warning
  out = out.replace(
    /<link[^>]*rel=["']preload["'][^>]*href=["']\/_next\/static\/chunks\/3bep5nso12chb\.js["'][^>]*\/?>/gi,
    ''
  );
  // Normalize visible branding copy & social preview assets
  out = out.replace(/Popular on Flicx/g, 'Popular on Kaira');
  out = out.replace(/On Flicx since/g, 'On Kaira since');
  out = out.replace(/Watch on Flicx/g, 'Watch on Kaira');
  out = out.replace(/https:\/\/fli\.cx\/opengraph-image(?:\?[^"'\s<>\\]*)?/gi, '/brand/og-image.png');
  out = out.replace(/<link[^>]*rel=["']alternate["'][^>]*href=["']https:\/\/fli\.cx\/feed\.xml["'][^>]*\/?>/gi, '');
  // Ensure Google AdSense script is included in <head>
  if (!out.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')) {
    out = out.replace(
      '</head>',
      '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9047551447187712" crossorigin="anonymous"></script></head>'
    );
  }
  // Ensure interactive runtime script is injected and cache-busted per build
  if (!out.includes('flicx-interactive.js')) {
    out = out.replace('</body>', `<script src="/flicx-interactive.js?v=${interactiveJsHash}"></script></body>`);
  } else {
    out = out.replace(/\/flicx-interactive\.js(?:\?v=[^"'\s<>]*)?/g, `/flicx-interactive.js?v=${interactiveJsHash}`);
  }
  // Rewrite /_next/image proxy URLs to direct upstream image URLs for static hosting
  out = rewriteNextImageUrls(out);
  // Inject runtime base path and optional API proxy config before flicx-interactive.js
  out = injectRuntimeConfig(out, base, apiProxyBase);
  return out;
}

function walkHtmlFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Never run HTML rewrites on cached JSON files under dist/api/
      if (path.basename(full) === 'api' && path.dirname(full) === distDir) {
        continue;
      }
      walkHtmlFiles(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

function extractTitleMetaFromDetailHtml(html, slug, kind) {
  const idMatch = html.match(/id="rate-(tt\d+)"/) || html.match(/\/(tt\d+)\/img/) || html.match(/"imdbId":"(tt\d+)"/);
  const imdbId = idMatch ? idMatch[1] : null;
  let title = slug.replace(/-\d{4}$/, '').split('-').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  let year = (slug.match(/-(\d{4})$/) || [])[1] || '';
  let description = '';
  let poster = imdbId ? `https://s.fli.cx/a/poster/medium/${imdbId}/img` : '';
  let rating = '';
  let genres = [];

  const ldMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldMatches) {
    const inner = block.replace(/^<script[^>]*>|<\/script>$/gi, '').trim();
    try {
      const data = JSON.parse(inner);
      const node = Array.isArray(data) ? data.find(n => n && (n['@type'] === 'Movie' || n['@type'] === 'TVSeries')) : data;
      if (node && (node['@type'] === 'Movie' || node['@type'] === 'TVSeries')) {
        if (node.name) title = String(node.name);
        if (node.datePublished) year = String(node.datePublished).slice(0, 4);
        if (node.description) description = String(node.description);
        if (typeof node.image === 'string') poster = node.image;
        if (node.aggregateRating && node.aggregateRating.ratingValue) {
          rating = String(node.aggregateRating.ratingValue);
        }
        if (Array.isArray(node.genre)) genres = node.genre.map(String);
        else if (typeof node.genre === 'string') genres = [node.genre];
        break;
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  const trailerIds = Array.from(new Set(
    Array.from(html.matchAll(/\/y\/vi\/([A-Za-z0-9_-]{6,20})\//g)).map(m => m[1])
  ));

  return {
    slug,
    id: imdbId,
    imdbId,
    title,
    year,
    kind,
    poster,
    description,
    rating,
    genres,
    trailerId: trailerIds[0] || null,
    trailers: trailerIds
  };
}

function sanitizeDirectSources(rawSources) {
  const seen = new Set();
  const out = [];
  for (const s of Array.isArray(rawSources) ? rawSources : []) {
    if (!s || !s.name || s.has === false || typeof s.src !== 'string' || !/^https:\/\//i.test(s.src)) continue;
    const name = s.name === 'Flicx' ? 'Kaira' : s.name;
    const key = `${name.toLowerCase()}:${s.kind || 'hls'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      kind: s.kind || 'hls',
      src: s.src,
      quality: s.quality || '4K',
      group: s.group || 'external'
    });
  }
  return out;
}

async function fetchDirectSourcesFromUpstream(imdbId, season, episode) {
  const query = season && episode ? `?s=${season}&e=${episode}` : '';
  const url = `https://fli.cx/api/sources/${encodeURIComponent(imdbId)}${query}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Referer: 'https://fli.cx/' },
      signal: AbortSignal.timeout(8000)
    });
    if (res.status === 429 || res.status === 503) {
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
      continue;
    }
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    return sanitizeDirectSources(data?.sources);
  }
  return [];
}

function collectExtraCatalogImdbIds() {
  const ids = new Set();
  const pages = ['index.html', '4k.html', 'discover.html', 'just-added.html', 'new.html', 'top-rated.html', 'tv/index.html', 'movies/index.html'];
  for (const rel of pages) {
    const filePath = path.join(distDir, rel);
    if (!fs.existsSync(filePath)) continue;
    try {
      const html = fs.readFileSync(filePath, 'utf-8');
      for (const match of html.matchAll(/\b(tt\d{6,})\b/g)) {
        ids.add(match[1]);
      }
    } catch {
      // Ignore unreadable page
    }
  }
  return ids;
}

async function buildCatalogIndex() {
  const titles = {};
  const sources = {};

  // Seed with any previously cached sources so offline builds never lose existing streams
  const existingPublicIndex = path.resolve(rootDir, 'public', 'catalog-index.json');
  if (fs.existsSync(existingPublicIndex)) {
    try {
      const prev = JSON.parse(fs.readFileSync(existingPublicIndex, 'utf-8'));
      if (prev && prev.sources && typeof prev.sources === 'object') {
        for (const [k, v] of Object.entries(prev.sources)) {
          const clean = sanitizeDirectSources(v);
          if (clean.length > 0) sources[k] = clean;
        }
      }
    } catch {
      // Ignore malformed previous index
    }
  }

  for (const [folder, kind] of [['movie', 'movie'], ['tv', 'show']]) {
    const baseFolder = path.join(distDir, folder);
    if (!fs.existsSync(baseFolder)) continue;
    for (const entry of fs.readdirSync(baseFolder, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const htmlPath = path.join(baseFolder, entry.name, 'index.html');
      if (!fs.existsSync(htmlPath)) continue;
      try {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        const meta = extractTitleMetaFromDetailHtml(html, entry.name, kind);
        if (meta.imdbId) {
          const existing = titles[entry.name];
          if (!existing || (!existing.imdbId && meta.imdbId) || (existing.kind !== 'movie' && kind === 'movie')) {
            titles[entry.name] = meta;
          }
        }
      } catch {
        // Skip unreadable detail file
      }
    }
  }

  // Index any cached CORS-safe direct HTTPS HLS sources (e.g. https://s.fli.cx/s/*.m3u8)
  const sourcesRoot = path.join(distDir, 'api', 'sources');
  if (fs.existsSync(sourcesRoot)) {
    for (const entry of fs.readdirSync(sourcesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const jsonPath = path.join(sourcesRoot, entry.name, 'index.html');
      if (!fs.existsSync(jsonPath)) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const directSources = sanitizeDirectSources(parsed?.sources);
        if (directSources.length > 0) {
          sources[entry.name] = directSources;
        }
      } catch {
        // Ignore invalid JSON
      }
    }
  }

  // Hydrate direct HTTPS HLS sources at build time so GitHub Pages & Firebase Hosting
  // serve all star servers (Kaira, Vega, Sirius, Rigel, ...) without needing a backend proxy.
  if (process.env.SKIP_SOURCE_HYDRATION !== '1') {
    const jobs = [];
    const queuedKeys = new Set();
    const queueJob = (cacheKey, imdbId, season, episode) => {
      if (!/^tt\d+$/i.test(imdbId) || queuedKeys.has(cacheKey)) return;
      queuedKeys.add(cacheKey);
      jobs.push({ cacheKey, imdbId, season, episode });
    };

    for (const meta of Object.values(titles)) {
      if (!meta || !meta.imdbId) continue;
      if (meta.kind === 'show') {
        queueJob(`${meta.imdbId}:1:1`, meta.imdbId, 1, 1);
      } else {
        queueJob(meta.imdbId, meta.imdbId);
      }
    }

    for (const extraId of collectExtraCatalogImdbIds()) {
      if (!queuedKeys.has(extraId) && !queuedKeys.has(`${extraId}:1:1`)) {
        queueJob(extraId, extraId);
      }
    }

    const discoveredShows = new Set();
    const CONCURRENCY = 4;
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try {
          let list = await fetchDirectSourcesFromUpstream(job.imdbId, job.season, job.episode);
          // Some catalog IDs in index/discover pages are TV series rather than movies
          if (list.length === 0 && !job.season && !job.episode) {
            const epList = await fetchDirectSourcesFromUpstream(job.imdbId, 1, 1);
            if (epList.length > 0) {
              sources[`${job.imdbId}:1:1`] = epList;
              discoveredShows.add(job.imdbId);
            }
          } else if (list.length > 0) {
            sources[job.cacheKey] = list;
            if (job.season && job.episode) discoveredShows.add(job.imdbId);
          }
        } catch {
          // Keep any previously cached sources on transient upstream failure
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length || 1) }, () => worker()));

    // Also hydrate remaining episodes (up to 24 episodes across S1-S2) for all discovered catalog TV shows
    for (const k of Object.keys(sources)) {
      if (k.includes(':')) discoveredShows.add(k.split(':')[0]);
    }
    if (discoveredShows.size > 0) {
      const epJobs = [];
      await Promise.all(Array.from(discoveredShows).map(async (showImdb) => {
        try {
          const cmRes = await fetch(`https://v3-cinemeta.strem.io/meta/series/${encodeURIComponent(showImdb)}.json`, {
            signal: AbortSignal.timeout(5000)
          });
          if (!cmRes.ok) return;
          const cmData = await cmRes.json().catch(() => null);
          const videos = Array.isArray(cmData?.meta?.videos) ? cmData.meta.videos : [];
          const eps = videos
            .map(v => ({ s: Number(v.season), e: Number(v.episode || v.number) }))
            .filter(v => Number.isFinite(v.s) && v.s >= 1 && v.s <= 2 && Number.isFinite(v.e) && v.e >= 1)
            .sort((a, b) => a.s - b.s || a.e - b.e)
            .slice(0, 24);
          for (const ep of eps) {
            const key = `${showImdb}:${ep.s}:${ep.e}`;
            if (!queuedKeys.has(key)) {
              queuedKeys.add(key);
              epJobs.push({ cacheKey: key, imdbId: showImdb, season: ep.s, episode: ep.e });
            }
          }
        } catch {}
      }));
      let epCursor = 0;
      let epOk = 0;
      let epEmpty = 0;
      let epErr = 0;
      async function epWorker() {
        while (epCursor < epJobs.length) {
          const job = epJobs[epCursor++];
          try {
            const list = await fetchDirectSourcesFromUpstream(job.imdbId, job.season, job.episode);
            if (list.length > 0) {
              sources[job.cacheKey] = list;
              epOk += 1;
            } else {
              epEmpty += 1;
            }
          } catch {
            epErr += 1;
          }
        }
      }
      console.log(`[prepare-gh-pages] Hydrating ${epJobs.length} episodes across ${discoveredShows.size} TV shows...`);
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, epJobs.length || 1) }, () => epWorker()));
      console.log(`[prepare-gh-pages] Episode hydration result: ${epOk} ok, ${epEmpty} empty, ${epErr} errors`);
    }
  }

  const indexPayload = {
    generatedAt: new Date().toISOString(),
    titles,
    sources
  };
  const serializedIndex = JSON.stringify(indexPayload);
  fs.writeFileSync(path.join(distDir, 'catalog-index.json'), serializedIndex, 'utf-8');
  const publicDir = path.resolve(rootDir, 'public');
  if (fs.existsSync(publicDir)) {
    fs.writeFileSync(path.join(publicDir, 'catalog-index.json'), serializedIndex, 'utf-8');
  }
  return { titleCount: Object.keys(titles).length, sourceCount: Object.keys(sources).length };
}

async function run() {
  if (!fs.existsSync(distDir)) {
    console.error('[prepare-gh-pages] dist/ directory not found. Run `npm run build` first.');
    process.exit(1);
  }

  // 1. Add .nojekyll so GitHub Pages serves _next/ static CSS & font directories
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '', 'utf-8');

  // 1b. Rewrite manifest.webmanifest with exact basePath so PWA install works on root & /kaira/
  const manifestPath = path.join(distDir, 'manifest.webmanifest');
  if (fs.existsSync(manifestPath)) {
    try {
      const prefix = basePath === '/' ? '' : basePath.slice(0, -1);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.id = basePath;
      manifest.start_url = basePath;
      manifest.scope = basePath;
      if (Array.isArray(manifest.icons)) {
        manifest.icons = manifest.icons.map((ic) => {
          if (!ic || typeof ic.src !== 'string') return ic;
          const clean = ic.src.startsWith('/') ? ic.src : '/' + ic.src;
          const prefixed = prefix && !clean.startsWith(prefix + '/') ? `${prefix}${clean}` : clean;
          return { ...ic, src: prefixed };
        });
      }
      fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');
    } catch {}
  }

  // 2. Process all HTML files in dist/ (excluding dist/api/ JSON payloads)
  const htmlFiles = walkHtmlFiles(distDir);
  for (const filePath of htmlFiles) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const processed = prepareStaticHtml(raw, basePath);
    fs.writeFileSync(filePath, processed, 'utf-8');
  }

  // 3. Build static catalog-index.json for GitHub Pages & Firebase Hosting
  const indexStats = await buildCatalogIndex();

  // 4. Create 404.html SPA fallback for GitHub Pages deep links (/watch/..., /movie/..., /tv/...)
  const rootIndex = path.join(distDir, 'index.html');
  const watchTemplate = path.join(distDir, 'watch', 'heart-of-the-beast-2026', 'index.html');
  const fallbackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Kaira</title>
  <style>body{margin:0;background:#0a0b10;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100dvh;}</style>
  <script>
    (function () {
      var base = ${JSON.stringify(basePath)};
      var path = window.location.pathname || '/';
      var rel = base !== '/' && path.indexOf(base) === 0 ? '/' + path.slice(base.length) : path;
      if (rel.indexOf('/watch/') === 0) {
        try { sessionStorage.setItem('kaira:gh-redirect', path + window.location.search + window.location.hash); } catch (e) {}
        window.location.replace((base === '/' ? '' : base.slice(0, -1)) + '/watch/heart-of-the-beast-2026/' + window.location.search);
        return;
      }
      try { sessionStorage.setItem('kaira:gh-redirect', path + window.location.search + window.location.hash); } catch (e) {}
      window.location.replace(base);
    })();
  </script>
</head>
<body><noscript><a href="${basePath}" style="color:#fff;">Return to Kaira</a></noscript></body>
</html>`;

  if (fs.existsSync(watchTemplate) || fs.existsSync(rootIndex)) {
    fs.writeFileSync(path.join(distDir, '404.html'), fallbackHtml, 'utf-8');
  }

  console.log(`[prepare-gh-pages] Prepared ${htmlFiles.length} HTML files, catalog-index.json (${indexStats.titleCount} titles, ${indexStats.sourceCount} cached stream sets), .nojekyll, and 404.html (base="${basePath}")`);
}

run();
