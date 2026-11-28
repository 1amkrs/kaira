const UPSTREAM_ORIGIN = 'https://fli.cx';
const STREAM_CDN_ORIGIN = 'https://s.fli.cx';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function buildCorsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    ...extra,
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: buildCorsHeaders() });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: buildCorsHeaders() });
    }

    const url = new URL(request.url);
    let targetUrl = null;
    let customReferer = `${UPSTREAM_ORIGIN}/`;
    const isStreamCdnPath = /^\/[sfk]\//.test(url.pathname);
    if (url.pathname === '/api/introdb') {
      targetUrl = `https://api.introdb.app/segments${url.search}`;
      customReferer = 'https://introdb.app/';
    } else if (url.pathname.startsWith('/api/')) {
      targetUrl = `${UPSTREAM_ORIGIN}${url.pathname}${url.search}`;
    } else if (isStreamCdnPath) {
      targetUrl = `${STREAM_CDN_ORIGIN}${url.pathname}${url.search}`;
    } else {
      return new Response(JSON.stringify({ ok: true, service: 'kaira-api-proxy' }), {
        status: 200,
        headers: buildCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    const upstreamHeaders = {
      'User-Agent': BROWSER_UA,
      Referer: customReferer,
    };
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) upstreamHeaders.Range = rangeHeader;

    const upstreamRes = await fetch(targetUrl, {
      method: request.method,
      headers: upstreamHeaders,
    });

    const headers = buildCorsHeaders();
    const ct = upstreamRes.headers.get('content-type') || '';
    if (ct) headers['Content-Type'] = ct;
    const cc = upstreamRes.headers.get('cache-control');
    if (cc) headers['Cache-Control'] = cc;
    const cr = upstreamRes.headers.get('content-range');
    if (cr) headers['Content-Range'] = cr;
    const ar = upstreamRes.headers.get('accept-ranges');
    if (ar) headers['Accept-Ranges'] = ar;

    const ctLower = ct.toLowerCase();
    const isPlaylist =
      upstreamRes.ok &&
      request.method === 'GET' &&
      (ctLower.includes('mpegurl') ||
        ctLower.includes('m3u8') ||
        url.pathname.endsWith('.m3u8') ||
        url.pathname.startsWith('/api/s/') ||
        (url.pathname.startsWith('/s/') &&
          !ctLower.startsWith('video/') &&
          !ctLower.startsWith('audio/') &&
          !ctLower.includes('octet-stream')));

    if (isPlaylist) {
      const text = await upstreamRes.text();
      const rewritten = text.includes('#EXTM3U')
        ? text.replace(
            /https?:\/\/s\.fli\.cx\/([sfk])\/([^\s"'<>]+)/gi,
            (_m, seg, rest) => `${url.origin}/${seg.toLowerCase()}/${rest}`
          )
        : text;
      return new Response(rewritten, {
        status: upstreamRes.status,
        headers,
      });
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers,
    });
  },
};
