import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import os from 'os';
import crypto from 'crypto';
import localtunnel from 'localtunnel';

interface NetworkInterfaceInfo {
  name: string;
  ip: string;
  isPrimary: boolean;
}

let activeDevTunnel: any = null;
let activeDevTunnelUrl: string | null = null;

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
    const payloadBuffer = Buffer.from(jsonStr);
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

    const frame = Buffer.concat([header, payloadBuffer]);
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
            const payloadBuffer = Buffer.from(JSON.stringify({ type: 'STATE_UPDATE', payload: latestTVState }));
            const header = Buffer.from([0x81, payloadBuffer.length]);
            socket.write(Buffer.concat([header, payloadBuffer]));
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
                      const snap = Buffer.from(JSON.stringify({ type: 'STATE_UPDATE', payload: latestTVState }));
                      socket.write(Buffer.concat([Buffer.from([0x81, snap.length]), snap]));
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
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          return res.end();
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
              if (activeDevTunnel && activeDevTunnelUrl) {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, url: activeDevTunnelUrl }));
              }
              const tunnel = await localtunnel({ port: 3000 });
              activeDevTunnel = tunnel;
              activeDevTunnelUrl = `${tunnel.url}/?mode=remote`;

              tunnel.on('close', () => {
                activeDevTunnel = null;
                activeDevTunnelUrl = null;
              });
              tunnel.on('error', () => {
                activeDevTunnel = null;
                activeDevTunnelUrl = null;
              });

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, url: activeDevTunnelUrl }));
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
          if (activeDevTunnel) {
            try {
              activeDevTunnel.close();
            } catch (e) {}
            activeDevTunnel = null;
            activeDevTunnelUrl = null;
          }
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
