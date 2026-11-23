import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';

// Plugin to serve clean URLs matching Flicx static structure and proxy CDN assets
function flicxCleanUrlsPlugin(): Plugin {
  return {
    name: 'flicx-clean-urls',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // 1. Next.js image optimization proxy directly to CDN
        if (req.url && req.url.startsWith('/_next/image')) {
          try {
            const parsed = new URL(req.url, 'http://localhost');
            const targetUrl = parsed.searchParams.get('url');
            if (targetUrl) {
              const imgRes = await fetch(targetUrl);
              if (imgRes.ok) {
                res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                const buf = Buffer.from(await imgRes.arrayBuffer());
                return res.end(buf);
              }
              // Fallback redirect
              res.writeHead(302, { Location: targetUrl });
              return res.end();
            }
          } catch (e) {
            // pass
          }
        }

        // 1b. API proxy directly to fli.cx (for search, seasons, browse, sources, etc.)
        if (req.url && req.url.startsWith('/api/')) {
          try {
            const apiRes = await fetch(`https://fli.cx${req.url}`, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://fli.cx/'
              },
            });
            const data = await apiRes.text();
            res.setHeader('Content-Type', apiRes.headers.get('content-type') || 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.end(data);
          } catch (e: any) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: e.message }));
          }
        }

        // 1c. Stream proxy for /s/ directly to s.fli.cx
        if (req.url && req.url.startsWith('/s/')) {
          try {
            const streamRes = await fetch(`https://s.fli.cx${req.url}`, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://fli.cx/'
              },
            });
            res.setHeader('Content-Type', streamRes.headers.get('content-type') || 'application/x-mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            const data = Buffer.from(await streamRes.arrayBuffer());
            return res.end(data);
          } catch (e: any) {
            res.statusCode = 500;
            return res.end(e.message);
          }
        }

        const rawUrl = req.url ? req.url.split('?')[0] : '';
        if (rawUrl && !rawUrl.includes('.') && rawUrl !== '/') {
          const publicPath = path.resolve(__dirname, 'public');
          const cleanPath = rawUrl.replace(/^\//, '').replace(/\/$/, '');
          const htmlFile = path.join(publicPath, `${cleanPath}.html`);
          const indexFile = path.join(publicPath, cleanPath, 'index.html');

          if (fs.existsSync(indexFile)) {
            let content = fs.readFileSync(indexFile, 'utf-8');
            if (!content.includes('flicx-interactive.js')) {
              content = content.replace('</body>', '<script src="/flicx-interactive.js"></script></body>');
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.end(content);
          } else if (fs.existsSync(htmlFile)) {
            let content = fs.readFileSync(htmlFile, 'utf-8');
            if (!content.includes('flicx-interactive.js')) {
              content = content.replace('</body>', '<script src="/flicx-interactive.js"></script></body>');
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.end(content);
          } else if (rawUrl.startsWith('/watch/')) {
            // Universal watch fallback template
            const watchTemplate = path.join(publicPath, 'watch', 'heart-of-the-beast-2026', 'index.html');
            if (fs.existsSync(watchTemplate)) {
              let content = fs.readFileSync(watchTemplate, 'utf-8');
              if (!content.includes('flicx-interactive.js')) {
                content = content.replace('</body>', '<script src="/flicx-interactive.js"></script></body>');
              }
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              return res.end(content);
            }
          }

          // 2. On-demand title resolver for any route from fli.cx
          try {
            const fetchResp = await fetch(`https://fli.cx/${cleanPath}`, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              },
            });
            if (fetchResp.ok) {
              let pageHtml = await fetchResp.text();
              // Strip Next.js hydration scripts
              pageHtml = pageHtml.replace(/<script[^>]*src="\/_next\/static\/chunks\/[^"]+"[^>]*><\/script>/g, '');
              pageHtml = pageHtml.replace(/<script[^>]*src="https:\/\/static\.cloudflareinsights\.com\/[^"]+"[^>]*><\/script>/g, '');
              // Inject interactive script
              if (!pageHtml.includes('flicx-interactive.js')) {
                pageHtml = pageHtml.replace('</body>', '<script src="/flicx-interactive.js"></script></body>');
              }

              const outDir = path.join(publicPath, cleanPath);
              fs.mkdirSync(outDir, { recursive: true });
              fs.writeFileSync(path.join(outDir, 'index.html'), pageHtml, 'utf-8');

              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              return res.end(pageHtml);
            }
          } catch {}
        }

        // For root index.html, ensure flicx-interactive.js is included
        if (req.url === '/' || req.url === '/index.html') {
          const rootIndex = path.resolve(__dirname, 'index.html');
          if (fs.existsSync(rootIndex)) {
            let content = fs.readFileSync(rootIndex, 'utf-8');
            if (!content.includes('flicx-interactive.js')) {
              content = content.replace('</body>', '<script src="/flicx-interactive.js"></script></body>');
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.end(content);
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    flicxCleanUrlsPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Flicx - Free Movies & TV Series',
        short_name: 'Flicx',
        description: 'Watch movies and TV series online free',
        theme_color: '#0e1016',
        background_color: '#0e1016',
        display: 'standalone',
        icons: [
          {
            src: '/brand/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/brand/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
