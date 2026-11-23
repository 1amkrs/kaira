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
 * so images load natively on static GitHub Pages without a Node proxy server.
 */
function rewriteNextImageUrls(html) {
  return html.replace(/\/_next\/image\?url=([^&"'\s]+)(?:&amp;|&)[^"'\s)]*/g, (_match, encoded) => {
    try {
      const decoded = decodeURIComponent(encoded);
      if (/^https:\/\/(s\.fli\.cx|fli\.cx|image\.tmdb\.org|i\.ytimg\.com|img\.youtube\.com|m\.media-amazon\.com)\//i.test(decoded)) {
        return decoded;
      }
    } catch {
      // Keep original URL if decoding fails
    }
    return _match;
  });
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
  // Normalize visible branding copy
  out = out.replace(/Popular on Flicx/g, 'Popular on Kaira');
  out = out.replace(/On Flicx since/g, 'On Kaira since');
  out = out.replace(/Watch on Flicx/g, 'Watch on Kaira');
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
      walkHtmlFiles(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

function run() {
  if (!fs.existsSync(distDir)) {
    console.error('[prepare-gh-pages] dist/ directory not found. Run `npm run build` first.');
    process.exit(1);
  }

  // 1. Add .nojekyll so GitHub Pages serves _next/ static CSS & font directories
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '', 'utf-8');

  // 2. Process all HTML files in dist/
  const htmlFiles = walkHtmlFiles(distDir);
  for (const filePath of htmlFiles) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const processed = prepareStaticHtml(raw, basePath);
    fs.writeFileSync(filePath, processed, 'utf-8');
  }

  // 3. Create 404.html SPA fallback for GitHub Pages deep links (/watch/..., /movie/..., /tv/...)
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

  console.log(`[prepare-gh-pages] Prepared ${htmlFiles.length} HTML files, .nojekyll, and 404.html (base="${basePath}")`);
}

run();
