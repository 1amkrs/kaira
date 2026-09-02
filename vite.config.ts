import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function kairaRemotePlugin(): Plugin {
  let latestTVState: any = null;
  const sseClients = new Set<any>();

  return {
    name: 'kaira-remote-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          return res.end();
        }

        if (url.startsWith('/api/remote/status')) {
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(latestTVState || { connected: true, timestamp: Date.now() }));
        }

        if (url.startsWith('/api/remote/command') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const cmd = JSON.parse(body);
              // Broadcast command to connected Vite HMR clients
              server.ws.send({
                type: 'custom',
                event: 'kaira-remote-command',
                data: cmd.payload || cmd,
              });
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        if (url.startsWith('/api/remote/sync-state') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              latestTVState = JSON.parse(body);
              const eventPayload = `data: ${JSON.stringify({ type: 'STATE_UPDATE', payload: latestTVState })}\n\n`;
              for (const client of sseClients) {
                try {
                  client.write(eventPayload);
                } catch (e) {
                  sseClients.delete(client);
                }
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (e) {
              res.statusCode = 400;
              res.end();
            }
          });
          return;
        }

        if (url.startsWith('/api/remote/events')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });
          res.write(':\n\n');
          sseClients.add(res);

          if (latestTVState) {
            res.write(`data: ${JSON.stringify({ type: 'STATE_UPDATE', payload: latestTVState })}\n\n`);
          }

          req.on('close', () => {
            sseClients.delete(res);
          });
          return;
        }

        // SPA rewrite for /remote to load index.html
        if (url === '/remote' || url.startsWith('/remote?')) {
          req.url = '/index.html';
        }

        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), kairaRemotePlugin()],
  base: './',
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
