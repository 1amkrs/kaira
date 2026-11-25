import fs from 'node:fs';
import path from 'node:path';

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

function applyBasePath(html, base) {
  if (base === '/') return html;
  const prefix = base.slice(0, -1); // e.g. "/kaira"
  let out = html;
  // Prefix root-relative asset and route URLs cleanly (avoid double-prefixing or protocol-relative //)
  out = out.replace(
    /((?:href|src)=["'])\/(?!\/)([^"']*["'])/gi,
    (_m, attrStart, rest) => {
      if (rest.startsWith(prefix.slice(1) + '/')) return attrStart + '/' + rest;
      return `${attrStart}${prefix}/${rest}`;
    }
  );
  // Inject runtime base path config before flicx-interactive.js
  if (!out.includes('__KAIRA_BASE_PATH__')) {
    out = out.replace(
      '</head>',
      `<script>window.__KAIRA_BASE_PATH__=${JSON.stringify(base)};</script></head>`
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
  // Ensure interactive runtime script is injected
  if (!out.includes('flicx-interactive.js')) {
    out = out.replace('</body>', '<script src="/flicx-interactive.js"></script></body>');
  }
  // Rewrite /_next/image proxy URLs to direct upstream image URLs for static hosting
  out = rewriteNextImageUrls(out);
  // Apply project repo subpath if deploying to https://<user>.github.io/<repo>/
  out = applyBasePath(out, base);
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

function buildCatalogIndex() {
  const titles = {};
  const sources = {};

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
        const directSources = (Array.isArray(parsed?.sources) ? parsed.sources : [])
          .filter(s => s && s.name && typeof s.src === 'string' && /^https:\/\//i.test(s.src))
          .map(s => ({
            name: s.name === 'Flicx' ? 'Kaira' : s.name,
            kind: s.kind || 'hls',
            src: s.src,
            quality: s.quality || '4K',
            group: s.group || 'external'
          }));
        if (directSources.length > 0) {
          sources[entry.name] = directSources;
        }
      } catch {
        // Ignore invalid JSON
      }
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

function run() {
  if (!fs.existsSync(distDir)) {
    console.error('[prepare-gh-pages] dist/ directory not found. Run `npm run build` first.');
    process.exit(1);
  }

  // 1. Add .nojekyll so GitHub Pages serves _next/ static CSS & font directories
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '', 'utf-8');

  // 2. Process all HTML files in dist/ (excluding dist/api/ JSON payloads)
  const htmlFiles = walkHtmlFiles(distDir);
  for (const filePath of htmlFiles) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const processed = prepareStaticHtml(raw, basePath);
    fs.writeFileSync(filePath, processed, 'utf-8');
  }

  // 3. Build static catalog-index.json for GitHub Pages zero-backend resolution
  const indexStats = buildCatalogIndex();

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
