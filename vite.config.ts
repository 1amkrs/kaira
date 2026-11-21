import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import localtunnel from 'localtunnel';

interface NetworkInterfaceInfo {
  name: string;
  ip: string;
  isPrimary: boolean;
}

let activeCloudProcess: any = null;
let activeDevTunnelUrl: string | null = null;

async function startCloudTunnel(port: number = 3000): Promise<string | null> {
  if (activeDevTunnelUrl) return activeDevTunnelUrl;

  // 1. Try Cloudflare Quick Tunnel (Fastest, zero splash screen)
  try {
    const cfUrl = await new Promise<string | null>((resolve) => {
      let resolved = false;
      const child = spawn('npx', ['--yes', 'cloudflared', 'tunnel', '--url', `http://localhost:${port}`], {
        shell: true,
      });
      activeCloudProcess = child;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, 15000);

      child.stderr.on('data', (d) => {
        const str = d.toString();
        const match = str.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(match[0]);
        }
      });

      child.on('close', () => {
        activeCloudProcess = null;
        activeDevTunnelUrl = null;
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      });

      child.on('error', () => {
        activeCloudProcess = null;
        activeDevTunnelUrl = null;
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
    });

    if (cfUrl) {
      activeDevTunnelUrl = `${cfUrl}/?mode=remote`;
      return activeDevTunnelUrl;
    }
  } catch (e) {
    console.warn('[Vite Remote] Cloudflare tunnel notice:', e);
  }

  // 2. Fallback to localtunnel
  try {
    const tunnel = await localtunnel({ port });
    activeCloudProcess = tunnel;
    activeDevTunnelUrl = `${tunnel.url}/?mode=remote`;
    tunnel.on('close', () => {
      activeCloudProcess = null;
      activeDevTunnelUrl = null;
    });
    return activeDevTunnelUrl;
  } catch (e) {
    console.warn('[Vite Remote] localtunnel fallback notice:', e);
  }

  return null;
}

function stopCloudTunnel() {
  if (activeCloudProcess) {
    try {
      if (typeof activeCloudProcess.kill === 'function') {
        activeCloudProcess.kill();
      } else if (typeof activeCloudProcess.close === 'function') {
        activeCloudProcess.close();
      }
    } catch (e) {}
    activeCloudProcess = null;
  }
  activeDevTunnelUrl = null;
}

function getNetworkInterfaces(): NetworkInterfaceInfo[] {
  const interfaces = os.networkInterfaces();
  const results: NetworkInterfaceInfo[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    const lower = name.toLowerCase();
    const isVirtual =
      lower.includes('virtual') ||
      lower.includes('vethernet') ||
      lower.includes('wsl') ||
      lower.includes('vmware') ||
      lower.includes('host-only') ||
      lower.includes('loopback') ||
      lower.includes('pseudo');

    for (const addr of addrs || []) {
      if (!addr.internal && addr.family === 'IPv4') {
        // Filter out typical VirtualBox host-only subnets
        if (addr.address.startsWith('192.168.56.') || addr.address.startsWith('169.254.')) {
          continue;
        }

        const isWifiOrEth =
          lower.includes('wi-fi') ||
          lower.includes('wifi') ||
          lower.includes('wireless') ||
          lower.includes('wlan') ||
          lower.includes('ethernet') ||
          lower.includes('en0') ||
          lower.includes('eth0');

        results.push({
          name,
          ip: addr.address,
          isPrimary: !isVirtual && isWifiOrEth,
        });
      }
    }
  }

  // Sort so primary Wi-Fi / LAN comes first
  results.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

  if (results.length === 0) {
    results.push({ name: 'Localhost', ip: '127.0.0.1', isPrimary: true });
  }

  return results;
}

function kairaRemotePlugin(): Plugin {
  let latestTVState: any = null;
  const sseClients = new Set<any>();
  const wsClients = new Set<any>();

  function encodeWebSocketFrame(jsonStr: string): Buffer {
    const payloadBuffer = Buffer.from(jsonStr, 'utf8');
    const length = payloadBuffer.length;
    let header: Buffer;

    if (length < 126) {
      header = Buffer.from([0x81, length]);
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    return Buffer.concat([header, payloadBuffer]);
  }

  function broadcastToAll(message: any) {
    const jsonStr = JSON.stringify(message);

    // 1. Broadcast to SSE clients
    const eventPayload = `data: ${jsonStr}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(eventPayload);
      } catch (e) {
        sseClients.delete(client);
      }
    }

    // 2. Broadcast to WebSocket clients
    const frame = encodeWebSocketFrame(jsonStr);
    for (const client of wsClients) {
      try {
        client.write(frame);
      } catch (e) {
        wsClients.delete(client);
      }
    }
  }

  return {
    name: 'kaira-remote-plugin',
    configureServer(server) {
      // 1. Handle native WebSocket upgrade on port 3000
      if (server.httpServer) {
        server.httpServer.on('upgrade', (req, socket, head) => {
          const url = req.url || '';
          if (!url.startsWith('/ws/remote')) return;

          const key = req.headers['sec-websocket-key'];
          if (!key) {
            socket.destroy();
            return;
          }

          const acceptKey = crypto
            .createHash('sha1')
            .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
            .digest('base64');

          socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
          );

          wsClients.add(socket);

          // Send immediate state update upon connection
          if (latestTVState) {
            socket.write(encodeWebSocketFrame(JSON.stringify({ type: 'STATE_UPDATE', payload: latestTVState })));
          }

          // Handle incoming frames
          let buffer = Buffer.alloc(0);
          socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= 2) {
              const byte0 = buffer[0];
              const byte1 = buffer[1];
              const opcode = byte0 & 0x0f;
              const isMasked = (byte1 & 0x80) !== 0;
              let payloadLength = byte1 & 0x7f;
              let offset = 2;

              if (opcode === 0x08) {
                // Close frame
                wsClients.delete(socket);
                socket.destroy();
                return;
              }

              if (payloadLength === 126) {
                if (buffer.length < 4) break;
                payloadLength = buffer.readUInt16BE(2);
                offset = 4;
              } else if (payloadLength === 127) {
                if (buffer.length < 10) break;
                payloadLength = Number(buffer.readBigUInt64BE(2));
                offset = 10;
              }

              const maskKeyLength = isMasked ? 4 : 0;
              const totalLength = offset + maskKeyLength + payloadLength;
              if (buffer.length < totalLength) break;

              let payload: Buffer;
              if (isMasked) {
                const mask = buffer.slice(offset, offset + 4);
                payload = buffer.slice(offset + 4, totalLength);
                for (let i = 0; i < payload.length; i++) {
                  payload[i] ^= mask[i % 4];
                }
              } else {
                payload = buffer.slice(offset, totalLength);
              }

              buffer = buffer.slice(totalLength);

              if (opcode === 0x01 || opcode === 0x02) {
                try {
                  const text = payload.toString('utf8');
                  const msg = JSON.parse(text);

                  if (msg.type === 'COMMAND' && msg.payload) {
                    // Relay command to TV via all channels
                    broadcastToAll({ type: 'COMMAND', payload: msg.payload });
                    server.ws.send({
                      type: 'custom',
                      event: 'kaira-remote-command',
                      data: msg.payload,
                    });
                  } else if (msg.type === 'STATE_UPDATE' && msg.payload) {
                    latestTVState = msg.payload;
                    broadcastToAll({ type: 'STATE_UPDATE', payload: latestTVState });
                  } else if (msg.type === 'REQUEST_STATE') {
                    if (latestTVState) {
                      socket.write(encodeWebSocketFrame(JSON.stringify({ type: 'STATE_UPDATE', payload: latestTVState })));
                    }
                  }
                } catch (err) {
                  console.warn('[Vite Remote Plugin] JSON decode error:', err);
                }
              }
            }
          });

          socket.on('close', () => wsClients.delete(socket));
          socket.on('error', () => wsClients.delete(socket));
        });
      }

      // 2. HTTP Middlewares
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';

        // Global CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          return res.end();
        }

        // Endpoint: /api/stream-proxy (Direct Stremio HTTP & HLS stream proxy with Range + .m3u8 rewriting)
        if (url.startsWith('/api/stream-proxy')) {
          (async () => {
            try {
              const parsedReq = new URL(url, 'http://localhost:3000');
              const targetRaw = parsedReq.searchParams.get('url') || '';
              const headersRaw = parsedReq.searchParams.get('headers');

              if (!targetRaw) {
                res.statusCode = 400;
                return res.end('Missing url parameter');
              }

              let targetUrl: URL;
              try {
                targetUrl = new URL(targetRaw);
              } catch {
                res.statusCode = 400;
                return res.end('Invalid target url');
              }

              if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
                res.statusCode = 400;
                return res.end('Unsupported protocol');
              }

              // Block loopback & private RFC1918/link-local hosts to prevent SSRF
              const host = targetUrl.hostname.toLowerCase();
              const isPrivateHost =
                host === 'localhost' ||
                host === '::1' ||
                host === '0.0.0.0' ||
                host.endsWith('.local') ||
                /^127\./.test(host) ||
                /^10\./.test(host) ||
                /^192\.168\./.test(host) ||
                /^169\.254\./.test(host) ||
                /^172\.(1[6-9]|2\d|3[01])\./.test(host);

              if (isPrivateHost) {
                res.statusCode = 403;
                return res.end('Private network addresses are not allowed');
              }

              const upstreamHeaders: Record<string, string> = {};
              const allowedHeaderKeys = new Set([
                'referer',
                'origin',
                'user-agent',
                'authorization',
                'cookie',
                'accept',
                'accept-language',
              ]);

              if (headersRaw) {
                try {
                  const parsedHeaders = JSON.parse(headersRaw);
                  if (parsedHeaders && typeof parsedHeaders === 'object') {
                    for (const [k, v] of Object.entries(parsedHeaders)) {
                      if (typeof v === 'string' && allowedHeaderKeys.has(k.toLowerCase())) {
                        upstreamHeaders[k] = v;
                      }
                    }
                  }
                } catch {}
              }

              if (req.headers.range) {
                upstreamHeaders['Range'] = String(req.headers.range);
              }
              if (!Object.keys(upstreamHeaders).some((k) => k.toLowerCase() === 'user-agent')) {
                upstreamHeaders['User-Agent'] =
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
              }

              const controller = new AbortController();
              req.on('close', () => controller.abort());

              const upstream = await fetch(targetUrl.toString(), {
                method: req.method === 'HEAD' ? 'HEAD' : 'GET',
                headers: upstreamHeaders,
                redirect: 'follow',
                signal: controller.signal,
              });

              const contentType = upstream.headers.get('content-type') || '';
              const finalUrl = upstream.url || targetUrl.toString();
              const isM3u8 =
                /mpegurl|x-mpegurl/i.test(contentType) ||
                /\.m3u8(\?|$|#)/i.test(finalUrl);

              if (isM3u8 && req.method !== 'HEAD' && upstream.ok) {
                const playlistText = await upstream.text();
                const base = new URL(finalUrl);
                const encodedHeadersParam = headersRaw ? `&headers=${encodeURIComponent(headersRaw)}` : '';

                const toProxy = (uri: string): string => {
                  const resolved = new URL(uri, base).toString();
                  return `/api/stream-proxy?url=${encodeURIComponent(resolved)}${encodedHeadersParam}`;
                };

                const rewritten = playlistText
                  .split(/\r?\n/)
                  .map((line) => {
                    const trimmed = line.trim();
                    if (!trimmed) return line;
                    if (trimmed.startsWith('#')) {
                      return line.replace(/URI="([^"]+)"/gi, (_m, uri) => {
                        try {
                          return `URI="${toProxy(uri)}"`;
                        } catch {
                          return `URI="${uri}"`;
                        }
                      });
                    }
                    try {
                      return toProxy(trimmed);
                    } catch {
                      return line;
                    }
                  })
                  .join('\n');

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                res.setHeader('Cache-Control', 'no-store');
                return res.end(rewritten);
              }

              // Reject HTML/JSON error pages before piping to <video> so FFmpegDemuxer doesn't choke on markup
              if (/^\s*(text\/html|application\/json)/i.test(contentType)) {
                res.statusCode = upstream.status >= 400 ? upstream.status : 502;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.end(`Upstream returned non-video response (${contentType})`);
              }

              let resolvedContentType = contentType;
              if (!resolvedContentType || /application\/octet-stream/i.test(resolvedContentType)) {
                if (/\.mp4(\?|$|#)/i.test(finalUrl) || /\.m4v(\?|$|#)/i.test(finalUrl)) {
                  resolvedContentType = 'video/mp4';
                } else if (/\.mkv(\?|$|#)/i.test(finalUrl)) {
                  resolvedContentType = 'video/x-matroska';
                } else if (/\.webm(\?|$|#)/i.test(finalUrl)) {
                  resolvedContentType = 'video/webm';
                }
              }

              res.statusCode = upstream.status;
              if (resolvedContentType) res.setHeader('Content-Type', resolvedContentType);
              const contentLength = upstream.headers.get('content-length');
              if (contentLength) res.setHeader('Content-Length', contentLength);
              const contentRange = upstream.headers.get('content-range');
              if (contentRange) res.setHeader('Content-Range', contentRange);
              const acceptRanges = upstream.headers.get('accept-ranges');
              if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

              if (req.method === 'HEAD' || !upstream.body) {
                return res.end();
              }

              const nodeStream = Readable.fromWeb(upstream.body as any);
              nodeStream.on('error', () => {
                if (!res.writableEnded) res.end();
              });
              nodeStream.pipe(res);
            } catch (err: any) {
              if (!res.writableEnded) {
                res.statusCode = 502;
                res.end(`Stream proxy error: ${err?.message || 'Upstream unavailable'}`);
              }
            }
          })();
          return;
        }

        // Endpoint: /api/remote/info (Dynamic Real IP discovery)
        if (url.startsWith('/api/remote/info')) {
          const interfaces = getNetworkInterfaces();
          const primary = interfaces[0] || { ip: '127.0.0.1', name: 'Localhost', isPrimary: true };
          res.setHeader('Content-Type', 'application/json');
          return res.end(
            JSON.stringify({
              ip: primary.ip,
              interfaces,
              port: 3000,
              url: `http://${primary.ip}:3000/?mode=remote`,
              timestamp: Date.now(),
            })
          );
        }

        // Endpoint: /api/remote/tunnel/status
        if (url.startsWith('/api/remote/tunnel/status')) {
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ active: Boolean(activeDevTunnelUrl), url: activeDevTunnelUrl }));
        }

        // Endpoint: /api/remote/tunnel/start (POST)
        if (url.startsWith('/api/remote/tunnel/start') && req.method === 'POST') {
          (async () => {
            try {
              const url = await startCloudTunnel(3000);
              if (url) {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, url }));
              }
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Could not create cloud tunnel' }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          })();
          return;
        }

        // Endpoint: /api/remote/tunnel/stop (POST)
        if (url.startsWith('/api/remote/tunnel/stop') && req.method === 'POST') {
          stopCloudTunnel();
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: true }));
        }

        // Endpoint: /api/remote/status
        if (url.startsWith('/api/remote/status')) {
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(latestTVState || { connected: true, timestamp: Date.now() }));
        }

        // Endpoint: /api/remote/command (POST)
        if (url.startsWith('/api/remote/command') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const cmd = JSON.parse(body);
              const payload = cmd.payload || cmd;

              // Broadcast command to all SSE/WebSocket subscribers and Vite HMR
              broadcastToAll({ type: 'COMMAND', payload });
              server.ws.send({
                type: 'custom',
                event: 'kaira-remote-command',
                data: payload,
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

        // Endpoint: /api/remote/sync-state (POST)
        if (url.startsWith('/api/remote/sync-state') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              latestTVState = JSON.parse(body);
              broadcastToAll({ type: 'STATE_UPDATE', payload: latestTVState });
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (e) {
              res.statusCode = 400;
              res.end();
            }
          });
          return;
        }

        // Endpoint: /api/remote/events (SSE)
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

        // SPA rewrite for /remote to redirect or load
        if (url === '/remote' || url === '/remote/') {
          res.writeHead(302, { Location: '/?mode=remote' });
          return res.end();
        }

        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    kairaRemotePlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
      manifest: {
        id: '/',
        name: 'Kaira TV & Media Center',
        short_name: 'Kaira',
        description: 'Kaira TV OS Launcher and Media Center for Android, Android TV, and Desktop.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['entertainment', 'music', 'video'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
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
