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
    if (url.pathname.startsWith('/api/')) {
      targetUrl = `${UPSTREAM_ORIGIN}${url.pathname}${url.search}`;
    } else if (url.pathname.startsWith('/s/')) {
      targetUrl = `${STREAM_CDN_ORIGIN}${url.pathname}${url.search}`;
    } else {
      return new Response(JSON.stringify({ ok: true, service: 'kaira-api-proxy' }), {
        status: 200,
        headers: buildCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    const upstreamRes = await fetch(targetUrl, {
      method: request.method,
      headers: {
        'User-Agent': BROWSER_UA,
        Referer: `${UPSTREAM_ORIGIN}/`,
      },
    });

    const headers = buildCorsHeaders();
    const ct = upstreamRes.headers.get('content-type');
    if (ct) headers['Content-Type'] = ct;
    const cc = upstreamRes.headers.get('cache-control');
    if (cc) headers['Cache-Control'] = cc;

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers,
    });
  },
};
