// Kaira Interactive Experience Engine
(function() {
  // --- 0. Safe Escaping, URL & Toast Utilities ---
  function escapeHtml(val) {
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(val) {
    return escapeHtml(val);
  }

  function safeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (/^https:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
      return trimmed;
    }
    return '';
  }

  function safeColor(color, fallback) {
    if (typeof color === 'string' && /^(#[0-9a-fA-F]{3,8}|oklch\([^)]+\)|hsl\([^)]+\)|rgb\([^)]+\))$/.test(color.trim())) {
      return color.trim();
    }
    return fallback || '#5d341e';
  }

  function getBasePrefix() {
    if (typeof window.__KAIRA_BASE_PATH__ === 'string' && window.__KAIRA_BASE_PATH__ !== '/') {
      return window.__KAIRA_BASE_PATH__.replace(/\/$/, '');
    }
    return '';
  }

  function withBasePath(rawPath) {
    const p = String(rawPath || '/');
    if (/^(https?:|mailto:|tel:|#|javascript:)/i.test(p)) return p;
    const prefix = getBasePrefix();
    const normalized = p.startsWith('/') ? p : '/' + p;
    if (!prefix) return normalized;
    if (normalized === prefix || normalized.startsWith(prefix + '/')) return normalized;
    return prefix + normalized;
  }

  function getApiProxyBase() {
    let raw = '';
    if (typeof window.__KAIRA_API_PROXY__ === 'string' && window.__KAIRA_API_PROXY__.trim()) {
      raw = window.__KAIRA_API_PROXY__.trim();
    } else {
      try {
        raw = (localStorage.getItem('kaira:api-proxy') || '').trim();
      } catch {}
    }
    if (!raw || !/^https?:\/\//i.test(raw)) return '';
    return raw.replace(/\/+$/, '');
  }

  async function fetchApiJsonWithMeta(apiPath) {
    const cleanPath = String(apiPath || '').startsWith('/') ? String(apiPath) : `/${apiPath}`;
    const proxyBase = getApiProxyBase();
    const candidates = [{ url: cleanPath, usedProxy: false }];
    if (proxyBase) {
      candidates.push({ url: `${proxyBase}${cleanPath}`, usedProxy: true });
    }

    for (const candidate of candidates) {
      try {
        const res = await fetch(candidate.url);
        if (!res.ok) continue;
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const text = await res.text();
        const trimmed = text.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue;
        const data = JSON.parse(trimmed);
        return { data, ct, usedProxy: candidate.usedProxy, proxyBase };
      } catch {
        // Try next candidate
      }
    }
    return null;
  }

  function normalizeWatchSlug(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const prefix = getBasePrefix();
    let cleaned = raw.split('?')[0].split('#')[0];
    if (prefix && cleaned.startsWith(prefix + '/')) {
      cleaned = cleaned.slice(prefix.length);
    }
    return cleaned
      .replace(/^\/(movie|tv|watch|anime)\//, '')
      .replace(/\/s\d+e\d+.*$/i, '')
      .replace(/\/$/, '')
      .trim();
  }

  function decodeNextProxyImageUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.includes('/_next/image')) return rawUrl;
    return rawUrl.replace(
      /\/_next\/image\?url=([^&"'\s\\]+)(?:(?:&amp;|&|\\u0026)[^"'\s,)\\]*)*/g,
      (match, encoded) => {
        try {
          const decoded = decodeURIComponent(encoded);
          if (/^https:\/\/(s\.fli\.cx|fli\.cx|image\.tmdb\.org|i\.ytimg\.com|img\.youtube\.com|m\.media-amazon\.com)\//i.test(decoded)) {
            return decoded;
          }
        } catch {}
        return match;
      }
    );
  }

  function rewriteProxyImagesInDom(root) {
    const scope = root || document;
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll('img[src*="/_next/image"], img[srcset*="/_next/image"]').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const srcset = img.getAttribute('srcset') || '';
      const nextSrc = decodeNextProxyImageUrl(src);
      const nextSrcset = decodeNextProxyImageUrl(srcset);
      if (nextSrc && nextSrc !== src) img.setAttribute('src', nextSrc);
      if (nextSrcset && nextSrcset !== srcset) img.setAttribute('srcset', nextSrcset);
      if (img.hasAttribute('data-failed')) {
        img.removeAttribute('data-failed');
      }
    });
    scope.querySelectorAll('source[srcset*="/_next/image"]').forEach((source) => {
      const srcset = source.getAttribute('srcset') || '';
      const nextSrcset = decodeNextProxyImageUrl(srcset);
      if (nextSrcset && nextSrcset !== srcset) source.setAttribute('srcset', nextSrcset);
    });
  }

  // --- 0b. Subtitle Parser (WebVTT + SRT) & Static / GitHub Pages Resolvers ---
  function parseSubtitleTimestamp(raw) {
    const cleaned = String(raw || '').trim().replace(',', '.');
    const match = cleaned.match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
    if (!match) return NaN;
    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const msStr = (match[4] || '0').padEnd(3, '0').slice(0, 3);
    const ms = parseInt(msStr, 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(ms)) return NaN;
    return hours * 3600 + minutes * 60 + seconds + ms / 1000;
  }

  function cleanCueText(rawText) {
    return String(rawText || '')
      .replace(/\{\\[^}]+\}/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[^>]+>/g, '')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&nbsp;/gi, ' ')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  function parseSubtitleText(raw) {
    if (!raw || typeof raw !== 'string') return [];
    const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const blocks = normalized.split(/\n{2,}/);
    const cues = [];
    for (let i = 0; i < blocks.length; i++) {
      const lines = blocks[i].split('\n').map(l => l.trimEnd()).filter(l => l.trim().length > 0);
      if (lines.length === 0) continue;
      const firstTrimmed = lines[0].trim();
      if (/^(WEBVTT|NOTE|STYLE|REGION)\b/i.test(firstTrimmed)) continue;
      const timingIdx = lines.findIndex(line => line.includes('-->'));
      if (timingIdx === -1) continue;
      const parts = lines[timingIdx].trim().split('-->');
      if (parts.length < 2) continue;
      const start = parseSubtitleTimestamp(parts[0].trim().split(/\s+/)[0]);
      const end = parseSubtitleTimestamp(parts[1].trim().split(/\s+/)[0]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const text = cleanCueText(lines.slice(timingIdx + 1).join('\n'));
      if (!text) continue;
      cues.push({ start, end, text });
    }
    cues.sort((a, b) => a.start - b.start || a.end - b.end);
    return cues;
  }

  function getActiveSubtitleText(cues, currentTime) {
    if (!Array.isArray(cues) || cues.length === 0 || !Number.isFinite(currentTime) || currentTime < 0) return '';
    const active = [];
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      if (cue.start > currentTime) break;
      if (currentTime >= cue.start && currentTime <= cue.end) active.push(cue.text);
    }
    return active.join('\n');
  }

  function buildEmbedFallbackServers(imdbId, isShow, seasonNum, episodeNum) {
    const cleanImdb = String(imdbId || '').trim();
    if (!/^tt\d+$/i.test(cleanImdb)) return [];
    const s = Math.max(1, Number(seasonNum) || 1);
    const e = Math.max(1, Number(episodeNum) || 1);
    if (isShow) {
      return [
        { name: '2Embed', kind: 'embed', src: `https://www.2embed.cc/embedtv/${encodeURIComponent(cleanImdb)}?s=${s}&e=${e}`, quality: 'HD', group: 'embed' }
      ];
    }
    return [
      { name: '2Embed', kind: 'embed', src: `https://www.2embed.cc/embed/${encodeURIComponent(cleanImdb)}`, quality: 'HD', group: 'embed' }
    ];
  }

  function isPublicHttpStreamUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return false;
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('/') || trimmed.startsWith('data:')) return false;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
      const host = parsed.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function inferCastContentType(rawUrl) {
    const lower = String(rawUrl || '').toLowerCase().split('?')[0].split('#')[0];
    if (lower.includes('.m3u8')) return 'application/x-mpegurl';
    if (lower.includes('.mpd')) return 'application/dash+xml';
    if (lower.endsWith('.webm')) return 'video/webm';
    return 'video/mp4';
  }

  function pickCastableStreamSource(servers, currentServer) {
    if (currentServer && currentServer.kind !== 'embed' && isPublicHttpStreamUrl(currentServer.src)) {
      const url = currentServer.src.trim();
      return { kind: 'direct', server: currentServer, url, contentType: inferCastContentType(url) };
    }
    const rankQ = (q) => {
      const u = String(q || '').toUpperCase();
      if (u.includes('4K') || u.includes('2160')) return 4;
      if (u.includes('1080')) return 3;
      if (u.includes('720')) return 2;
      if (u.includes('HD')) return 1;
      return 0;
    };
    const directPublic = (Array.isArray(servers) ? servers : [])
      .filter(s => s && s.kind !== 'embed' && isPublicHttpStreamUrl(s.src))
      .sort((a, b) => rankQ(b.quality) - rankQ(a.quality));
    if (directPublic.length > 0) {
      const best = directPublic[0];
      const url = best.src.trim();
      return { kind: 'direct', server: best, url, contentType: inferCastContentType(url) };
    }
    return {
      kind: 'embed-only',
      server: currentServer || (Array.isArray(servers) && servers[0]) || null,
      url: null,
      contentType: null
    };
  }

  function buildExternalPlayerLinks(streamUrl) {
    if (!streamUrl || !isPublicHttpStreamUrl(streamUrl)) {
      return { vlcUrl: null, infuseUrl: null };
    }
    const clean = streamUrl.trim();
    return {
      vlcUrl: `vlc://${clean}`,
      infuseUrl: `infuse://x-callback-url/play?url=${encodeURIComponent(clean)}`
    };
  }

  function parsePersonRouteToSearchQuery(pathname) {
    const clean = String(pathname || '').split('?')[0].split('#')[0];
    const match = clean.match(/\/person\/(?:\d+-)?([a-z0-9-]+)\/?$/i);
    if (!match) return null;
    const words = match[1].split('-').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1));
    return words.length > 0 ? words.join(' ') : null;
  }

  let googleCastSdkPromise = null;
  let googleCastInitialized = false;
  function initGoogleCastContextIfReady() {
    try {
      if (window.cast && window.cast.framework && window.chrome && window.chrome.cast) {
        if (!googleCastInitialized) {
          const ctx = window.cast.framework.CastContext.getInstance();
          ctx.setOptions({
            receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
            autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
          });
          googleCastInitialized = true;
        }
        return true;
      }
    } catch {}
    return false;
  }

  function ensureGoogleCastSdkLoaded() {
    if (initGoogleCastContextIfReady()) return Promise.resolve(true);
    if (googleCastSdkPromise) return googleCastSdkPromise;
    googleCastSdkPromise = new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        resolve(Boolean(ok));
      };
      const prevCb = window.__onGCastApiAvailable;
      window.__onGCastApiAvailable = (isAvailable) => {
        if (typeof prevCb === 'function') {
          try { prevCb(isAvailable); } catch {}
        }
        if (isAvailable) {
          done(initGoogleCastContextIfReady());
        } else {
          done(false);
        }
      };
      if (!document.querySelector('script[data-kaira-cast-sdk="1"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
        s.async = true;
        s.setAttribute('data-kaira-cast-sdk', '1');
        s.onerror = () => done(false);
        document.head.appendChild(s);
      }
      setTimeout(() => done(initGoogleCastContextIfReady()), 3500);
    });
    return googleCastSdkPromise;
  }

  let staticCatalogIndexPromise = null;
  function fetchStaticCatalogIndex() {
    if (!staticCatalogIndexPromise) {
      staticCatalogIndexPromise = fetch(withBasePath('/catalog-index.json'))
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    return staticCatalogIndexPromise;
  }

  function parseDetailHtmlMetadata(html, slug, kind) {
    if (!html || typeof html !== 'string') return null;
    if (html.includes('id="__next_error__"') || html.includes('hero-switch') || !/<article[\s>]/i.test(html)) {
      return null;
    }
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
          if (node.aggregateRating && node.aggregateRating.ratingValue) rating = String(node.aggregateRating.ratingValue);
          if (Array.isArray(node.genre)) genres = node.genre.map(String);
          else if (typeof node.genre === 'string') genres = [node.genre];
          break;
        }
      } catch {}
    }

    const trailerIds = Array.from(new Set(Array.from(html.matchAll(/\/y\/vi\/([A-Za-z0-9_-]{6,20})\//g)).map(m => m[1])));
    if (!imdbId && !description && trailerIds.length === 0) return null;
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

  function makeSlugFromTitleYear(name, year) {
    const base = String(name || '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const cleanYear = String(year || '').match(/\d{4}/)?.[0] || '';
    return cleanYear ? `${base}-${cleanYear}` : base;
  }

  async function resolveTitleMeta(slug, preferredKind) {
    const cleanSlug = normalizeWatchSlug(slug);
    if (!cleanSlug) return null;
    const kindHint = preferredKind === 'show' || preferredKind === 'tv' ? 'show' : (preferredKind === 'movie' ? 'movie' : '');

    // 1. Try local Vite backend or configured CORS API proxy first
    try {
      const apiPath = `/api/title?slug=${encodeURIComponent(cleanSlug)}${kindHint ? `&kind=${encodeURIComponent(kindHint)}` : ''}`;
      const apiResult = await fetchApiJsonWithMeta(apiPath);
      const data = apiResult && apiResult.data;
      if (data && (data.imdbId || data.id || data.title)) return data;
    } catch {}

    // 2. Try static build-time catalog-index.json (instant on GitHub Pages)
    const idx = await fetchStaticCatalogIndex();
    if (idx && idx.titles && idx.titles[cleanSlug] && (idx.titles[cleanSlug].imdbId || idx.titles[cleanSlug].id)) {
      return idx.titles[cleanSlug];
    }

    // 3. Try fetching & parsing the static detail HTML page directly
    const tryFolders = kindHint === 'show' ? [['tv', 'show'], ['movie', 'movie']] : [['movie', 'movie'], ['tv', 'show']];
    for (const [folder, kind] of tryFolders) {
      try {
        const res = await fetch(withBasePath(`/${folder}/${encodeURIComponent(cleanSlug)}/`));
        if (res.ok) {
          const html = await res.text();
          const parsed = parseDetailHtmlMetadata(html, cleanSlug, kind);
          if (parsed && (parsed.imdbId || parsed.id)) return parsed;
        }
      } catch {}
    }

    // 4. Live CORS fallback via Cinemeta Stremio API (resolves ANY movie/series IMDb ID on GitHub Pages)
    try {
      const yearMatch = cleanSlug.match(/-(\d{4})$/);
      const targetYear = yearMatch ? yearMatch[1] : '';
      const queryTitle = cleanSlug.replace(/-\d{4}$/, '').replace(/-/g, ' ').trim();
      if (!queryTitle) return null;

      // Direct IMDb ID slug support (e.g. /watch/tt33764258)
      if (/^tt\d+$/i.test(cleanSlug)) {
        const types = kindHint === 'show' ? ['series', 'movie'] : ['movie', 'series'];
        for (const t of types) {
          const r = await fetch(`https://v3-cinemeta.strem.io/meta/${t}/${encodeURIComponent(cleanSlug)}.json`).catch(() => null);
          const d = r && r.ok ? await r.json().catch(() => null) : null;
          if (d && d.meta && d.meta.imdb_id) {
            const m = d.meta;
            return {
              slug: cleanSlug,
              id: m.imdb_id,
              imdbId: m.imdb_id,
              title: m.name || cleanSlug,
              year: String(m.releaseInfo || m.year || '').slice(0, 4),
              kind: t === 'series' ? 'show' : 'movie',
              poster: m.poster || '',
              still: m.background || '',
              logo: m.logo || '',
              runtime: m.runtime || '',
              description: m.description || '',
              rating: m.imdbRating ? String(m.imdbRating) : '',
              genres: Array.isArray(m.genres) ? m.genres : [],
              cast: Array.isArray(m.cast) ? m.cast : [],
              director: Array.isArray(m.director) ? m.director : [],
              writer: Array.isArray(m.writer) ? m.writer : [],
              awards: m.awards || '',
              country: m.country || '',
              videos: Array.isArray(m.videos) ? m.videos : [],
              trailerId: m.trailers && m.trailers[0] ? m.trailers[0].source : null
            };
          }
        }
      }

      const catalogTypes = kindHint === 'show' ? ['series', 'movie'] : ['movie', 'series'];
      const results = await Promise.all(
        catalogTypes.map(t =>
          fetch(`https://v3-cinemeta.strem.io/catalog/${t}/top/search=${encodeURIComponent(queryTitle)}.json`)
            .then(r => (r.ok ? r.json() : null))
            .then(d => ({ type: t, metas: Array.isArray(d?.metas) ? d.metas : [] }))
            .catch(() => ({ type: t, metas: [] }))
        )
      );

      let best = null;
      let bestScore = -1;
      const normQuery = queryTitle.toLowerCase();
      for (const group of results) {
        for (const m of group.metas) {
          const id = m.imdb_id || m.id;
          if (!id || !/^tt\d+$/i.test(id)) continue;
          const name = String(m.name || '').trim();
          const mYear = String(m.releaseInfo || m.year || '').match(/\d{4}/)?.[0] || '';
          let score = 0;
          if (name.toLowerCase() === normQuery) score += 100;
          else if (name.toLowerCase().includes(normQuery)) score += 45;
          if (targetYear && mYear === targetYear) score += 60;
          if (group.type === catalogTypes[0]) score += 10;
          if (score > bestScore) {
            bestScore = score;
            best = { meta: m, type: group.type };
          }
        }
      }
      if (best) {
        const m = best.meta;
        const imdbId = m.imdb_id || m.id;
        return {
          slug: cleanSlug,
          id: imdbId,
          imdbId,
          title: m.name || queryTitle,
          year: String(m.releaseInfo || m.year || targetYear || '').slice(0, 4),
          kind: best.type === 'series' ? 'show' : 'movie',
          poster: m.poster || '',
          still: m.background || '',
          logo: m.logo || '',
          runtime: m.runtime || '',
          description: m.description || '',
          rating: m.imdbRating ? String(m.imdbRating) : '',
          genres: Array.isArray(m.genres) ? m.genres : [],
          cast: Array.isArray(m.cast) ? m.cast : [],
          director: Array.isArray(m.director) ? m.director : [],
          writer: Array.isArray(m.writer) ? m.writer : [],
          awards: m.awards || '',
          country: m.country || '',
          videos: Array.isArray(m.videos) ? m.videos : [],
          trailerId: m.trailers && m.trailers[0] ? m.trailers[0].source : null
        };
      }
    } catch {}

    return null;
  }

  async function resolveStreamSources(imdbId, isShow, seasonNum, episodeNum) {
    const serverList = [];
    const seenNames = new Set();
    const pushServer = (srv) => {
      if (!srv || !srv.name || !srv.src) return;
      const normalized = { ...srv, name: srv.name === 'Flicx' ? 'Kaira' : srv.name };
      const key = `${normalized.name.toLowerCase()}:${normalized.kind || 'hls'}`;
      if (seenNames.has(key)) return;
      seenNames.add(key);
      serverList.push(normalized);
    };

    // 1. Try local Vite /api/sources proxy or configured CORS API proxy first
    let gotLiveApi = false;
    try {
      const apiPath = `/api/sources/${encodeURIComponent(imdbId)}${isShow ? `?s=${seasonNum}&e=${episodeNum}` : ''}`;
      const apiResult = await fetchApiJsonWithMeta(apiPath);
      if (apiResult && apiResult.data) {
        const rawSources = Array.isArray(apiResult.data.sources) ? apiResult.data.sources : [];
        const isStaticHtmlResponse = apiResult.ct.includes('text/html');
        // Push direct HTTPS CDN streams (e.g. https://s.fli.cx/...) before relative /api/ proxy streams
        const orderedSources = [
          ...rawSources.filter(s => s && typeof s.src === 'string' && /^https:\/\//i.test(s.src)),
          ...rawSources.filter(s => s && typeof s.src === 'string' && !/^https:\/\//i.test(s.src))
        ];
        for (const s of orderedSources) {
          if (s.has === false) continue;
          const srcStr = String(s.src || '').trim();
          if (!srcStr) continue;
          if (srcStr.startsWith('/api/')) {
            if (isStaticHtmlResponse) continue;
            if (apiResult.usedProxy && apiResult.proxyBase) {
              pushServer({ ...s, src: `${apiResult.proxyBase}${srcStr}` });
              continue;
            }
            // On static hosts without a local Node middleware, skip relative /api/s/... paths
            if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
              continue;
            }
          }
          pushServer(s);
        }
        if (serverList.length > 0) gotLiveApi = true;
      }
    } catch {}

    // 2. Check build-time static catalog-index.json for cached direct HTTPS HLS streams (movies & TV episodes)
    if (!gotLiveApi) {
      const idx = await fetchStaticCatalogIndex();
      const cacheKey = isShow ? `${imdbId}:${seasonNum}:${episodeNum}` : imdbId;
      const cached = idx && idx.sources && Array.isArray(idx.sources[cacheKey]) ? idx.sources[cacheKey] : [];
      for (const s of cached) {
        if (s && typeof s.src === 'string' && /^https:\/\//i.test(s.src)) {
          pushServer(s);
        }
      }
    }

    // 3. Always append CORS/iframe-safe universal embed servers so GitHub Pages ALWAYS plays on PC & mobile
    const embedFallbacks = buildEmbedFallbackServers(imdbId, isShow, seasonNum, episodeNum);
    for (const srv of embedFallbacks) {
      pushServer(srv);
    }

    return serverList;
  }

  const SUBTITLE_PREF_LANG_KEY = 'kaira:subtitles:lang';
  const SUBTITLE_ISO3_TO_2 = {
    eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it',
    por: 'pt', pob: 'pt-BR', pb: 'pt-BR', rus: 'ru', jpn: 'ja', kor: 'ko',
    chi: 'zh', zho: 'zh', ara: 'ar', hin: 'hi', dut: 'nl', nld: 'nl', pol: 'pl',
    tur: 'tr', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi', cze: 'cs', ces: 'cs',
    gre: 'el', ell: 'el', heb: 'he', hun: 'hu', ind: 'id', rum: 'ro', ron: 'ro',
    tha: 'th', ukr: 'uk', vie: 'vi', bul: 'bg', hrv: 'hr', srp: 'sr', slk: 'sk',
    per: 'fa', fas: 'fa', may: 'ms', msa: 'ms', ben: 'bn', mal: 'ml', tam: 'ta',
    tel: 'te', urd: 'ur', fil: 'tl', tgl: 'tl'
  };

  function normalizeSubLangCode(raw) {
    const cleaned = String(raw || '').trim().toLowerCase();
    if (!cleaned) return '';
    if (SUBTITLE_ISO3_TO_2[cleaned]) return SUBTITLE_ISO3_TO_2[cleaned];
    if (cleaned === 'pt-br' || cleaned === 'pt_br') return 'pt-BR';
    return cleaned.slice(0, 2);
  }

  function loadPreferredSubtitleLang() {
    try {
      const saved = localStorage.getItem(SUBTITLE_PREF_LANG_KEY);
      return saved ? String(saved).trim().toLowerCase() : '';
    } catch {
      return '';
    }
  }

  function savePreferredSubtitleLang(lang) {
    try {
      const clean = String(lang || '').trim().toLowerCase();
      if (!clean) localStorage.removeItem(SUBTITLE_PREF_LANG_KEY);
      else localStorage.setItem(SUBTITLE_PREF_LANG_KEY, clean);
    } catch {}
  }

  function buildOpenSubtitlesRestUrl(params) {
    const segments = [];
    const cleanImdb = String(params?.imdbId || '').trim();
    const imdbMatch = /^tt(\d+)$/i.exec(cleanImdb);
    const cleanQuery = String(params?.query || '').trim().replace(/\s+/g, ' ');
    if (imdbMatch) {
      segments.push(['imdbid', imdbMatch[1]]);
    } else if (cleanQuery) {
      segments.push(['query', encodeURIComponent(cleanQuery.toLowerCase())]);
    } else {
      return null;
    }
    if (params?.isShow) {
      const s = Math.max(1, Math.floor(Number(params.season) || 1));
      const e = Math.max(1, Math.floor(Number(params.episode) || 1));
      segments.push(['episode', String(e)]);
      segments.push(['season', String(s)]);
    }
    segments.sort((a, b) => a[0].localeCompare(b[0]));
    return `https://rest.opensubtitles.org/search/${segments.map(([k, v]) => `${k}-${v}`).join('/')}`;
  }

  function normalizeOpenSubtitlesRestList(entries) {
    if (!Array.isArray(entries)) return [];
    const out = [];
    for (const item of entries) {
      if (!item || typeof item !== 'object') continue;
      const fileId = String(item.IDSubtitleFile || '').trim();
      if (!/^\d+$/.test(fileId)) continue;
      const fmt = String(item.SubFormat || 'srt').toLowerCase();
      if (fmt && fmt !== 'srt' && fmt !== 'vtt' && fmt !== 'sub') continue;
      const lang = normalizeSubLangCode(item.SubLanguageID || item.ISO639 || '');
      if (!lang) continue;
      const downloads = Number(item.SubDownloadsCnt) || 0;
      const sdh =
        item.SubHearingImpaired === '1' ||
        item.SubHearingImpaired === 1 ||
        /\b(sdh|cc|hi)\b/i.test(String(item.SubFileName || ''));
      out.push({
        language: lang,
        src: `https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/${fileId}`,
        sdh,
        source: 'OpenSubtitles',
        downloads
      });
    }
    out.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    return out;
  }

  async function searchOpenSubtitlesByQuery(query, isShow, seasonNum, episodeNum) {
    const restUrl = buildOpenSubtitlesRestUrl({
      query,
      isShow: Boolean(isShow),
      season: seasonNum,
      episode: episodeNum
    });
    if (!restUrl) return [];
    try {
      const res = await fetch(restUrl);
      if (!res.ok) return [];
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('json')) return [];
      const data = await res.json().catch(() => null);
      return normalizeOpenSubtitlesRestList(data);
    } catch {
      return [];
    }
  }

  async function resolveSubtitlesForImdb(imdbId, isShow, seasonNum, episodeNum, fallbackTitle) {
    const collected = [];
    const pushTracks = (list, defaultSource) => {
      if (!Array.isArray(list)) return;
      for (const item of list) {
        if (!item || !item.src || !item.language) continue;
        collected.push({
          language: normalizeSubLangCode(item.language) || String(item.language).trim(),
          src: String(item.src).trim(),
          sdh: Boolean(item.sdh),
          source: item.source || defaultSource || 'OpenSubtitles',
          downloads: Number(item.downloads) || 0
        });
      }
    };

    const hasValidImdb = /^tt\d+$/i.test(String(imdbId || '').trim());

    // 1. Local Vite / server /api/subtitles endpoint or configured CORS API proxy
    if (hasValidImdb) {
      try {
        const subPath = `/api/subtitles/${encodeURIComponent(imdbId)}${isShow ? `?s=${seasonNum}&e=${episodeNum}` : ''}`;
        const subResult = await fetchApiJsonWithMeta(subPath);
        const data = subResult && subResult.data;
        if (data && Array.isArray(data.tracks) && data.tracks.length > 0) {
          pushTracks(data.tracks, 'Kaira');
        }
      } catch {}
    }

    // 2 & 3. Parallel CORS-wildcard OpenSubtitles sources (Stremio v3 catalog + OpenSubtitles REST IMDb/Episode)
    if (hasValidImdb) {
      const osV3Url = isShow
        ? `https://opensubtitles-v3.strem.io/subtitles/series/${encodeURIComponent(imdbId)}:${seasonNum}:${episodeNum}.json`
        : `https://opensubtitles-v3.strem.io/subtitles/movie/${encodeURIComponent(imdbId)}.json`;
      const osRestUrl = buildOpenSubtitlesRestUrl({
        imdbId,
        isShow: Boolean(isShow),
        season: seasonNum,
        episode: episodeNum
      });

      const [v3Tracks, restTracks] = await Promise.all([
        fetch(osV3Url)
          .then(async (res) => {
            if (!res.ok) return [];
            const data = await res.json().catch(() => null);
            const subs = Array.isArray(data?.subtitles) ? data.subtitles : [];
            return subs
              .filter(s => s && s.url && s.lang)
              .map(s => ({
                language: normalizeSubLangCode(s.lang),
                src: s.url,
                sdh: Boolean(s.SubHearingImpaired === '1' || /sdh|cc|hi/i.test(String(s.id || ''))),
                source: 'OpenSubtitles'
              }));
          })
          .catch(() => []),
        osRestUrl
          ? fetch(osRestUrl)
              .then(async (res) => {
                if (!res.ok) return [];
                const ct = (res.headers.get('content-type') || '').toLowerCase();
                if (!ct.includes('json')) return [];
                const data = await res.json().catch(() => null);
                return normalizeOpenSubtitlesRestList(data);
              })
              .catch(() => [])
          : Promise.resolve([])
      ]);

      // Prioritize popularity-ranked REST releases alongside v3 tracks for multi-candidate failover
      pushTracks(restTracks, 'OpenSubtitles');
      pushTracks(v3Tracks, 'OpenSubtitles');
    }

    // 4. Title-query OpenSubtitles REST fallback whenever IMDb lookup found nothing (e.g. missing IMDb ID / newer release)
    if (collected.length === 0 && fallbackTitle && String(fallbackTitle).trim().length >= 2) {
      const cleanQuery = String(fallbackTitle).replace(/\(\d{4}\)/g, '').trim();
      const queryTracks = await searchOpenSubtitlesByQuery(cleanQuery, isShow, seasonNum, episodeNum);
      pushTracks(queryTracks, 'OpenSubtitles');
    }

    return collected;
  }

  let toastTimer = null;
  function showKairaToast(message) {
    let toast = document.getElementById('kaira-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'kaira-toast';
      toast.className = 'kaira-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    void toast.offsetHeight;
    toast.classList.add('kaira-toast-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('kaira-toast-visible');
    }, 2600);
  }

  function prefersReducedMotion() {
    return (
      document.documentElement.getAttribute('data-motion') === 'reduce' ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    );
  }

  // Global safe image fallback handler (replaces inline onerror attributes)
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    const fallbackSrc = img.getAttribute('data-fallback-src');
    if (fallbackSrc && img.getAttribute('data-fallback-tried') !== '1') {
      img.setAttribute('data-fallback-tried', '1');
      img.removeAttribute('data-failed');
      img.src = fallbackSrc;
      return;
    }
    img.setAttribute('data-failed', 'true');
    img.removeAttribute('srcset');
    if (img.closest('.person-pic')) {
      img.style.display = 'none';
    }
    if (img.hasAttribute('data-hero-logo')) {
      img.style.display = 'none';
      const siblingTitle = img.parentElement?.querySelector('.hero-title-fallback');
      if (siblingTitle) siblingTitle.style.display = 'block';
    }
  }, true);

  // --- 1. Dynamic Featured Hero Carousel Engine (Movies & TV Shows) ---
  const dynamicHeroCache = { movie: null, tv: null };
  let currentHeroSlides = [];
  let currentSlideIndex = 0;
  let heroTimer = null;
  let isPaused = false;
  const slideDuration = 7000;

  // Known rich overviews map for top releases
  const OVERVIEWS = {
    'the-odyssey-2026': "After the Trojan War, Odysseus faces a dangerous voyage back to Ithaca, meeting creatures like the Cyclops Polyphemus, Sirens, and Calypso along the way.",
    'spider-man-brand-new-day-2026': "Peter Parker navigates life as a street-level hero in New York City while confronting emerging underworld threats and balancing his dual identity.",
    'resident-evil-2026': "A biological outbreak unravels a shadowy conspiracy as elite survivors navigate treacherous quarantine zones infested with deadly viral horrors.",
    'heart-of-the-beast-2026': "After a harrowing plane crash, Special Forces veteran James Belmont and his combat dog, Odin, find themselves stranded deep in the Alaskan wilderness.",
    'obsession-2026': "An intense psychological thriller following a high-stakes entanglement where hidden secrets and obsession collide with devastating consequences.",
    'mutiny-2026': "After his billionaire boss is murdered, Cole Reed is framed for the crime and embarks on a high-octane quest across continents to expose an international conspiracy.",
    'project-hail-mary-2026': "Ryland Grace is the sole survivor on a desperate, last-chance mission—and if he fails, humanity and the Earth itself will perish.",
    'hope-2026': "In the desolate outskirts of a remote harbor town, an enigmatic discovery sends shockwaves through a fragile community.",
    'the-mentalist-2008': "Patrick Jane, a former celebrity psychic medium, uses his razor sharp skills of observation and expertise at reading people to solve serious crimes with the California Bureau of Investigation.",
    'dexter-resurrection-2025': "Dexter Morgan returns to navigate new dark trials in New York City, balancing his twisted instincts with a father's protective duty.",
    'the-lord-of-the-rings-the-rings-of-power-2022': "Beginning in a time of relative peace, an ensemble cast of characters confront the re-emergence of evil in Middle-earth.",
    'avatar-seven-havens-2026': "In a newly awakened era of elemental balance, heroes across the Seven Havens unite to protect an ancient power from total collapse.",
    'visionquest-2026': "White Vision explores the truth of his identity and newfound humanity while confronting adversaries determined to weaponize his core.",
    'campus-drivers-2026': "A spirited ensemble drama following four university students navigating love, speed, rivalries, and life on and off the campus track.",
    'dexter-2006': "By day, mild-mannered Dexter is a blood-spatter analyst for the Miami police. By night, he hunts killers who slipped through the cracks of justice."
  };

  // Curated 6-slide hero fallbacks so Home (/), Movies (/movies), and TV (/tv) always render a full multi-slide carousel even on static hosts
  const FALLBACK_MOVIE_HERO_SLIDES = [
    {
      slug: "the-odyssey-2026",
      kind: "movie",
      title: "The Odyssey",
      id: "tt33764258",
      still: "https://s.fli.cx/t/original/dZI4Ek4qc2Fib2G1zFkGhKKuc6j.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt33764258/img",
      logoAspect: 8.8988,
      logoMeta: { w: 800, h: 310, mono: true, box: [0, 0.355, 1, 0.645] },
      tag: "New release 2026",
      rating: "8.4",
      year: 2026,
      runtime: "2h 53m",
      genres: ["Action", "Adventure", "Drama"],
      overview: OVERVIEWS["the-odyssey-2026"],
      watchUrl: "/watch/the-odyssey-2026",
      detailUrl: "/movie/the-odyssey-2026",
      backdropTone: "#1f2933",
      tone: "#5d341e"
    },
    {
      slug: "spider-man-brand-new-day-2026",
      kind: "movie",
      title: "Spider-Man: Brand New Day",
      id: "tt22084616",
      still: "https://s.fli.cx/t/original/r08LxMJCbf1SiJIWeyH9aJmdqwC.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt22084616/img",
      logoAspect: 3.8968,
      logoMeta: { w: 800, h: 310, mono: false, box: [0.01, 0.162, 0.99, 0.811] },
      tag: "New release 2026",
      rating: "8.0",
      year: 2026,
      runtime: "2h 25m",
      genres: ["Action", "Adventure"],
      overview: OVERVIEWS["spider-man-brand-new-day-2026"],
      watchUrl: "/watch/spider-man-brand-new-day-2026",
      detailUrl: "/movie/spider-man-brand-new-day-2026",
      backdropTone: "#797068",
      tone: "#5f3a3d"
    },
    {
      slug: "resident-evil-2026",
      kind: "movie",
      title: "Resident Evil",
      id: "tt35538033",
      still: "https://s.fli.cx/t/original/3icyRAqgakNcQn6aDVz9libFmBA.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt35538033/img",
      logoAspect: 3.9788,
      logoMeta: { w: 800, h: 310, mono: false, box: [0.031, 0.189, 0.99, 0.811] },
      tag: "New release 2026",
      rating: "7.6",
      year: 2026,
      runtime: "1h 34m",
      genres: ["Action", "Horror", "Sci-Fi"],
      overview: OVERVIEWS["resident-evil-2026"],
      watchUrl: "/watch/resident-evil-2026",
      detailUrl: "/movie/resident-evil-2026",
      backdropTone: "#231f24",
      tone: "#4c4547"
    },
    {
      slug: "heart-of-the-beast-2026",
      kind: "movie",
      title: "Heart of the Beast",
      id: "tt7526136",
      still: "https://s.fli.cx/t/original/yE766yhgg98tKwTKd8CyNvAtmn6.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt7526136/img",
      logoAspect: 1.4241,
      logoMeta: { w: 779, h: 547, mono: false, box: [0, 0, 1, 1] },
      tag: "New release 2026",
      rating: "7.1",
      year: 2026,
      runtime: "1h 41m",
      genres: ["Action", "Adventure", "Drama"],
      overview: OVERVIEWS["heart-of-the-beast-2026"],
      watchUrl: "/watch/heart-of-the-beast-2026",
      detailUrl: "/movie/heart-of-the-beast-2026",
      backdropTone: "#818672",
      tone: "#575444"
    },
    {
      slug: "obsession-2026",
      kind: "movie",
      title: "Obsession",
      id: "tt37287335",
      still: "https://s.fli.cx/t/original/5lTZyuBTNOfawsfPT8Q0cIg6qAF.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt37287335/img",
      logoAspect: 4.9203,
      logoMeta: { w: 800, h: 310, mono: false, box: [0.01, 0.243, 0.99, 0.757] },
      tag: "New release 2026",
      rating: "7.8",
      year: 2026,
      runtime: "1h 49m",
      genres: ["Horror", "Thriller"],
      overview: OVERVIEWS["obsession-2026"],
      watchUrl: "/watch/obsession-2026",
      detailUrl: "/movie/obsession-2026",
      backdropTone: "#603f37",
      tone: "#444140"
    },
    {
      slug: "mutiny-2026",
      kind: "movie",
      title: "Mutiny",
      id: "tt32338669",
      still: "https://s.fli.cx/t/original/qDa0fqDqIBCovRp975RvtGPcuN3.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt32338669/img",
      logoAspect: 2.8352,
      logoMeta: { w: 800, h: 310, mono: false, box: [0.01, 0.054, 0.99, 0.946] },
      tag: "New release 2026",
      rating: "5.7",
      year: 2026,
      runtime: "1h 36m",
      genres: ["Action", "Crime", "Thriller"],
      overview: OVERVIEWS["mutiny-2026"],
      watchUrl: "/watch/mutiny-2026",
      detailUrl: "/movie/mutiny-2026",
      backdropTone: "#91979c",
      tone: "#959292"
    }
  ];

  const FALLBACK_TV_HERO_SLIDES = [
    {
      slug: "avatar-seven-havens-2026",
      kind: "show",
      title: "Avatar: Seven Havens",
      id: "tt35854736",
      still: "https://s.fli.cx/t/original/z0Y4vjd0WhMdWYEySd6wooVQQaH.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt35854736/img",
      logoAspect: 2.6,
      logoMeta: null,
      tag: "New release 2026",
      rating: "8.9",
      year: 2026,
      runtime: "23m / ep",
      genres: ["Animation", "Action & Adventure", "Sci-Fi & Fantasy"],
      overview: OVERVIEWS["avatar-seven-havens-2026"],
      watchUrl: "/watch/avatar-seven-havens-2026/s1e1",
      detailUrl: "/tv/avatar-seven-havens-2026",
      backdropTone: "#4a6a6d",
      tone: "#596161"
    },
    {
      slug: "visionquest-2026",
      kind: "show",
      title: "VisionQuest",
      id: "tt23112594",
      still: "https://s.fli.cx/t/original/uoXXbN2PrOxH6UKyP7kYwmGpAAP.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt23112594/img",
      logoAspect: 3.1,
      logoMeta: null,
      tag: "New release 2026",
      rating: "8.2",
      year: 2026,
      runtime: "56m / ep",
      genres: ["Sci-Fi & Fantasy", "Drama"],
      overview: OVERVIEWS["visionquest-2026"],
      watchUrl: "/watch/visionquest-2026/s1e1",
      detailUrl: "/tv/visionquest-2026",
      backdropTone: "#3f2a1a",
      tone: "#594229"
    },
    {
      slug: "dexter-resurrection-2025",
      kind: "show",
      title: "Dexter: Resurrection",
      id: "tt33043892",
      still: "https://s.fli.cx/t/original/vcpj6rRDS93ImHCLPY8bwBuFGjR.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt33043892/img",
      logoAspect: 2.8,
      logoMeta: null,
      tag: "Trending series",
      rating: "8.5",
      year: 2025,
      runtime: "52m / ep",
      genres: ["Crime", "Drama", "Mystery"],
      overview: OVERVIEWS["dexter-resurrection-2025"],
      watchUrl: "/watch/dexter-resurrection-2025/s1e1",
      detailUrl: "/tv/dexter-resurrection-2025",
      backdropTone: "#629bd2",
      tone: "#615854"
    },
    {
      slug: "campus-drivers-2026",
      kind: "show",
      title: "Campus Drivers",
      id: "tt39943756",
      still: "https://s.fli.cx/t/original/yQHskBQhYsnxcoRsYHESSOUaRja.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt39943756/img",
      logoAspect: 2.7,
      logoMeta: null,
      tag: "New release 2026",
      rating: "7.7",
      year: 2026,
      runtime: "46m / ep",
      genres: ["Drama"],
      overview: OVERVIEWS["campus-drivers-2026"],
      watchUrl: "/watch/campus-drivers-2026/s1e1",
      detailUrl: "/tv/campus-drivers-2026",
      backdropTone: "#434047",
      tone: "#938a8a"
    },
    {
      slug: "the-mentalist-2008",
      kind: "show",
      title: "The Mentalist",
      id: "tt1196946",
      still: "https://s.fli.cx/t/original/dwMZ8BW1tUp69baogSrcTAumKuR.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt1196946/img",
      logoAspect: 3.0,
      logoMeta: null,
      tag: "Trending series",
      rating: "8.4",
      year: 2008,
      runtime: "45m / ep",
      genres: ["Crime", "Drama", "Mystery"],
      overview: OVERVIEWS["the-mentalist-2008"],
      watchUrl: "/watch/the-mentalist-2008/s1e1",
      detailUrl: "/tv/the-mentalist-2008",
      backdropTone: "#585956",
      tone: "#95968d"
    },
    {
      slug: "dexter-2006",
      kind: "show",
      title: "Dexter",
      id: "tt0773262",
      still: "https://s.fli.cx/t/original/nS5ZSmrX92lu1GYAlXZye1mkDfd.jpg",
      logo: "https://s.fli.cx/a/logo/medium/tt0773262/img",
      logoAspect: 2.6,
      logoMeta: null,
      tag: "Trending series",
      rating: "8.2",
      year: 2006,
      runtime: "60m / ep",
      genres: ["Crime", "Drama", "Mystery"],
      overview: OVERVIEWS["dexter-2006"],
      watchUrl: "/watch/dexter-2006/s1e1",
      detailUrl: "/tv/dexter-2006",
      backdropTone: "#9d8e93",
      tone: "#ad9d96"
    }
  ];

  function isItemTvShow(item, defaultIsTv) {
    if (!item) return !!defaultIsTv;
    if (item.kind === 'show' || item.kind === 'tv' || item.kind === 'series') return true;
    if (item.kind === 'movie' || item.kind === 'film') return false;
    const rt = Number(item.runtime);
    // Upstream movie objects omit `kind` and have feature runtimes (>= 75m)
    if (Number.isFinite(rt) && rt >= 75) return false;
    if (defaultIsTv) return true;
    if (Number.isFinite(rt) && rt > 0 && rt < 65) return true;
    return false;
  }

  function formatRuntimeLabel(runtime, itemIsTv) {
    const mins = Number(runtime);
    if (itemIsTv) {
      if (Number.isFinite(mins) && mins > 0 && mins <= 20) {
        return mins === 1 ? '1 Season' : `${mins} Seasons`;
      }
      if (Number.isFinite(mins) && mins > 20 && mins <= 90) {
        return `${mins}m / ep`;
      }
      return 'Series';
    }
    const validMins = Number.isFinite(mins) && mins > 0 ? mins : 120;
    const h = Math.floor(validMins / 60);
    const m = validMins % 60;
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

  async function fetchDynamicHeroReleases(isTv) {
    const cacheKey = isTv ? 'tv' : 'movie';
    if (dynamicHeroCache[cacheKey]) {
      return dynamicHeroCache[cacheKey];
    }

    try {
      const endpoint = isTv ? '/api/trending?kind=show' : '/api/trending?kind=movie';
      const browseEndpoint = isTv ? '/api/browse?kind=show&sort=release_date' : '/api/browse?kind=movie&sort=release_date';

      const [trendingRes, browseRes] = await Promise.all([
        fetchApiJsonWithMeta(endpoint).then(r => (r ? r.data : null)).catch(() => null),
        fetchApiJsonWithMeta(browseEndpoint).then(r => (r ? r.data : null)).catch(() => null)
      ]);

      const candidates = [];
      const seen = new Set();

      const addCandidate = (item) => {
        if (!item || !item.slug || seen.has(item.slug)) return;
        const explicitShow = item.kind === 'show' || item.kind === 'tv' || item.kind === 'series';
        const itemIsShow = isTv ? explicitShow : isItemTvShow(item, false);
        // Keep Movies hero strictly movies and TV hero strictly shows
        if (isTv && !itemIsShow) return;
        if (!isTv && itemIsShow) return;
        candidates.push(item);
        seen.add(item.slug);
      };

      if (trendingRes?.lists?.week) {
        for (const item of trendingRes.lists.week) addCandidate(item);
      }
      if (browseRes?.films) {
        for (const item of browseRes.films) addCandidate(item);
      }
      if (trendingRes?.lists?.day) {
        for (const item of trendingRes.lists.day) addCandidate(item);
      }

      // Prioritize titles that have both a real logo graphic and backdrop still, then newest year & rating
      candidates.sort((a, b) => {
        const hasLogoA = a.logo ? 1 : 0;
        const hasLogoB = b.logo ? 1 : 0;
        if (hasLogoA !== hasLogoB) return hasLogoB - hasLogoA;
        const hasStillA = a.still ? 1 : 0;
        const hasStillB = b.still ? 1 : 0;
        if (hasStillA !== hasStillB) return hasStillB - hasStillA;
        const yA = Number(a.year) || 0;
        const yB = Number(b.year) || 0;
        if (yA !== yB) return yB - yA;
        return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      });

      const topReleases = candidates.slice(0, 6);
      const formatted = topReleases.map(f => {
        const logoMeta = (f.logo && typeof f.logo === 'object') ? {
          w: Number(f.logo.w) || 800,
          h: Number(f.logo.h) || 310,
          box: Array.isArray(f.logo.box) && f.logo.box.length === 4 ? f.logo.box.map(Number) : null,
          mono: !!f.logo.mono
        } : null;

        let logoAspect = 2.5;
        if (logoMeta && logoMeta.box) {
          const [left, top, right, bottom] = logoMeta.box;
          const bw = right - left;
          const bh = bottom - top;
          if (bw > 0.01 && bh > 0.01) {
            logoAspect = Number(((bw * logoMeta.w) / (bh * logoMeta.h)).toFixed(4));
          }
        }

        const itemIsTv = isItemTvShow(f, isTv);
        const runtimeStr = formatRuntimeLabel(f.runtime, itemIsTv);

        return {
          id: f.id,
          slug: f.slug,
          kind: itemIsTv ? 'show' : 'movie',
          title: f.title,
          year: f.year || 2026,
          rating: f.rating ? Number(f.rating).toFixed(1) : '8.4',
          runtime: runtimeStr,
          genres: f.genres && f.genres.length > 0 ? f.genres : ['Action', 'Drama'],
          tag: f.year >= 2026 ? 'New release 2026' : (itemIsTv ? 'Trending series' : 'Trending this week'),
          still: safeImageUrl(f.still) || `https://s.fli.cx/a/background/medium/${encodeURIComponent(f.id)}/img`,
          logo: f.id ? `https://s.fli.cx/a/logo/medium/${encodeURIComponent(f.id)}/img` : null,
          logoAspect: logoAspect,
          logoMeta: logoMeta,
          backdropTone: safeColor(f.backdropTone, '#1f2933'),
          tone: safeColor(f.tone, '#5d341e'),
          overview: OVERVIEWS[f.slug] || `${f.title} (${f.year || 2026}) - An acclaimed ${f.genres ? f.genres.join(' and ') : 'cinematic'} release streaming now on Kaira.`,
          watchUrl: itemIsTv ? `/watch/${f.slug}/s1e1` : `/watch/${f.slug}`,
          detailUrl: itemIsTv ? `/tv/${f.slug}` : `/movie/${f.slug}`
        };
      });

      if (formatted.length > 0) {
        dynamicHeroCache[cacheKey] = formatted;
        return formatted;
      }
    } catch (err) {
      console.warn('Failed to fetch dynamic hero releases:', err);
    }

    return null;
  }

  async function initHeroCarousel() {
    const cleanPath = normalizeRoutePath(window.location.pathname);
    const isTvBrowse = cleanPath === '/tv';
    const isMoviesBrowse = cleanPath === '/movies';
    const isHome = cleanPath === '/' || cleanPath === '/index.html';
    if (!isHome && !isMoviesBrowse && !isTvBrowse) {
      if (heroTimer) {
        clearTimeout(heroTimer);
        heroTimer = null;
      }
      return;
    }
    const isTv = isTvBrowse;

    const heroEl = document.querySelector('.hero');
    const stage = document.querySelector('.hero-stage');
    if (!heroEl || !stage) return;

    if (heroTimer) {
      clearTimeout(heroTimer);
      heroTimer = null;
    }

    const dynamicReleases = await fetchDynamicHeroReleases(isTv);
    // Abort if user navigated away while fetching
    const currentClean = normalizeRoutePath(window.location.pathname);
    if (currentClean !== cleanPath || !heroEl.isConnected) return;

    const curatedFallback = isTv ? FALLBACK_TV_HERO_SLIDES : FALLBACK_MOVIE_HERO_SLIDES;
    const mergedSlides = [];
    const seenSlugs = new Set();
    for (const item of (Array.isArray(dynamicReleases) ? dynamicReleases : [])) {
      if (item && item.slug && !seenSlugs.has(item.slug)) {
        seenSlugs.add(item.slug);
        mergedSlides.push(item);
      }
    }
    for (const item of curatedFallback) {
      if (mergedSlides.length >= 6) break;
      if (item && item.slug && !seenSlugs.has(item.slug)) {
        seenSlugs.add(item.slug);
        mergedSlides.push(item);
      }
    }
    const slides = mergedSlides.slice(0, 6);

    currentHeroSlides = slides;
    currentSlideIndex = 0;

    // 2. Populate .hero-media with multi-slide structure for hero-cross animations
    const heroMedia = stage.querySelector('.hero-media');
    if (heroMedia) {
      heroMedia.innerHTML = slides.map((s, idx) => `
        <div class="hero-slide" data-slide-idx="${idx}" data-state="${idx === 0 ? 'active' : 'idle'}" ${idx === 0 ? 'data-animate=""' : ''} style="background: ${safeColor(s.backdropTone, '#1f2933')};">
          <img src="${escapeAttr(s.still)}" alt="" loading="${idx === 0 ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${idx === 0 ? 'high' : 'low'}" draggable="false" style="object-fit:cover;object-position:50% 20%;width:100%;height:100%;" />
        </div>
      `).join('');
    }

    // 3. Populate .hero-switch-bars with dynamic buttons (both desktop and mobile)
    const switchShells = stage.querySelectorAll('.hero-switch');
    switchShells.forEach(shell => {
      shell.style.display = slides.length > 1 ? '' : 'none';
    });
    const switchBarsContainers = stage.querySelectorAll('.hero-switch-bars');
    switchBarsContainers.forEach(container => {
      container.innerHTML = slides.map((s, idx) => `
        <button type="button" aria-label="${idx + 1} of ${slides.length}: ${escapeAttr(s.title)}" class="hero-switch-bar" ${idx === 0 ? 'aria-current="true"' : ''} data-index="${idx}">
          <span>${idx === 0 ? '<span class="hero-switch-fill hero-clock"></span>' : ''}</span>
        </button>
      `).join('');

      container.querySelectorAll('.hero-switch-bar').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetIdx = parseInt(btn.getAttribute('data-index'), 10);
          if (!isNaN(targetIdx) && targetIdx !== currentSlideIndex) {
            renderSlide(targetIdx, true);
          }
        };
      });
    });

    function scheduleNextSlide() {
      if (heroTimer) {
        clearTimeout(heroTimer);
        heroTimer = null;
      }
      if (isPaused || heroEl.hasAttribute('data-paused') || document.documentElement.getAttribute('data-motion') === 'reduce') {
        return;
      }
      heroTimer = setTimeout(() => {
        if (!heroEl.isConnected) return;
        if (!isPaused && !heroEl.hasAttribute('data-paused')) {
          renderSlide((currentSlideIndex + 1) % slides.length, true);
        }
      }, slideDuration);
    }

    // 4. Render Slide Function with single authoritative timer (no double-advance)
    function renderSlide(index, animate = true) {
      const prevIndex = currentSlideIndex;
      currentSlideIndex = index;
      const data = slides[index];
      if (!data) return;

      // A. Slide Crossfade
      if (heroMedia) {
        const allSlides = heroMedia.querySelectorAll('.hero-slide');
        allSlides.forEach((slide, sIdx) => {
          if (sIdx === index) {
            slide.setAttribute('data-state', 'active');
            if (animate) {
              slide.setAttribute('data-animate', '');
            } else {
              slide.removeAttribute('data-animate');
            }
          } else if (sIdx === prevIndex && animate) {
            slide.setAttribute('data-state', 'leaving');
            slide.removeAttribute('data-animate');
          } else {
            slide.setAttribute('data-state', 'idle');
            slide.removeAttribute('data-animate');
          }
        });
      }

      // B. Update Hero Copy
      const copyGroup = stage.querySelector('.hero-copy [role="group"][aria-roledescription="slide"]');
      if (copyGroup) {
        copyGroup.setAttribute('aria-label', `${index + 1} of ${slides.length}`);
        copyGroup.style.opacity = '1';
      }

      // Title & Logo: crop transparent padding using logoMeta.box & normalize area so all hero logos are an even, balanced size
      const logoSpan = stage.querySelector('.title-logo');
      let standaloneFallback = stage.querySelector('.hero-copy .hero-title-standalone');
      if (logoSpan) {
        if (data.logo) {
          if (standaloneFallback) standaloneFallback.style.display = 'none';
          const meta = data.logoMeta;
          const hasBox = meta && Array.isArray(meta.box) && meta.box.length === 4;
          const aspect = Number(data.logoAspect) > 0.2 ? Number(data.logoAspect) : 2.5;

          // Normalize visual footprint across extreme aspect ratios (tall stacked vs wide wordmark)
          const targetAreaRem2 = 175;
          const maxHeightRem = 8.25;
          const maxWidthRem = 34;
          const minWidthRem = 13;
          let targetWRem = Math.sqrt(targetAreaRem2 * aspect);
          if (targetWRem / aspect > maxHeightRem) {
            targetWRem = maxHeightRem * aspect;
          }
          targetWRem = Math.max(minWidthRem, Math.min(maxWidthRem, targetWRem));

          logoSpan.style.display = 'block';
          logoSpan.style.position = 'relative';
          logoSpan.style.overflow = 'hidden';
          logoSpan.style.setProperty('--logo-aspect', String(aspect));
          logoSpan.style.setProperty('--logo-w', `min(82vw, ${targetWRem.toFixed(2)}rem)`);
          logoSpan.style.setProperty('--logo-h', `${maxHeightRem}rem`);
          logoSpan.style.width = `min(82vw, ${targetWRem.toFixed(2)}rem)`;
          logoSpan.style.aspectRatio = String(aspect);

          const filterCss = meta && meta.mono
            ? 'brightness(0) invert(1) drop-shadow(0 2px 16px rgba(0,0,0,0.72))'
            : 'drop-shadow(0 2px 16px rgba(0,0,0,0.65))';

          let imgStyle = `position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:left bottom;filter:${filterCss};`;
          if (hasBox) {
            const [x0, y0, x1, y1] = meta.box;
            const bw = Math.max(0.05, x1 - x0);
            const bh = Math.max(0.05, y1 - y0);
            const imgW = (100 / bw).toFixed(3);
            const imgLeft = ((-x0 / bw) * 100).toFixed(3);
            const imgTop = ((-y0 / bh) * 100).toFixed(3);
            imgStyle = `position:absolute;max-width:none;height:auto;width:${imgW}%;left:${imgLeft}%;top:${imgTop}%;filter:${filterCss};`;
          }

          logoSpan.innerHTML = `
            <img data-hero-logo="1" alt="${escapeAttr(data.title)}" src="${escapeAttr(data.logo)}" class="fade-in${meta && meta.mono ? ' brightness-0 invert' : ''}" style="${imgStyle}" />
            <span class="hero-title-fallback" style="display:none;">${escapeHtml(data.title)}</span>
          `;
        } else {
          logoSpan.style.display = 'none';
          if (!standaloneFallback) {
            standaloneFallback = document.createElement('div');
            standaloneFallback.className = 'hero-title-fallback hero-title-standalone';
            logoSpan.parentNode.insertBefore(standaloneFallback, logoSpan);
          }
          standaloneFallback.style.display = 'block';
          standaloneFallback.textContent = data.title;
        }
      }

      const titleSr = stage.querySelector('.hero-copy h2.sr-only');
      if (titleSr) titleSr.textContent = data.title;

      const counterSr = stage.querySelector('.hero-copy p.sr-only');
      if (counterSr) counterSr.textContent = `${data.kind === 'show' ? 'Show' : 'Film'} ${index + 1} of ${slides.length}: ${data.title}`;

      // Facts badges (properly URL-encoded genre routes)
      const factsUl = stage.querySelector('.hero-copy ul.facts');
      if (factsUl) {
        factsUl.innerHTML = `
          <li class="badge badge-accent">${escapeHtml(data.tag)}</li>
          ${data.rating ? `<li class="badge">★ ${escapeHtml(data.rating)}</li>` : ''}
          <li class="badge">${escapeHtml(data.year)}</li>
          <li class="badge">${escapeHtml(data.runtime)}</li>
          ${data.genres.map(g => `<li class="badge"><a href="/genres/${encodeURIComponent(String(g).toLowerCase())}" class="hover:underline">${escapeHtml(g)}</a></li>`).join('')}
        `;
      }

      // Overview
      const overview = stage.querySelector('.hero-overview');
      if (overview) overview.textContent = data.overview;

      // Action buttons & ARIA group labels
      const actionGroups = stage.querySelectorAll('.hero-actions [role="group"]');
      if (actionGroups[0]) {
        actionGroups[0].setAttribute('aria-label', `${data.title}: play, and the trailer`);
      }
      if (actionGroups[1]) {
        actionGroups[1].setAttribute('aria-label', `${data.title}: details, and the library`);
      }

      const playBtn = stage.querySelector('.hero-actions a.btn-primary, .capsule-btn-play');
      if (playBtn) {
        playBtn.href = data.watchUrl;
        playBtn.setAttribute('aria-label', `Play ${data.title}`);
      }

      const trailerBtn = Array.from(stage.querySelectorAll('.hero-actions button.capsule-btn')).find(
        b => !b.hasAttribute('data-watchlist-button') && /trailer/i.test(b.textContent || '')
      );
      if (trailerBtn) {
        trailerBtn.setAttribute('data-trailer-slug', data.slug);
        trailerBtn.setAttribute('data-trailer-title', data.title);
        trailerBtn.setAttribute('data-trailer-kind', data.kind);
        trailerBtn.setAttribute('aria-label', `Watch trailer for ${data.title}`);
      }

      const detailsBtn = stage.querySelector('.hero-actions a[href*="/movie/"], .hero-actions a[href*="/tv/"], a.capsule-btn[title^="Details"]');
      if (detailsBtn) {
        detailsBtn.href = data.detailUrl;
        detailsBtn.setAttribute('title', `Details: ${data.title}`);
        detailsBtn.setAttribute('aria-label', `Details: ${data.title}`);
      }

      const addBtn = stage.querySelector('.hero-actions button[data-watchlist-button]');
      if (addBtn) {
        addBtn.setAttribute('data-title-slug', data.slug);
        addBtn.setAttribute('data-title-id', data.id || '');
        addBtn.setAttribute('data-title', data.title);
        addBtn.setAttribute('data-title-kind', data.kind);
        addBtn.setAttribute('data-title-year', String(data.year || ''));
        addBtn.setAttribute('data-title-rating', String(data.rating || ''));
        addBtn.setAttribute('data-title-genre', data.genres?.[0] || '');
        addBtn.setAttribute('data-title-tone', data.tone || '');
        const inLibrary = typeof isInWatchlist === 'function' ? isInWatchlist(data.slug) : false;
        if (typeof updateWatchlistButton === 'function') {
          updateWatchlistButton(addBtn, inLibrary, data.title);
        }
      }

      // C. Switcher Bars & Hero Clock across ALL containers (visual clock only; JS timer drives slide change once)
      switchBarsContainers.forEach(container => {
        const bars = container.querySelectorAll('.hero-switch-bar');
        bars.forEach((bar, bIdx) => {
          if (bIdx === index) {
            bar.setAttribute('aria-current', 'true');
            bar.innerHTML = '<span><span class="hero-switch-fill hero-clock"></span></span>';
          } else {
            bar.removeAttribute('aria-current');
            bar.innerHTML = '<span></span>';
          }
        });
      });

      scheduleNextSlide();

      // Ambient lighting update
      const ambient = document.querySelector('.ambient');
      if (ambient && data.backdropTone) {
        ambient.style.setProperty('--ambient-bg', data.backdropTone);
      }
      if (heroEl && data.tone) {
        heroEl.style.setProperty('--accent', data.tone);
      }
    }

    // 5. Pause / Resume Buttons (both desktop and mobile)
    const pauseBtns = stage.querySelectorAll('.hero-pause, .hero-switch .capsule-btn');
    const pauseSvgPlay = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:1rem;height:1rem;"><polygon points="6,4 20,12 6,20"></polygon></svg>';
    const pauseSvgPause = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:1rem;height:1rem;"><rect x="5.5" y="4" width="4.6" height="16" rx="1.4"></rect><rect x="13.9" y="4" width="4.6" height="16" rx="1.4"></rect></svg>';

    function updatePauseButtons() {
      pauseBtns.forEach(btn => {
        btn.innerHTML = isPaused ? pauseSvgPlay : pauseSvgPause;
        btn.setAttribute('aria-label', isPaused ? 'Resume slideshow' : 'Pause slideshow');
        btn.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
      });
    }

    pauseBtns.forEach(pauseBtn => {
      pauseBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        isPaused = !isPaused;
        updatePauseButtons();
        if (isPaused) {
          heroEl.setAttribute('data-paused', '');
          if (heroTimer) {
            clearTimeout(heroTimer);
            heroTimer = null;
          }
        } else {
          heroEl.removeAttribute('data-paused');
          renderSlide(currentSlideIndex, false);
        }
      };
    });
    updatePauseButtons();

    // Hover pauses/resumes ONLY when directly over switch capsules
    const switchCapsules = stage.querySelectorAll('.hero-switch');
    switchCapsules.forEach(capsule => {
      capsule.addEventListener('mouseenter', () => {
        heroEl.setAttribute('data-paused', '');
        if (heroTimer) {
          clearTimeout(heroTimer);
          heroTimer = null;
        }
      });
      capsule.addEventListener('mouseleave', () => {
        if (!isPaused) {
          heroEl.removeAttribute('data-paused');
          scheduleNextSlide();
        }
      });
    });

    // Initial render
    renderSlide(0, false);
  }

  // --- 2. Authentic Kaira Video Player & Star Servers (with full lifecycle cleanup) ---
  let activePlayerCleanup = null;
  let activeWatchSessionId = 0;

  function cleanupWatchPlayer() {
    activeWatchSessionId += 1;
    if (document.body) {
      document.body.classList.remove('kaira-watching');
    }
    if (typeof activePlayerCleanup === 'function') {
      try { activePlayerCleanup(); } catch {}
      activePlayerCleanup = null;
    }
  }

  function ensureHlsLoaded(callback) {
    if (window.Hls) {
      callback();
      return;
    }
    let hlsScript = document.querySelector('script[src*="hls.min.js"]');
    if (!hlsScript) {
      const basePrefix = (typeof window.__KAIRA_BASE_PATH__ === 'string' && window.__KAIRA_BASE_PATH__ !== '/')
        ? window.__KAIRA_BASE_PATH__.replace(/\/$/, '')
        : '';
      hlsScript = document.createElement('script');
      hlsScript.src = `${basePrefix}/hls.min.js`;
      document.head.appendChild(hlsScript);
    }
    hlsScript.addEventListener('load', () => callback(), { once: true });
    hlsScript.addEventListener('error', () => callback(), { once: true });
  }

  function initWatchPlayer() {
    const path = normalizeRoutePath(window.location.pathname);
    if (!path.startsWith('/watch/')) {
      cleanupWatchPlayer();
      return;
    }

    cleanupWatchPlayer();
    if (document.body) {
      document.body.classList.add('kaira-watching');
    }
    // Ensure homepage chrome is hidden even on direct reloads / static-host rewrites to /watch/*
    document.querySelectorAll('.site-header, header, nav.tab-bar, footer, main').forEach((el) => {
      if (!el.closest('.watch-root')) el.style.display = 'none';
    });
    const sessionId = activeWatchSessionId;

    // 1. Ensure player stylesheets are loaded (base-path safe for GitHub Pages)
    if (!document.querySelector('link[href*="0svyhf-62ag72.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = withBasePath('/_next/static/chunks/0svyhf-62ag72.css');
      document.head.appendChild(link);
    }
    if (!document.querySelector('link[href*="0u-qimbv7y_v5.css"]')) {
      const link2 = document.createElement('link');
      link2.rel = 'stylesheet';
      link2.href = withBasePath('/_next/static/chunks/0u-qimbv7y_v5.css');
      document.head.appendChild(link2);
    }

    // 2. Parse route: /watch/anime/<id>/<ep> OR /watch/<slug>[/sXeY]
    const parts = path.replace(/^\/watch\//, '').replace(/\/$/, '').split('/').filter(Boolean);
    const urlParams = new URLSearchParams(window.location.search);
    const isAnimeRoute = parts[0] === 'anime' && parts.length >= 2;

    const rawPart0 = parts[0] || '';
    const decodedPart0 = (() => { try { return decodeURIComponent(rawPart0); } catch { return rawPart0; } })();
    let titleSlug = isAnimeRoute ? `anime-${parts[1]}` : decodedPart0;
    let animeId = isAnimeRoute ? parts[1] : null;
    let season = 1;
    let episode = 1;
    let hasEpisodeSegment = false;

    if (isAnimeRoute) {
      episode = parseInt(parts[2], 10) || 1;
      hasEpisodeSegment = true;
    } else if (parts.length > 1) {
      const match = parts[1].match(/s(\d+)e(\d+)/i);
      if (match) {
        season = parseInt(match[1], 10);
        episode = parseInt(match[2], 10);
        hasEpisodeSegment = true;
      }
    } else {
      if (urlParams.has('s')) {
        season = parseInt(urlParams.get('s'), 10) || 1;
        hasEpisodeSegment = true;
      }
      if (urlParams.has('e')) {
        episode = parseInt(urlParams.get('e'), 10) || 1;
        hasEpisodeSegment = true;
      }
    }

    // 3. Locate or create .watch-root
    let watchRoot = document.querySelector('.watch-root');
    if (!watchRoot) {
      watchRoot = document.createElement('div');
      watchRoot.className = 'watch-root';
      document.body.prepend(watchRoot);
    }
    watchRoot.style.display = 'block';

    watchRoot.innerHTML = '<div class="watch-wait" style="background:#000;width:100%;height:100dvh;display:flex;align-items:center;justify-content:center;color:#fff;"><div class="fx-spinner" style="width:2.5rem;height:2.5rem;border:3px solid rgba(255,255,255,0.2);border-top-color:var(--color-flare, #f59e0b);border-radius:50%;animation:spin 0.8s linear infinite;"></div></div>';

    function renderPlayerError(titleText, message, backUrl) {
      if (sessionId !== activeWatchSessionId) return;
      watchRoot.innerHTML = `
        <div class="watch-stage" style="background:#000;width:100%;height:100dvh;position:fixed;top:0;left:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:2rem;text-align:center;color:#fff;">
          <h2 style="font-size:1.5rem;font-weight:700;margin:0;">${escapeHtml(titleText)}</h2>
          <p style="max-width:28rem;color:rgba(255,255,255,0.68);margin:0;font-size:0.95rem;">${escapeHtml(message)}</p>
          <a href="${escapeAttr(backUrl)}" class="btn btn-primary" style="margin-top:0.5rem;">Go back</a>
        </div>
      `;
    }

    // 4. Resolve real title metadata & stream sources (works locally AND on static GitHub Pages)
    async function loadAndRender() {
      try {
        if (isAnimeRoute) {
          const isDub = urlParams.get('dub') === '1';
          const animeApiPath = `/api/sources/anime/${encodeURIComponent(animeId)}/${episode}${isDub ? '?dub=1' : ''}`;
          const animeRes = await fetchApiJsonWithMeta(animeApiPath).catch(() => null);
          const sourcesData = animeRes ? animeRes.data : null;
          if (sessionId !== activeWatchSessionId) return;

          const serverList = (sourcesData && Array.isArray(sourcesData.sources) ? sourcesData.sources : [])
            .filter(s => s && s.name && s.src)
            .map(s => {
              const src = String(s.src).startsWith('/api/') && animeRes?.usedProxy && animeRes?.proxyBase
                ? `${animeRes.proxyBase}${s.src}`
                : s.src;
              return { ...s, src, name: s.name === 'Flicx' ? 'Kaira' : s.name };
            });

          if (serverList.length === 0) {
            renderPlayerError(
              `Anime Episode ${episode}`,
              'No playback sources are currently available for this anime episode.',
              withBasePath(`/anime/${encodeURIComponent(animeId)}`)
            );
            return;
          }

          renderPlayer(
            { title: sourcesData?.title || `Anime #${animeId}`, year: '', kind: 'anime' },
            serverList,
            true,
            1,
            episode,
            animeId,
            withBasePath(`/anime/${encodeURIComponent(animeId)}`)
          );
          return;
        }

        // Standard movie or TV episode: resolve exact IMDb ID via local API -> catalog-index -> detail HTML -> Cinemeta CORS
        const titleInfo = await resolveTitleMeta(titleSlug, hasEpisodeSegment ? 'show' : '');
        if (sessionId !== activeWatchSessionId) return;

        if (!titleInfo) {
          const cleanFallback = titleSlug.replace(/-\d{4}$/, '').split('-').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Title';
          renderPlayerError(
            cleanFallback,
            'Could not find metadata or playback sources for this title.',
            withBasePath(hasEpisodeSegment ? `/tv/${titleSlug}` : `/movie/${titleSlug}`)
          );
          return;
        }

        const imdbId = titleInfo.imdbId || titleInfo.id;
        const isShow = hasEpisodeSegment || titleInfo.kind === 'show';
        const backUrl = withBasePath(isShow ? `/tv/${titleSlug}` : `/movie/${titleSlug}`);

        if (!imdbId) {
          renderPlayerError(titleInfo.title || titleSlug, 'No stream identifier found for this title.', backUrl);
          return;
        }

        const serverList = await resolveStreamSources(imdbId, isShow, season, episode);
        if (sessionId !== activeWatchSessionId) return;

        if (serverList.length === 0) {
          renderPlayerError(
            titleInfo.title || titleSlug,
            'No streaming sources are available for this title right now. It may be an upcoming release.',
            backUrl
          );
          return;
        }

        renderPlayer(titleInfo, serverList, isShow, season, episode, imdbId, backUrl);
      } catch (err) {
        if (sessionId !== activeWatchSessionId) return;
        renderPlayerError('Playback error', 'Something went wrong while loading this stream.', withBasePath('/'));
      }
    }

    loadAndRender();

    // 5. Render Apple TV / tvOS Style Video Player with Cast, Real Subtitles, Info & Chapters
    function renderPlayer(titleInfo, servers, isShow, seasonNum, episodeNum, imdbId, backUrl) {
      if (sessionId !== activeWatchSessionId) return;

      const rawTitle = String(titleInfo.title || titleSlug.replace(/-\d{4}$/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).trim();
      const yearStr = titleInfo.year ? String(titleInfo.year).trim() : '';
      const strippedYearTitle = yearStr ? rawTitle.replace(new RegExp(`(?:\\s*\\(${yearStr}\\)|\\s+${yearStr})$`), '').trim() : rawTitle;
      const cleanTitle = strippedYearTitle || rawTitle;
      const synopsisText = String(titleInfo.description || '').trim();
      const ratingText = titleInfo.rating ? String(titleInfo.rating).trim() : '';
      const genresList = Array.isArray(titleInfo.genres) ? titleInfo.genres.filter(Boolean) : [];
      const posterUrl = titleInfo.poster || (imdbId ? `https://s.fli.cx/a/poster/medium/${encodeURIComponent(imdbId)}/img` : '');

      let savedServerName = 'Kaira';
      try { savedServerName = localStorage.getItem('flicx:player:server') || 'Kaira'; } catch {}
      let currentServerIndex = servers.findIndex(s => s.name === savedServerName);
      if (currentServerIndex === -1) currentServerIndex = 0;
      let currentServer = servers[currentServerIndex];

      const SUBTITLE_LANG_NAMES = {
        en: 'English (US)', 'en-US': 'English (US)', 'en-GB': 'English (UK)',
        ar: 'Arabic', bg: 'Bulgarian', bn: 'Bengali', cs: 'Czech', da: 'Danish',
        de: 'German', el: 'Greek', es: 'Spanish', 'es-419': 'Spanish (Latin America)',
        'es-ES': 'Spanish (Spain)', et: 'Estonian', fa: 'Persian', fi: 'Finnish',
        fr: 'French', he: 'Hebrew', hi: 'Hindi', hr: 'Croatian', hu: 'Hungarian',
        id: 'Indonesian', is: 'Icelandic', it: 'Italian', ja: 'Japanese', ko: 'Korean',
        lv: 'Latvian', mk: 'Macedonian', ml: 'Malayalam', mn: 'Mongolian', ms: 'Malay',
        nl: 'Dutch', no: 'Norwegian', pl: 'Polish', pt: 'Portuguese',
        'pt-BR': 'Portuguese (Brazil)', ro: 'Romanian', ru: 'Russian', sk: 'Slovak',
        sq: 'Albanian', sr: 'Serbian', sv: 'Swedish', th: 'Thai', tr: 'Turkish',
        uk: 'Ukrainian', vi: 'Vietnamese', zh: 'Chinese, Simplified',
        'zh-Hans': 'Chinese, Simplified', 'zh-Hant': 'Chinese, Traditional',
        yue: 'Cantonese, Traditional'
      };

      function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const total = Math.floor(seconds);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
      }

      function formatRemaining(cur, dur) {
        if (!Number.isFinite(dur) || dur <= 0) return '-0:00';
        const rem = Math.max(0, dur - (Number.isFinite(cur) && cur > 0 ? cur : 0));
        return `-${formatTime(rem)}`;
      }

      function formatSubLabel(code, sdh) {
        const clean = String(code || '').trim();
        const base = SUBTITLE_LANG_NAMES[clean] || SUBTITLE_LANG_NAMES[clean.toLowerCase()] || clean.toUpperCase() || 'Unknown';
        return sdh ? `${base} CC` : base;
      }

      function deduplicateSubtitles(rawTracks) {
        const valid = (Array.isArray(rawTracks) ? rawTracks : []).filter(t => t && t.src && t.language);
        const byKey = new Map();
        for (const t of valid) {
          const lang = normalizeSubLangCode(t.language) || String(t.language).trim();
          const isSdh = Boolean(t.sdh);
          const key = lang.toLowerCase() === 'en' ? `en:${isSdh ? 'cc' : 'std'}` : lang.toLowerCase();
          const cleanSrc = String(t.src).trim();
          const existing = byKey.get(key);
          if (!existing) {
            byKey.set(key, {
              id: `${key}:${byKey.size}`,
              language: lang,
              label: formatSubLabel(lang, lang.toLowerCase() === 'en' ? isSdh : false),
              src: cleanSrc,
              candidates: [cleanSrc],
              sdh: isSdh,
              source: t.source || 'OpenSubtitles'
            });
          } else if (existing.candidates.length < 3 && !existing.candidates.includes(cleanSrc)) {
            existing.candidates.push(cleanSrc);
          }
        }
        const sorted = Array.from(byKey.values()).sort((a, b) => {
          const aEn = a.language.toLowerCase().startsWith('en') ? 0 : 1;
          const bEn = b.language.toLowerCase().startsWith('en') ? 0 : 1;
          if (aEn !== bEn) return aEn - bEn;
          if (aEn === 0 && bEn === 0 && a.sdh !== b.sdh) return a.sdh ? 1 : -1;
          return a.label.localeCompare(b.label);
        });
        const autoTrack = sorted.find(t => t.language.toLowerCase().startsWith('en')) || sorted[0] || null;
        return [
          { id: 'off', language: 'off', label: 'Off', src: null, candidates: [] },
          {
            id: 'auto',
            language: autoTrack ? autoTrack.language : 'en',
            label: 'Auto',
            src: autoTrack ? autoTrack.src : null,
            candidates: autoTrack ? [...autoTrack.candidates] : [],
            source: autoTrack?.source
          },
          ...sorted
        ];
      }

      function buildChapters(dur) {
        if (!Number.isFinite(dur) || dur < 60) return [];
        const labels = isShow
          ? ['Cold Open', 'Opening Credits', 'Act I', 'Act II', 'Climax', 'Ending']
          : ['Opening', 'Act I', 'Rising Action', 'Midpoint', 'Act II', 'Climax', 'Finale'];
        const count = dur < 1800 ? 4 : labels.length;
        return labels.slice(0, count).map((title, idx) => {
          const startSeconds = idx === 0 ? 0 : Math.floor((dur * idx) / count);
          return { index: idx + 1, title, startSeconds, timeLabel: formatTime(startSeconds) };
        });
      }

      try {
        document.title = `Watch ${cleanTitle} · Kaira`;
      } catch {}

      watchRoot.innerHTML = `
        <div class="watch-stage" style="background:#000;width:100%;height:100dvh;position:fixed;top:0;left:0;z-index:9999;user-select:none;">
          <div class="fx-player fx-theme atv-player" style="--fx-aspect:1.7777777777777777;width:100%;height:100%;background:#000;position:relative;overflow:hidden;" data-fx-page="" data-imdb="${escapeAttr(imdbId)}">

            <!-- Video Stage -->
            <div class="fx-video-wrap" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;">
              <video id="flicx-video" class="fx-video" playsinline webkit-playsinline="true" preload="auto"${posterUrl ? ` poster="${escapeAttr(posterUrl)}"` : ''} crossorigin="anonymous" x-webkit-airplay="allow" style="width:100%;height:100%;object-fit:contain;background:#000;display:block;position:relative;z-index:1;"></video>
              <iframe id="flicx-embed-frame" class="atv-embed-frame" title="${escapeAttr(cleanTitle)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" referrerpolicy="origin" style="display:none;position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;z-index:2;"></iframe>
              <div id="atv-cast-banner" class="atv-cast-banner" aria-live="polite" aria-hidden="true">
                <div class="atv-cast-banner-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="32" height="32"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><line x1="2" y1="20" x2="2.01" y2="20"/></svg>
                </div>
                <div class="atv-cast-banner-label" id="atv-cast-device-label">Casting to TV</div>
                <div class="atv-cast-banner-title">${escapeHtml(cleanTitle)}</div>
                <div class="atv-cast-banner-actions">
                  <button type="button" id="atv-cast-banner-play" class="atv-cast-banner-btn">Pause on TV</button>
                  <button type="button" id="atv-cast-banner-stop" class="atv-cast-banner-btn atv-cast-banner-stop">Stop Casting</button>
                </div>
              </div>
              <div id="atv-subtitle-cue" class="atv-subtitle-cue" aria-live="polite" aria-hidden="true"></div>
              <div id="flicx-buffering" class="fx-buffering" style="position:absolute;display:none;pointer-events:none;z-index:4;">
                <div class="fx-spinner" style="width:2.85rem;height:2.85rem;border:3px solid rgba(255,255,255,0.22);border-top-color:#ffffff;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
              </div>
              <div id="atv-status-pill" class="atv-status-pill" role="status" aria-live="polite" aria-hidden="true"></div>
              <div id="atv-speed-boost-pill" class="atv-speed-boost-pill" role="status" aria-live="polite" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true"><path d="M13 6v12l8.5-6L13 6zM4 6v12l8.5-6L4 6z"/></svg>
                <span>2&times; Speed</span>
              </div>
              <div id="atv-seek-ripple-left" class="atv-seek-ripple atv-seek-ripple-left" aria-hidden="true">
                <div class="atv-seek-ripple-inner">
                  <span class="atv-seek-chevrons atv-seek-chevrons-left" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M15.5 5l-7 7 7 7V5z"/></svg>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M15.5 5l-7 7 7 7V5z"/></svg>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M15.5 5l-7 7 7 7V5z"/></svg>
                  </span>
                  <span id="atv-seek-label-left" class="atv-seek-label">-10s</span>
                </div>
              </div>
              <div id="atv-seek-ripple-right" class="atv-seek-ripple atv-seek-ripple-right" aria-hidden="true">
                <div class="atv-seek-ripple-inner">
                  <span class="atv-seek-chevrons atv-seek-chevrons-right" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8.5 5l7 7-7 7V5z"/></svg>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8.5 5l7 7-7 7V5z"/></svg>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8.5 5l7 7-7 7V5z"/></svg>
                  </span>
                  <span id="atv-seek-label-right" class="atv-seek-label">+10s</span>
                </div>
              </div>
              <div id="atv-resume-pill" class="atv-resume-pill" role="status" aria-live="polite" aria-hidden="true">
                <span id="atv-resume-text">Resumed</span>
                <button type="button" id="atv-resume-restart" class="atv-resume-restart-btn">Start Over</button>
              </div>
              ${(isShow || isAnimeRoute) ? `
              <button type="button" id="atv-skip-intro-btn" class="atv-skip-intro-btn" aria-label="Skip Intro" aria-hidden="true">
                <span>Skip Intro</span>
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true"><path d="M5 5.5v13l9-6.5-9-6.5zm10.5 0v13h2.5v-13h-2.5z"/></svg>
              </button>
              <div id="atv-upnext-card" class="atv-upnext-card" role="region" aria-label="Up Next episode" aria-hidden="true">
                <div class="atv-upnext-head">
                  <span class="atv-upnext-kicker" id="atv-upnext-kicker">Up Next</span>
                  <button type="button" id="atv-upnext-dismiss" class="atv-upnext-hide-btn">Hide</button>
                </div>
                <button type="button" id="atv-upnext-play" class="atv-upnext-preview" aria-label="Play next episode">
                  <img id="atv-upnext-thumb" class="atv-upnext-thumb" src="${escapeAttr(safeImageUrl(titleInfo.still || posterUrl || ''))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="${(titleInfo.still || posterUrl) ? '' : 'display:none;'}" />
                  <span class="atv-upnext-scrim" aria-hidden="true"></span>
                  <span class="atv-upnext-play-circle" aria-hidden="true">
                    <svg class="atv-upnext-ring-svg" viewBox="0 0 60 60" width="60" height="60">
                      <circle class="atv-upnext-ring-track" cx="30" cy="30" r="27" fill="none" stroke-width="3"></circle>
                      <circle id="atv-upnext-ring" class="atv-upnext-ring-fill" cx="30" cy="30" r="27" fill="none" stroke-width="3" stroke-dasharray="169.65" stroke-dashoffset="169.65"></circle>
                    </svg>
                    <svg class="atv-upnext-play-icon" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5.14v14l11-7-11-7z"/></svg>
                  </span>
                  <span class="atv-upnext-overlay-bottom">
                    <span class="atv-upnext-meta">
                      <span class="atv-upnext-title" id="atv-upnext-title">${isAnimeRoute ? `E${episodeNum + 1}` : `S${seasonNum} &middot; E${episodeNum + 1}`}</span>
                      <span class="atv-upnext-ep-title" id="atv-upnext-ep-title">${escapeHtml(cleanTitle)}</span>
                    </span>
                    <span class="atv-upnext-badges" id="atv-upnext-badges">
                      <span class="atv-upnext-badge" id="atv-upnext-cc-badge" style="display:none;">CC</span>
                      <span class="atv-upnext-badge" id="atv-upnext-q-badge">${escapeHtml(currentServer.quality || 'HD')}</span>
                    </span>
                  </span>
                </button>
              </div>
              ` : ''}
            </div>

            <!-- Apple TV Floating UI -->
            <div class="fx-ui atv-ui" data-chrome="" style="position:absolute;inset:0;pointer-events:none;z-index:10;display:flex;flex-direction:column;justify-content:space-between;">

              <!-- SUBTLE TOP BAR (Back + Quick Server/Fullscreen) -->
              <div class="fx-top atv-top">
                <div class="fx-top-start" style="display:flex;align-items:center;gap:0.75rem;pointer-events:auto;">
                  <a class="atv-top-circle" href="${escapeAttr(backUrl)}" aria-label="Back" title="Back">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg>
                  </a>
                </div>

                <div class="fx-top-end" style="display:flex;align-items:center;gap:0.65rem;pointer-events:auto;">
                  <div class="fx-server" style="position:relative;">
                    <button type="button" class="fx-pill fx-btn-server atv-server-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Select stream server">
                      <span class="fx-server-name">${escapeHtml(currentServer.name)}</span>
                      ${currentServer.quality ? `<span class="atv-server-sep" aria-hidden="true">&middot;</span><span id="fx-active-quality" class="atv-server-qual">${escapeHtml(currentServer.quality)}</span>` : '<span id="fx-active-quality" class="atv-server-qual">HD</span>'}
                      <svg class="fx-server-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="transition:transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>

                    <div class="fx-menu fx-server-menu atv-glass-popover atv-server-popover" role="menu" aria-label="Servers" aria-hidden="true">
                      <div class="atv-pop-heading">SERVERS</div>
                      <div class="atv-pop-list">
                        ${servers.map((srv, idx) => `
                          <button type="button" class="fx-menu-item atv-pop-item" data-idx="${idx}" role="menuitemradio" aria-checked="${idx === currentServerIndex}">
                            <span class="atv-pop-item-label">
                              <span>${escapeHtml(srv.name)}</span>
                              ${srv.quality ? `<span class="atv-pop-meta">${escapeHtml(srv.quality)}</span>` : ''}
                              ${srv.group === 'dedicated' ? '<span class="atv-pop-meta">Dedicated</span>' : ''}
                            </span>
                            <span class="atv-pop-check" aria-hidden="true">${idx === currentServerIndex ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</span>
                          </button>
                        `).join('')}
                      </div>
                    </div>
                  </div>

                  <button type="button" id="atv-top-cast-btn" class="atv-top-circle atv-top-cast-btn" aria-label="Cast to TV" title="Cast / External Player">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><line x1="2" y1="20" x2="2.01" y2="20"/></svg>
                  </button>
                  <button type="button" class="atv-top-circle fx-btn-fullscreen" aria-label="Fullscreen" title="Fullscreen (F)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                  </button>
                </div>
              </div>

              <!-- CENTER PLAY BUTTON (shown while paused) -->
              <button type="button" id="fx-center-play" class="kaira-center-play atv-center-play" aria-label="Play video" title="Play (Space)" aria-hidden="true">
                <svg viewBox="0 0 256 256" fill="currentColor" width="32" height="32" style="display:block;transform:translateX(1px);"><path d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z"/></svg>
              </button>

              <!-- APPLE TV BOTTOM OVERLAY -->
              <div class="fx-bottom atv-bottom">

                <!-- Expandable Apple TV Info / Chapters Drawer (slides neatly above title/scrubber) -->
                <div id="atv-drawer-info" class="atv-drawer atv-glass-panel" role="region" aria-label="Title information" aria-hidden="true">
                  <div class="atv-info-grid">
                    ${posterUrl ? `<img class="atv-info-poster" src="${escapeAttr(posterUrl)}" alt="${escapeAttr(cleanTitle)}" referrerpolicy="no-referrer" />` : ''}
                    <div class="atv-info-body">
                      <div class="atv-info-title-row">
                        <h2 class="atv-info-heading">${escapeHtml(cleanTitle)}</h2>
                        <span class="atv-info-meta">
                          ${yearStr ? `<span>${escapeHtml(yearStr)}</span>` : ''}
                          ${ratingText ? `<span aria-hidden="true">&middot;</span><span>&starf; ${escapeHtml(ratingText)}</span>` : ''}
                          ${genresList.length ? `<span aria-hidden="true">&middot;</span><span>${escapeHtml(genresList.slice(0, 3).join(', '))}</span>` : ''}
                          ${currentServer.quality ? `<span aria-hidden="true">&middot;</span><span>${escapeHtml(currentServer.quality)}</span>` : ''}
                        </span>
                      </div>
                      <p class="atv-info-synopsis">${escapeHtml(synopsisText || (isShow ? `Streaming ${isAnimeRoute ? `Episode ${episodeNum}` : `Season ${seasonNum}, Episode ${episodeNum}`} via ${currentServer.name}.` : `Streaming on Kaira via ${currentServer.name} in ${currentServer.quality || 'HD'}.`))}</p>
                    </div>
                  </div>
                </div>

                <div id="atv-drawer-chapters" class="atv-drawer atv-glass-panel" role="region" aria-label="Chapters" aria-hidden="true">
                  <div class="atv-pop-heading" style="padding:0 0 0.65rem 0;color:rgba(255,255,255,0.68);">CHAPTERS</div>
                  <div id="atv-chapters-list" class="atv-chapters-strip"></div>
                </div>

                <!-- ROW 1: Bold Apple TV Title (left) + Floating Popover & Circular Icon Cluster (right) -->
                <div class="atv-header-row">
                  <div class="atv-title-block">
                    ${isShow ? `<div class="atv-kicker">${isAnimeRoute ? `Episode ${episodeNum}` : `Season ${seasonNum} &middot; Episode ${episodeNum}`}</div>` : ''}
                    <h1 class="atv-title">${escapeHtml(cleanTitle)}</h1>
                  </div>

                  <div class="atv-actions-wrap">
                    <!-- Floating Apple TV Frosted Popover (Subtitles / Audio / Cast) -->
                    <div id="atv-popover-subs" class="atv-popover atv-glass-popover" role="menu" aria-label="Subtitles" aria-hidden="true">
                      <div class="atv-pop-heading">SUBTITLES</div>
                      <div id="atv-subs-list" class="atv-pop-list">
                        <div class="atv-pop-empty">Loading subtitles&hellip;</div>
                      </div>
                      <div class="atv-pop-divider"></div>
                      <div class="atv-sub-tools">
                        <form id="atv-sub-search-form" class="atv-sub-search-row">
                          <input type="search" id="atv-sub-search-input" class="atv-sub-search-input" placeholder="Search OpenSubtitles…" aria-label="Search OpenSubtitles by title" />
                          <button type="submit" id="atv-sub-search-btn" class="atv-sub-tool-btn">Find</button>
                        </form>
                        <button type="button" id="atv-sub-file-btn" class="atv-sub-file-btn">Load local .srt / .vtt file</button>
                        <input type="file" id="atv-sub-file-input" accept=".srt,.vtt,text/vtt,application/x-subrip" hidden />
                      </div>
                    </div>

                    <div id="atv-popover-audio" class="atv-popover atv-glass-popover" role="dialog" aria-label="Audio settings" aria-hidden="true">
                      <div class="atv-pop-heading">AUDIO</div>
                      <div class="atv-audio-section">
                        <div class="atv-audio-vol-row">
                          <button type="button" id="fx-btn-mute" class="atv-pop-mini-btn" aria-label="Mute" title="Mute (M)">
                            <svg id="fx-icon-volume" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                            <svg id="fx-icon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="display:none;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                          </button>
                          <input type="range" id="fx-volume-slider" class="atv-vol-slider" min="0" max="1" step="0.05" value="1" aria-label="Volume" />
                          <span id="atv-vol-pct" class="atv-vol-pct">100%</span>
                        </div>
                      </div>
                      <div class="atv-pop-divider"></div>
                      <div class="atv-pop-heading">PLAYBACK SPEED</div>
                      <div id="atv-speed-list" class="atv-pop-list">
                        ${[0.75, 1, 1.25, 1.5, 2].map(rate => `
                          <button type="button" class="atv-pop-item atv-speed-item" data-rate="${rate}" role="menuitemradio" aria-checked="${rate === 1}">
                            <span class="atv-pop-item-label">${rate === 1 ? 'Normal (1&times;)' : `${rate}&times;`}</span>
                            <span class="atv-pop-check" aria-hidden="true">${rate === 1 ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</span>
                          </button>
                        `).join('')}
                      </div>
                      <div class="atv-pop-divider"></div>
                      <div class="atv-pop-heading">SOUND MODE</div>
                      <div class="atv-pop-list">
                        <button type="button" class="atv-pop-item atv-sound-mode-item" data-mode="full" role="menuitemradio" aria-checked="true">
                          <span class="atv-pop-item-label">Full Dynamic Range</span>
                          <span class="atv-pop-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg></span>
                        </button>
                        <button type="button" class="atv-pop-item atv-sound-mode-item" data-mode="reduce" role="menuitemradio" aria-checked="false">
                          <span class="atv-pop-item-label">Reduce Loud Sounds</span>
                          <span class="atv-pop-check" aria-hidden="true"></span>
                        </button>
                      </div>
                    </div>

                    <div id="atv-popover-cast" class="atv-popover atv-glass-popover" role="dialog" aria-label="Cast and AirPlay" aria-hidden="true">
                      <div class="atv-pop-heading">CAST &amp; AIRPLAY</div>
                      <div id="atv-cast-status" class="atv-cast-status">Ready to connect to a TV or external player</div>
                      <div class="atv-pop-list">
                        <button type="button" id="atv-cast-remote" class="atv-pop-item" role="menuitem">
                          <span class="atv-pop-item-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><line x1="2" y1="20" x2="2.01" y2="20"/></svg>
                            <span>Cast to TV / Chromecast</span>
                          </span>
                        </button>
                        <button type="button" id="atv-cast-disconnect" class="atv-pop-item atv-pop-item-danger" role="menuitem" style="display:none;">
                          <span class="atv-pop-item-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            <span>Stop Casting</span>
                          </span>
                        </button>
                        <button type="button" id="atv-cast-airplay" class="atv-pop-item" role="menuitem">
                          <span class="atv-pop-item-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"/><polygon points="12 15 17 21 7 21 12 15"/></svg>
                            <span>AirPlay Display</span>
                          </span>
                        </button>
                        <div class="atv-pop-divider"></div>
                        <button type="button" id="atv-cast-vlc" class="atv-pop-item" role="menuitem">
                          <span class="atv-pop-item-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            <span>Open in VLC Player</span>
                          </span>
                        </button>
                        <button type="button" id="atv-cast-infuse" class="atv-pop-item" role="menuitem">
                          <span class="atv-pop-item-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                            <span>Open in Infuse (iOS / Apple TV)</span>
                          </span>
                        </button>
                        <button type="button" id="atv-cast-copy-stream" class="atv-pop-item" role="menuitem">
                          <span class="atv-pop-item-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            <span>Copy Stream URL (VLC / Infuse)</span>
                          </span>
                        </button>
                        <button type="button" id="atv-cast-share-link" class="atv-pop-item" role="menuitem">
                          <span class="atv-pop-item-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                            <span>Copy Watch Link</span>
                          </span>
                        </button>
                      </div>
                    </div>

                    <!-- Apple TV Circular Icon Buttons (Subtitles, Audio Waveform, Cast, PiP) -->
                    <div class="atv-actions">
                      <button type="button" id="atv-btn-subs" class="atv-icon-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Subtitles" title="Subtitles (C)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="21" height="21">
                          <path d="M21 15a2 2 0 0 1-2 2H8l-4 3V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>
                          <line x1="8" y1="9" x2="16" y2="9"/>
                          <line x1="8" y1="13" x2="13.5" y2="13"/>
                        </svg>
                      </button>

                      <button type="button" id="atv-btn-audio" class="atv-icon-btn" aria-haspopup="dialog" aria-expanded="false" aria-label="Audio and speed" title="Audio">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="21" height="21">
                          <rect x="3.5" y="13" width="2.1" height="6" rx="1.05"/>
                          <rect x="7.5" y="9" width="2.1" height="10" rx="1.05"/>
                          <rect x="11.5" y="5" width="2.1" height="14" rx="1.05"/>
                          <rect x="15.5" y="9.5" width="2.1" height="9.5" rx="1.05"/>
                          <rect x="19.5" y="13.5" width="2.1" height="5.5" rx="1.05"/>
                        </svg>
                      </button>

                      <button type="button" id="atv-btn-cast" class="atv-icon-btn" aria-haspopup="dialog" aria-expanded="false" aria-label="Cast to TV" title="Cast / AirPlay">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="21" height="21">
                          <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>
                          <line x1="2" y1="20" x2="2.01" y2="20"/>
                        </svg>
                      </button>

                      <button type="button" id="atv-btn-pip" class="atv-icon-btn" aria-pressed="false" aria-label="Picture in Picture" title="Picture in Picture (P)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="21" height="21">
                          <rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/>
                          <rect x="11.5" y="11" width="7.5" height="5.5" rx="1.2" fill="currentColor"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- ROW 2: Apple TV Timeline Scrubber + Floating Playhead Elapsed & Remaining Time -->
                <div class="atv-scrubber-section">
                  <div class="fx-scrub-wrap atv-scrub-wrap" role="slider" aria-label="Seek timeline" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
                    <div class="fx-scrub-track atv-scrub-track">
                      <div id="fx-scrub-buffered" class="atv-scrub-buffered" style="width:0%;"></div>
                      <div id="fx-scrub-played" class="atv-scrub-played" style="width:0%;"></div>
                      <div id="fx-scrub-thumb" class="atv-scrub-thumb" style="left:0%;"></div>
                    </div>
                  </div>

                  <div class="atv-time-row">
                    <span id="fx-time-now" class="atv-time-elapsed">0:00</span>
                    <button type="button" id="fx-time-remaining" class="atv-time-remaining" title="Toggle remaining / total time">-0:00</button>
                  </div>
                </div>

                <!-- ROW 3: Apple TV Bottom Tabs (Info, Chapters) + Transport & Inline Volume -->
                <div class="atv-footer-row">
                  <div class="atv-tabs" role="tablist" aria-label="Playback details">
                    <button type="button" id="atv-tab-info" class="atv-tab-btn" role="tab" aria-selected="false" aria-controls="atv-drawer-info">Info</button>
                    <button type="button" id="atv-tab-chapters" class="atv-tab-btn" role="tab" aria-selected="false" aria-controls="atv-drawer-chapters">Chapters</button>
                  </div>

                  <div class="atv-transport">
                    <button type="button" id="fx-btn-back10" class="atv-transport-btn" aria-label="Rewind 10 seconds" title="Back 10s (Left Arrow)">
                      <svg viewBox="0 0 256 256" fill="currentColor" width="19" height="19"><path d="M128,48a80,80,0,1,1-56.57,23.43,8,8,0,0,1,11.32,11.32A64,64,0,1,0,128,64H83.31l18.35,18.34a8,8,0,0,1-11.32,11.32l-32-32a8,8,0,0,1,0-11.32l32-32a8,8,0,0,1,11.32,11.32L83.31,48ZM112,108v48a8,8,0,0,1-16,0V122.4l-4.21,2.52a8,8,0,1,1-8.23-13.72l16-9.6A8,8,0,0,1,112,108Zm56,24c0,16.57-9.87,28-24,28s-24-11.43-24-28,9.87-28,24-28S168,115.43,168,132Zm-16,0c0-8.65-3.6-12-8-12s-8,3.35-8,12,3.6,12,8,12S152,140.65,152,132Z"/></svg>
                    </button>
                    <button type="button" id="fx-btn-play" class="atv-transport-btn" aria-label="Play or pause" title="Play/Pause (Space)">
                      <svg id="fx-icon-play" viewBox="0 0 256 256" fill="currentColor" width="20" height="20"><path d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z"/></svg>
                      <svg id="fx-icon-pause" viewBox="0 0 256 256" fill="currentColor" width="20" height="20" style="display:none;"><path d="M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z"/></svg>
                    </button>
                    <button type="button" id="fx-btn-fwd10" class="atv-transport-btn" aria-label="Forward 10 seconds" title="Forward 10s (Right Arrow)">
                      <svg viewBox="0 0 256 256" fill="currentColor" width="19" height="19"><path d="M128,48a80,80,0,1,0,56.57,23.43,8,8,0,0,0-11.32,11.32A64,64,0,1,1,128,64h44.69L154.34,82.34a8,8,0,0,0,11.32,11.32l32-32a8,8,0,0,0,0-11.32l-32-32a8,8,0,0,0-11.32,11.32L172.69,48ZM112,108v48a8,8,0,0,1-16,0V122.4l-4.21,2.52a8,8,0,1,1-8.23-13.72l16-9.6A8,8,0,0,1,112,108Zm56,24c0,16.57-9.87,28-24,28s-24-11.43-24-28,9.87-28,24-28S168,115.43,168,132Zm-16,0c0-8.65-3.6-12-8-12s-8,3.35-8,12,3.6,12,8,12S152,140.65,152,132Z"/></svg>
                    </button>
                    <div class="atv-inline-vol" role="group" aria-label="Volume controls">
                      <button type="button" id="fx-btn-inline-mute" class="atv-transport-btn atv-inline-mute-btn" aria-label="Mute" title="Mute (M)">
                        <svg id="fx-inline-icon-vol-high" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="19" height="19"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                        <svg id="fx-inline-icon-vol-low" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="19" height="19" style="display:none;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                        <svg id="fx-inline-icon-vol-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="19" height="19" style="display:none;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                      </button>
                      <input type="range" id="fx-inline-vol-slider" class="atv-inline-vol-slider" min="0" max="1" step="0.02" value="1" aria-label="Volume" style="--vol-pct:100%;" />
                    </div>
                    <button type="button" id="fx-btn-bottom-fs" class="atv-transport-btn" aria-label="Toggle fullscreen" title="Fullscreen (F)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      `;

      const playerStage = watchRoot.querySelector('.watch-stage');
      const playerEl = watchRoot.querySelector('.fx-player');
      const videoEl = watchRoot.querySelector('#flicx-video');
      const embedFrameEl = watchRoot.querySelector('#flicx-embed-frame');
      const subtitleCueEl = watchRoot.querySelector('#atv-subtitle-cue');
      const bufferingEl = watchRoot.querySelector('#flicx-buffering');
      const statusPillEl = watchRoot.querySelector('#atv-status-pill');
      const uiEl = watchRoot.querySelector('.fx-ui');
      const topBarEl = watchRoot.querySelector('.fx-top');
      const bottomBarEl = watchRoot.querySelector('.fx-bottom');
      const centerPlayBtn = watchRoot.querySelector('#fx-center-play');
      const playBtn = watchRoot.querySelector('#fx-btn-play');
      const back10Btn = watchRoot.querySelector('#fx-btn-back10');
      const fwd10Btn = watchRoot.querySelector('#fx-btn-fwd10');
      const iconPlay = watchRoot.querySelector('#fx-icon-play');
      const iconPause = watchRoot.querySelector('#fx-icon-pause');
      const muteBtn = watchRoot.querySelector('#fx-btn-mute');
      const iconVol = watchRoot.querySelector('#fx-icon-volume');
      const iconMuted = watchRoot.querySelector('#fx-icon-muted');
      const volSlider = watchRoot.querySelector('#fx-volume-slider');
      const volPctEl = watchRoot.querySelector('#atv-vol-pct');
      const inlineMuteBtn = watchRoot.querySelector('#fx-btn-inline-mute');
      const inlineVolSlider = watchRoot.querySelector('#fx-inline-vol-slider');
      const inlineIconVolHigh = watchRoot.querySelector('#fx-inline-icon-vol-high');
      const inlineIconVolLow = watchRoot.querySelector('#fx-inline-icon-vol-low');
      const inlineIconVolMuted = watchRoot.querySelector('#fx-inline-icon-vol-muted');
      const speedBoostPillEl = watchRoot.querySelector('#atv-speed-boost-pill');
      const seekRippleLeftEl = watchRoot.querySelector('#atv-seek-ripple-left');
      const seekRippleRightEl = watchRoot.querySelector('#atv-seek-ripple-right');
      const seekLabelLeftEl = watchRoot.querySelector('#atv-seek-label-left');
      const seekLabelRightEl = watchRoot.querySelector('#atv-seek-label-right');
      const upNextCardEl = watchRoot.querySelector('#atv-upnext-card');
      const upNextKickerEl = watchRoot.querySelector('#atv-upnext-kicker');
      const upNextPlayBtn = watchRoot.querySelector('#atv-upnext-play');
      const upNextDismissBtn = watchRoot.querySelector('#atv-upnext-dismiss');
      const upNextRingEl = watchRoot.querySelector('#atv-upnext-ring');
      const upNextThumbEl = watchRoot.querySelector('#atv-upnext-thumb');
      const upNextEpTitleEl = watchRoot.querySelector('#atv-upnext-ep-title');
      const upNextCcBadgeEl = watchRoot.querySelector('#atv-upnext-cc-badge');
      const upNextQBadgeEl = watchRoot.querySelector('#atv-upnext-q-badge');
      const skipIntroBtnEl = watchRoot.querySelector('#atv-skip-intro-btn');
      const subSearchForm = watchRoot.querySelector('#atv-sub-search-form');
      const subSearchInput = watchRoot.querySelector('#atv-sub-search-input');
      const subFileBtn = watchRoot.querySelector('#atv-sub-file-btn');
      const subFileInput = watchRoot.querySelector('#atv-sub-file-input');
      const timeNow = watchRoot.querySelector('#fx-time-now');
      const timeRemaining = watchRoot.querySelector('#fx-time-remaining');
      const scrubWrap = watchRoot.querySelector('.fx-scrub-wrap');
      const scrubTrack = watchRoot.querySelector('.fx-scrub-track');
      const scrubPlayed = watchRoot.querySelector('#fx-scrub-played');
      const scrubBuffered = watchRoot.querySelector('#fx-scrub-buffered');
      const scrubThumb = watchRoot.querySelector('#fx-scrub-thumb');
      const serverBtn = watchRoot.querySelector('.fx-btn-server');
      const serverName = watchRoot.querySelector('.fx-server-name');
      const serverChevron = watchRoot.querySelector('.fx-server-chevron');
      const serverMenu = watchRoot.querySelector('.fx-server-menu');
      const fsBtns = watchRoot.querySelectorAll('.fx-btn-fullscreen, #fx-btn-bottom-fs');

      // Apple TV popovers & buttons
      const subsBtn = watchRoot.querySelector('#atv-btn-subs');
      const audioBtn = watchRoot.querySelector('#atv-btn-audio');
      const castBtn = watchRoot.querySelector('#atv-btn-cast');
      const pipBtn = watchRoot.querySelector('#atv-btn-pip');
      const subsPopover = watchRoot.querySelector('#atv-popover-subs');
      const audioPopover = watchRoot.querySelector('#atv-popover-audio');
      const castPopover = watchRoot.querySelector('#atv-popover-cast');
      const subsListEl = watchRoot.querySelector('#atv-subs-list');
      const castStatusEl = watchRoot.querySelector('#atv-cast-status');
      const tabInfoBtn = watchRoot.querySelector('#atv-tab-info');
      const tabChaptersBtn = watchRoot.querySelector('#atv-tab-chapters');
      const drawerInfo = watchRoot.querySelector('#atv-drawer-info');
      const drawerChapters = watchRoot.querySelector('#atv-drawer-chapters');
      const chaptersListEl = watchRoot.querySelector('#atv-chapters-list');
      const resumePillEl = watchRoot.querySelector('#atv-resume-pill');
      const resumeTextEl = watchRoot.querySelector('#atv-resume-text');
      const resumeRestartBtn = watchRoot.querySelector('#atv-resume-restart');

      let currentHls = null;
      let hideTimeout = null;
      let statusTimeout = null;
      let resumePillTimeout = null;
      let singleTapTimer = null;
      let holdBoostTimer = null;
      let rippleHideTimer = null;
      let upNextCountdownTimer = null;
      let isDestroyed = false;
      let isAdjustingVolume = false;
      let lastNonZeroVolume = 0.8;
      let upNextDismissed = false;
      let upNextVisible = false;

      // Continue Watching tracking & auto-resume state
      const canonicalWatchUrl = isAnimeRoute
        ? `/watch/anime/${encodeURIComponent(animeId)}/${episodeNum}`
        : isShow
          ? `/watch/${encodeURIComponent(titleSlug)}/s${seasonNum}e${episodeNum}`
          : `/watch/${encodeURIComponent(titleSlug)}`;
      const canonicalDetailUrl = isAnimeRoute
        ? `/anime/${encodeURIComponent(animeId)}`
        : isShow
          ? `/tv/${encodeURIComponent(titleSlug)}`
          : `/movie/${encodeURIComponent(titleSlug)}`;
      const existingProgressEntry = getContinueWatchingBySlug(titleSlug);
      const savedResumeSeconds = urlParams.get('restart') === '1'
        ? 0
        : getResumeTimeForEntry(existingProgressEntry, seasonNum, episodeNum);
      let resumeTargetSeconds = savedResumeSeconds;
      let hasAppliedResume = resumeTargetSeconds < CONTINUE_WATCHING_MIN_SECONDS;
      let hasShownResumePill = false;
      let resumeAttemptCount = 0;
      let lastProgressSaveAt = 0;

      function hideResumePill() {
        clearTimeout(resumePillTimeout);
        if (resumePillEl) {
          resumePillEl.classList.remove('atv-visible');
          resumePillEl.setAttribute('aria-hidden', 'true');
        }
      }

      function showResumePill(seconds) {
        if (!resumePillEl || !resumeTextEl) return;
        resumeTextEl.textContent = `Resumed at ${formatResumeTimestamp(seconds)}`;
        resumePillEl.classList.add('atv-visible');
        resumePillEl.setAttribute('aria-hidden', 'false');
        clearTimeout(resumePillTimeout);
        resumePillTimeout = setTimeout(hideResumePill, 7500);
      }

      function tryApplyResumePosition(showPill = true) {
        if (isDestroyed || isEmbedMode || hasAppliedResume || resumeTargetSeconds < CONTINUE_WATCHING_MIN_SECONDS) {
          return false;
        }
        const dur = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
        if (dur > 0 && resumeTargetSeconds >= dur * CONTINUE_WATCHING_COMPLETE_RATIO) {
          hasAppliedResume = true;
          resumeTargetSeconds = 0;
          return false;
        }
        const target = dur > 0 ? Math.min(resumeTargetSeconds, Math.max(0, dur - 5)) : resumeTargetSeconds;
        const cur = Number(videoEl.currentTime) || 0;
        if (Math.abs(cur - target) <= 5) {
          hasAppliedResume = true;
          if (showPill && !hasShownResumePill) {
            hasShownResumePill = true;
            showResumePill(target);
          }
          updateTimeDisplay();
          return true;
        }
        if (videoEl.readyState < 1) return false;
        resumeAttemptCount += 1;
        try {
          videoEl.currentTime = target;
        } catch {}
        const afterCur = Number(videoEl.currentTime) || 0;
        if (Math.abs(afterCur - target) <= 5 || resumeAttemptCount >= 4) {
          hasAppliedResume = true;
          if (showPill && !hasShownResumePill && Math.abs(afterCur - target) <= 10) {
            hasShownResumePill = true;
            showResumePill(target);
          }
        }
        updateTimeDisplay();
        return hasAppliedResume;
      }

      function persistPlaybackProgress(force, modeOverride) {
        const mode = modeOverride || (isEmbedMode ? 'embed' : 'direct');
        const now = Date.now();
        if (!force && mode === 'direct' && now - lastProgressSaveAt < 4000) return;

        const cur = mode === 'embed' ? 0 : (Number(videoEl.currentTime) || 0);
        const dur = mode === 'embed' ? 0 : (Number.isFinite(videoEl.duration) ? videoEl.duration : 0);

        if (mode === 'direct') {
          // Never clobber saved progress while waiting for auto-resume to settle
          if (!hasAppliedResume && resumeTargetSeconds >= CONTINUE_WATCHING_MIN_SECONDS && cur < resumeTargetSeconds - 5) {
            return;
          }
          const metrics = computeProgressMetrics(cur, dur, 'direct');
          if (!metrics.shouldTrack && !metrics.isCompleted) return;
        }

        lastProgressSaveAt = now;
        upsertContinueWatchingProgress({
          slug: titleSlug,
          title: cleanTitle,
          kind: isAnimeRoute ? 'anime' : (isShow ? 'show' : 'movie'),
          imdbId: imdbId || undefined,
          year: yearStr || '',
          poster: posterUrl || '',
          rating: ratingText || '',
          genre: genresList[0] || '',
          watchUrl: canonicalWatchUrl,
          detailUrl: canonicalDetailUrl,
          season: isShow ? seasonNum : undefined,
          episode: (isShow || isAnimeRoute) ? episodeNum : undefined,
          currentTime: cur,
          duration: dur,
          mode,
          serverName: currentServer?.name || '',
          updatedAt: now
        });
      }

      if (resumeRestartBtn) {
        resumeRestartBtn.onclick = (e) => {
          e.stopPropagation();
          hideResumePill();
          resumeTargetSeconds = 0;
          hasAppliedResume = true;
          try { videoEl.currentTime = 0; } catch {}
          removeContinueWatchingBySlug(titleSlug);
          updateTimeDisplay();
          showPlayerStatus('Started from beginning');
          wakeControls();
        };
      }
      let isPointerOverControls = false;
      let showTotalInsteadOfRemaining = false;
      let activePopover = null; // 'subs' | 'audio' | 'cast' | 'server' | null
      let activeDrawer = null;  // 'info' | 'chapters' | null
      let subtitleOptions = [
        { id: 'off', language: 'off', label: 'Off', src: null },
        { id: 'auto', language: 'en', label: 'Auto', src: null }
      ];
      let selectedSubtitleId = 'off';
      let activeSubtitleCues = [];
      let subtitleFetchToken = 0;
      let isEmbedMode = false;
      let renderedChaptersDuration = 0;

      const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>';

      function showPlayerStatus(message) {
        if (!statusPillEl || isDestroyed) return;
        statusPillEl.textContent = message;
        statusPillEl.classList.add('atv-visible');
        statusPillEl.setAttribute('aria-hidden', 'false');
        clearTimeout(statusTimeout);
        statusTimeout = setTimeout(() => {
          if (statusPillEl) {
            statusPillEl.classList.remove('atv-visible');
            statusPillEl.setAttribute('aria-hidden', 'true');
          }
        }, 2600);
      }

      function closeAllPopovers() {
        activePopover = null;
        [subsPopover, audioPopover, castPopover, serverMenu].forEach(el => {
          if (el) {
            el.classList.remove('atv-open');
            el.setAttribute('aria-hidden', 'true');
          }
        });
        [subsBtn, audioBtn, castBtn, serverBtn].forEach(btn => {
          if (btn) {
            btn.classList.remove('atv-icon-active');
            btn.setAttribute('aria-expanded', 'false');
          }
        });
        if (serverChevron) serverChevron.style.transform = 'rotate(0deg)';
      }

      function togglePopover(name) {
        const wasOpen = activePopover === name;
        closeAllPopovers();
        if (wasOpen) {
          wakeControls();
          return;
        }
        closeAllDrawers();
        activePopover = name;
        if (name === 'subs' && subsPopover && subsBtn) {
          subsPopover.classList.add('atv-open');
          subsPopover.setAttribute('aria-hidden', 'false');
          subsBtn.classList.add('atv-icon-active');
          subsBtn.setAttribute('aria-expanded', 'true');
        } else if (name === 'audio' && audioPopover && audioBtn) {
          audioPopover.classList.add('atv-open');
          audioPopover.setAttribute('aria-hidden', 'false');
          audioBtn.classList.add('atv-icon-active');
          audioBtn.setAttribute('aria-expanded', 'true');
        } else if (name === 'cast' && castPopover && castBtn) {
          castPopover.classList.add('atv-open');
          castPopover.setAttribute('aria-hidden', 'false');
          castBtn.classList.add('atv-icon-active');
          castBtn.setAttribute('aria-expanded', 'true');
        } else if (name === 'server' && serverMenu && serverBtn) {
          serverMenu.classList.add('atv-open');
          serverMenu.setAttribute('aria-hidden', 'false');
          serverBtn.setAttribute('aria-expanded', 'true');
          if (serverChevron) serverChevron.style.transform = 'rotate(180deg)';
        }
        wakeControls();
      }

      function closeAllDrawers() {
        activeDrawer = null;
        if (drawerInfo) {
          drawerInfo.classList.remove('atv-open');
          drawerInfo.setAttribute('aria-hidden', 'true');
        }
        if (drawerChapters) {
          drawerChapters.classList.remove('atv-open');
          drawerChapters.setAttribute('aria-hidden', 'true');
        }
        if (tabInfoBtn) {
          tabInfoBtn.classList.remove('atv-tab-active');
          tabInfoBtn.setAttribute('aria-selected', 'false');
        }
        if (tabChaptersBtn) {
          tabChaptersBtn.classList.remove('atv-tab-active');
          tabChaptersBtn.setAttribute('aria-selected', 'false');
        }
      }

      function toggleDrawer(name) {
        const wasOpen = activeDrawer === name;
        closeAllDrawers();
        if (wasOpen) {
          wakeControls();
          return;
        }
        closeAllPopovers();
        activeDrawer = name;
        if (name === 'info' && drawerInfo && tabInfoBtn) {
          drawerInfo.classList.add('atv-open');
          drawerInfo.setAttribute('aria-hidden', 'false');
          tabInfoBtn.classList.add('atv-tab-active');
          tabInfoBtn.setAttribute('aria-selected', 'true');
        } else if (name === 'chapters' && drawerChapters && tabChaptersBtn) {
          renderChaptersIfReady();
          drawerChapters.classList.add('atv-open');
          drawerChapters.setAttribute('aria-hidden', 'false');
          tabChaptersBtn.classList.add('atv-tab-active');
          tabChaptersBtn.setAttribute('aria-selected', 'true');
        }
        wakeControls();
      }

      function renderActiveSubtitleCue() {
        if (!subtitleCueEl) return;
        if (isEmbedMode || selectedSubtitleId === 'off' || activeSubtitleCues.length === 0) {
          subtitleCueEl.textContent = '';
          subtitleCueEl.classList.remove('atv-cue-visible');
          subtitleCueEl.setAttribute('aria-hidden', 'true');
          return;
        }
        const cur = videoEl.currentTime || 0;
        const cueText = getActiveSubtitleText(activeSubtitleCues, cur);
        if (cueText) {
          subtitleCueEl.textContent = cueText;
          subtitleCueEl.classList.add('atv-cue-visible');
          subtitleCueEl.setAttribute('aria-hidden', 'false');
        } else {
          subtitleCueEl.textContent = '';
          subtitleCueEl.classList.remove('atv-cue-visible');
          subtitleCueEl.setAttribute('aria-hidden', 'true');
        }
      }

      async function applySubtitleSelection(option, isUserInitiated = false) {
        subtitleFetchToken += 1;
        const reqToken = subtitleFetchToken;
        selectedSubtitleId = option.id;

        if (isUserInitiated && option.source !== 'Local') {
          if (option.id === 'off') {
            savePreferredSubtitleLang('off');
          } else if (option.id === 'auto') {
            savePreferredSubtitleLang('auto');
          } else if (option.language) {
            savePreferredSubtitleLang(option.language);
          }
        }

        // Disable native textTracks so cues never double-render or get overridden by hls.js
        Array.from(videoEl.querySelectorAll('track[data-atv-sub="1"]')).forEach(tr => tr.remove());
        for (let i = 0; i < videoEl.textTracks.length; i++) {
          try { videoEl.textTracks[i].mode = 'disabled'; } catch {}
        }

        if (option.id === 'off') {
          activeSubtitleCues = [];
          renderActiveSubtitleCue();
          showPlayerStatus('Subtitles: Off');
          renderSubtitleMenu();
          return;
        }

        if (Array.isArray(option.localCues) && option.localCues.length > 0) {
          activeSubtitleCues = option.localCues;
          renderActiveSubtitleCue();
          showPlayerStatus(`Subtitles: ${option.label}`);
          renderSubtitleMenu();
          return;
        }

        const candidates = (Array.isArray(option.candidates) && option.candidates.length > 0)
          ? option.candidates
          : (option.src ? [option.src] : []);

        if (candidates.length === 0) {
          activeSubtitleCues = [];
          renderActiveSubtitleCue();
          showPlayerStatus('No subtitle track available');
          renderSubtitleMenu();
          return;
        }

        renderSubtitleMenu();
        showPlayerStatus(`Loading ${option.label}…`);

        let loadedCues = null;
        for (const candidateUrl of candidates) {
          try {
            const res = await fetch(candidateUrl);
            if (isDestroyed || reqToken !== subtitleFetchToken) return;
            if (!res.ok) continue;
            const rawText = await res.text();
            if (isDestroyed || reqToken !== subtitleFetchToken) return;
            const cues = parseSubtitleText(rawText);
            if (cues.length > 0) {
              loadedCues = cues;
              break;
            }
          } catch {
            // Try next backup mirror URL
          }
        }

        if (isDestroyed || reqToken !== subtitleFetchToken) return;
        if (loadedCues) {
          activeSubtitleCues = loadedCues;
          renderActiveSubtitleCue();
          showPlayerStatus(`Subtitles: ${option.label}`);
        } else {
          activeSubtitleCues = [];
          renderActiveSubtitleCue();
          showPlayerStatus(`Could not load ${option.label} subtitles`);
        }
      }

      function renderSubtitleMenu() {
        if (!subsListEl) return;
        subsListEl.innerHTML = subtitleOptions.map(opt => {
          const isSelected = opt.id === selectedSubtitleId;
          const metaBadge = opt.source === 'Local' ? '<span class="atv-pop-meta">Local</span>' : '';
          return `
            <button type="button" class="atv-pop-item atv-sub-item" data-sub-id="${escapeAttr(opt.id)}" role="menuitemradio" aria-checked="${isSelected}">
              <span class="atv-pop-item-label">
                <span>${escapeHtml(opt.label)}</span>
                ${metaBadge}
              </span>
              <span class="atv-pop-check" aria-hidden="true">${isSelected ? CHECK_SVG : ''}</span>
            </button>
          `;
        }).join('');

        subsListEl.querySelectorAll('.atv-sub-item').forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-sub-id');
            const found = subtitleOptions.find(o => o.id === id);
            if (found) applySubtitleSelection(found, true);
            wakeControls();
          };
        });
      }

      function mergeExternalSubtitleTracks(newTracks) {
        const localTracks = subtitleOptions.filter(o => o.source === 'Local');
        const existingRemote = [];
        subtitleOptions.forEach(o => {
          if (o.id === 'off' || o.id === 'auto' || o.source === 'Local') return;
          const urls = (Array.isArray(o.candidates) && o.candidates.length > 0) ? o.candidates : (o.src ? [o.src] : []);
          urls.forEach(src => existingRemote.push({ language: o.language, src, sdh: Boolean(o.sdh), source: o.source }));
        });
        const merged = deduplicateSubtitles([...existingRemote, ...(Array.isArray(newTracks) ? newTracks : [])]);
        if (localTracks.length > 0) {
          merged.splice(2, 0, ...localTracks);
        }
        subtitleOptions = merged;
      }

      if (subSearchInput) {
        subSearchInput.addEventListener('click', (e) => e.stopPropagation());
        subSearchInput.addEventListener('keydown', (e) => e.stopPropagation());
      }

      if (subSearchForm && subSearchInput) {
        subSearchForm.onsubmit = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const query = (subSearchInput.value || '').trim();
          if (!query) {
            subSearchInput.focus();
            return;
          }
          const btn = subSearchForm.querySelector('#atv-sub-search-btn');
          const prevLabel = btn ? btn.textContent : 'Find';
          if (btn) {
            btn.disabled = true;
            btn.textContent = '…';
          }
          try {
            const found = await searchOpenSubtitlesByQuery(query, isShow, seasonNum, episodeNum);
            if (isDestroyed) return;
            if (found.length > 0) {
              mergeExternalSubtitleTracks(found);
              renderSubtitleMenu();
              showPlayerStatus(`Found ${found.length} OpenSubtitles tracks`);
            } else {
              showPlayerStatus('No OpenSubtitles matches found');
            }
          } catch {
            if (!isDestroyed) showPlayerStatus('OpenSubtitles search failed');
          } finally {
            if (btn) {
              btn.disabled = false;
              btn.textContent = prevLabel;
            }
            wakeControls();
          }
        };
      }

      if (subFileBtn && subFileInput) {
        subFileBtn.onclick = (e) => {
          e.stopPropagation();
          subFileInput.click();
          wakeControls();
        };
        subFileInput.onclick = (e) => e.stopPropagation();
        subFileInput.onchange = async (e) => {
          e.stopPropagation();
          const file = subFileInput.files && subFileInput.files[0];
          if (!file) return;
          try {
            const rawText = await file.text();
            if (isDestroyed) return;
            const cues = parseSubtitleText(rawText);
            if (cues.length === 0) {
              showPlayerStatus('No readable captions in file');
              return;
            }
            const cleanName = (file.name || 'Local File').replace(/\.(srt|vtt)$/i, '').trim().slice(0, 28) || 'Local File';
            const localOption = {
              id: `local:${Date.now()}`,
              language: 'local',
              label: cleanName,
              src: 'local',
              candidates: [],
              localCues: cues,
              source: 'Local'
            };
            subtitleOptions = [
              ...subtitleOptions.slice(0, 2),
              localOption,
              ...subtitleOptions.slice(2).filter(o => o.source !== 'Local')
            ];
            applySubtitleSelection(localOption, false);
          } catch {
            if (!isDestroyed) showPlayerStatus('Could not read subtitle file');
          } finally {
            subFileInput.value = '';
            wakeControls();
          }
        };
      }

      // Fetch real subtitle tracks for this IMDb ID (local API + OpenSubtitles v3 + REST + Title fallback)
      (async function loadSubtitles() {
        try {
          const tracks = await resolveSubtitlesForImdb(imdbId, isShow, seasonNum, episodeNum, cleanTitle);
          if (isDestroyed) return;
          if (Array.isArray(tracks) && tracks.length > 0) {
            mergeExternalSubtitleTracks(tracks);
            // If user selected Auto while tracks were still loading, activate it immediately
            if (selectedSubtitleId === 'auto' && activeSubtitleCues.length === 0) {
              const autoOpt = subtitleOptions.find(o => o.id === 'auto');
              if (autoOpt && autoOpt.src) {
                applySubtitleSelection(autoOpt, false);
                return;
              }
            }
            // Auto-apply remembered subtitle language preference if set and not 'off'
            const preferredLang = loadPreferredSubtitleLang();
            if (preferredLang && preferredLang !== 'off' && selectedSubtitleId === 'off' && activeSubtitleCues.length === 0) {
              let match = null;
              if (preferredLang === 'auto') {
                match = subtitleOptions.find(o => o.id === 'auto' && o.src);
              } else {
                const prefBase = preferredLang.split('-')[0];
                match = subtitleOptions.find(o => o.id !== 'off' && o.id !== 'auto' && o.src && o.language.toLowerCase() === preferredLang && !o.sdh)
                  || subtitleOptions.find(o => o.id !== 'off' && o.id !== 'auto' && o.src && o.language.toLowerCase() === preferredLang)
                  || subtitleOptions.find(o => o.id !== 'off' && o.id !== 'auto' && o.src && o.language.toLowerCase().startsWith(prefBase));
              }
              if (match) {
                applySubtitleSelection(match, false);
                return;
              }
            }
          }
          renderSubtitleMenu();
        } catch {
          if (!isDestroyed) renderSubtitleMenu();
        }
      })();

      function renderChaptersIfReady() {
        if (!chaptersListEl) return;
        const dur = videoEl.duration || 0;
        const chapters = buildChapters(dur > 60 ? dur : 7200);
        if (renderedChaptersDuration && Math.abs(renderedChaptersDuration - dur) < 30 && chaptersListEl.children.length > 0) {
          highlightActiveChapter();
          return;
        }
        renderedChaptersDuration = dur;
        chaptersListEl.innerHTML = chapters.map(ch => `
          <button type="button" class="atv-chapter-card" data-start="${ch.startSeconds}">
            <span class="atv-chapter-num">Chapter ${ch.index}</span>
            <span class="atv-chapter-name">${escapeHtml(ch.title)}</span>
            <span class="atv-chapter-time">${escapeHtml(ch.timeLabel)}</span>
          </button>
        `).join('');
        chaptersListEl.querySelectorAll('.atv-chapter-card').forEach(card => {
          card.onclick = (e) => {
            e.stopPropagation();
            const sec = Number(card.getAttribute('data-start') || 0);
            if (Number.isFinite(sec) && videoEl.duration) {
              videoEl.currentTime = Math.min(videoEl.duration - 1, sec);
            }
            highlightActiveChapter();
            wakeControls();
          };
        });
        highlightActiveChapter();
      }

      function highlightActiveChapter() {
        if (!chaptersListEl) return;
        const cur = videoEl.currentTime || 0;
        const cards = Array.from(chaptersListEl.querySelectorAll('.atv-chapter-card'));
        let activeIdx = 0;
        cards.forEach((c, i) => {
          if (cur >= Number(c.getAttribute('data-start') || 0)) activeIdx = i;
        });
        cards.forEach((c, i) => c.classList.toggle('atv-chapter-active', i === activeIdx));
      }

      const uaStr = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
      const isAppleMobile = /iP(hone|ad|od)/i.test(uaStr) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isTouchMobile = isAppleMobile || /Android|Mobile|Silk/i.test(uaStr) || (typeof window !== 'undefined' && window.innerWidth <= 900);
      const triedServerIndices = new Set([currentServerIndex]);
      let streamLoadTimer = null;
      let nativeErrorHandler = null;
      let nativeMetadataHandler = null;
      let nativeCanPlayHandler = null;
      let activeStreamToken = 0;

      function syncServerMenuUI(idx) {
        const srv = servers[idx];
        if (!srv) return;
        if (serverName) serverName.textContent = srv.name;
        const qualityEl = watchRoot.querySelector('#fx-active-quality');
        if (qualityEl) qualityEl.textContent = srv.quality || 'HD';
        if (serverMenu) {
          serverMenu.querySelectorAll('.fx-menu-item').forEach(it => {
            const itIdx = parseInt(it.getAttribute('data-idx'), 10);
            it.setAttribute('aria-checked', String(itIdx === idx));
            const chk = it.querySelector('.atv-pop-check');
            if (chk) chk.innerHTML = itIdx === idx ? CHECK_SVG : '';
          });
        }
      }

      function showPausedCenterPlay(statusHint) {
        if (isDestroyed) return;
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
        if (centerPlayBtn) {
          centerPlayBtn.classList.add('atv-visible');
          centerPlayBtn.setAttribute('aria-hidden', 'false');
        }
        wakeControls();
        if (statusHint) showPlayerStatus(statusHint);
      }

      function attemptPlay(fromUserGesture) {
        if (isDestroyed || !videoEl.isConnected) return;
        const playPromise = videoEl.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise.then(() => {
            if (isDestroyed) return;
            bufferingEl.style.display = 'none';
          }).catch((err) => {
            if (isDestroyed) return;
            bufferingEl.style.display = 'none';
            if (err && err.name === 'NotAllowedError') {
              showPausedCenterPlay('Tap Play to start');
            } else if (fromUserGesture) {
              try {
                if (currentHls) currentHls.startLoad();
                else if (videoEl.readyState === 0) videoEl.load();
              } catch {}
              showPausedCenterPlay('Tap Play to retry');
            } else {
              showPausedCenterPlay();
            }
          });
        }
      }

      function clearNativeStreamListeners() {
        if (nativeErrorHandler) {
          videoEl.removeEventListener('error', nativeErrorHandler);
          nativeErrorHandler = null;
        }
        if (nativeMetadataHandler) {
          videoEl.removeEventListener('loadedmetadata', nativeMetadataHandler);
          nativeMetadataHandler = null;
        }
        if (nativeCanPlayHandler) {
          videoEl.removeEventListener('canplay', nativeCanPlayHandler);
          nativeCanPlayHandler = null;
        }
      }

      function fallbackToNextServer(reason) {
        if (isDestroyed) return false;
        const nextIdx = servers.findIndex((_, idx) => !triedServerIndices.has(idx));
        if (nextIdx === -1) {
          bufferingEl.style.display = 'none';
          showPausedCenterPlay(reason || 'Stream unavailable — try another server');
          return false;
        }
        if (!isEmbedMode && Number.isFinite(videoEl.currentTime) && videoEl.currentTime >= CONTINUE_WATCHING_MIN_SECONDS) {
          resumeTargetSeconds = Math.floor(videoEl.currentTime);
          hasAppliedResume = false;
          resumeAttemptCount = 0;
        }
        triedServerIndices.add(nextIdx);
        currentServerIndex = nextIdx;
        currentServer = servers[nextIdx];
        syncServerMenuUI(nextIdx);
        showPlayerStatus(`Switching to ${currentServer.name}…`);
        attachStream(currentServer, { preserveTried: true });
        return true;
      }

      function attachStream(source, opts = {}) {
        if (isDestroyed) return;
        activeStreamToken += 1;
        const token = activeStreamToken;
        if (!opts.preserveTried) {
          triedServerIndices.clear();
          triedServerIndices.add(currentServerIndex);
        }
        clearTimeout(streamLoadTimer);
        clearNativeStreamListeners();
        if (currentHls) {
          try { currentHls.destroy(); } catch {}
          currentHls = null;
        }

        const streamUrl = source.src;
        if (source.kind === 'embed') {
          isEmbedMode = true;
          playerEl.classList.add('atv-mode-embed');
          try {
            videoEl.pause();
            videoEl.removeAttribute('src');
            videoEl.load();
          } catch {}
          videoEl.style.display = 'none';
          bufferingEl.style.display = 'none';
          if (centerPlayBtn) {
            centerPlayBtn.classList.remove('atv-visible');
            centerPlayBtn.setAttribute('aria-hidden', 'true');
          }
          closeAllDrawers();
          renderActiveSubtitleCue();
          if (embedFrameEl) {
            embedFrameEl.style.display = 'block';
            embedFrameEl.src = streamUrl;
          }
          uiEl.setAttribute('data-chrome', '');
          uiEl.style.opacity = '1';
          playerEl.classList.add('atv-chrome-visible');
          persistPlaybackProgress(true, 'embed');
          return;
        }

        isEmbedMode = false;
        playerEl.classList.remove('atv-mode-embed');
        if (embedFrameEl) {
          embedFrameEl.style.display = 'none';
          embedFrameEl.src = 'about:blank';
        }
        videoEl.style.display = 'block';
        bufferingEl.style.display = 'block';
        renderActiveSubtitleCue();

        // Stall guard: if stream does not load metadata within 14s, fail over cleanly
        streamLoadTimer = setTimeout(() => {
          if (isDestroyed || token !== activeStreamToken) return;
          if (videoEl.readyState < 1) {
            fallbackToNextServer('Server timed out — switching…');
          }
        }, 14000);

        const canPlayNativeHls = Boolean(
          videoEl.canPlayType('application/vnd.apple.mpegurl') ||
          videoEl.canPlayType('application/x-mpegURL')
        );

        function attachNativeHls(retryWithoutCors) {
          if (isDestroyed || token !== activeStreamToken || !videoEl.isConnected) return;
          clearNativeStreamListeners();
          if (retryWithoutCors) {
            videoEl.removeAttribute('crossorigin');
          } else {
            videoEl.setAttribute('crossorigin', 'anonymous');
          }

          let started = false;
          const onReady = () => {
            if (isDestroyed || token !== activeStreamToken || started) return;
            started = true;
            clearTimeout(streamLoadTimer);
            bufferingEl.style.display = 'none';
            attemptPlay(false);
          };

          nativeMetadataHandler = onReady;
          nativeCanPlayHandler = onReady;
          nativeErrorHandler = () => {
            if (isDestroyed || token !== activeStreamToken) return;
            clearTimeout(streamLoadTimer);
            if (!retryWithoutCors && videoEl.hasAttribute('crossorigin')) {
              attachNativeHls(true);
              return;
            }
            fallbackToNextServer('Playback failed on this server');
          };

          videoEl.addEventListener('loadedmetadata', nativeMetadataHandler, { once: true });
          videoEl.addEventListener('canplay', nativeCanPlayHandler, { once: true });
          videoEl.addEventListener('error', nativeErrorHandler, { once: true });

          const nativeUrl = streamUrl && streamUrl.startsWith('http') && !streamUrl.includes('fx=cors')
            ? streamUrl + (streamUrl.includes('?') ? '&' : '?') + 'fx=cors'
            : streamUrl;
          videoEl.src = nativeUrl;
          videoEl.load();
        }

        // On iPhone/iPad Safari, Apple's native HLS engine is far more reliable and supports AirPlay/hardware decode
        if (isAppleMobile && canPlayNativeHls) {
          attachNativeHls(false);
          return;
        }

        ensureHlsLoaded(() => {
          if (isDestroyed || token !== activeStreamToken || !videoEl.isConnected) return;
          if (window.Hls && window.Hls.isSupported()) {
            videoEl.setAttribute('crossorigin', 'anonymous');
            const hlsStartPosition = (!hasAppliedResume && resumeTargetSeconds >= CONTINUE_WATCHING_MIN_SECONDS)
              ? resumeTargetSeconds
              : -1;
            const hls = new window.Hls({
              startPosition: hlsStartPosition,
              capLevelToPlayerSize: isTouchMobile,
              enableWorker: true,
              maxBufferLength: isTouchMobile ? 20 : 30,
              maxMaxBufferLength: isTouchMobile ? 45 : 60,
              backBufferLength: isTouchMobile ? 20 : 45,
              xhrSetup: (xhr, url) => {
                if (url && !url.includes('fx=cors')) {
                  xhr.open('GET', url + (url.includes('?') ? '&' : '?') + 'fx=cors', true);
                }
              }
            });
            currentHls = hls;
            let networkRetries = 0;
            let mediaRetries = 0;

            hls.loadSource(streamUrl);
            hls.attachMedia(videoEl);

            hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
              if (isDestroyed || token !== activeStreamToken) return;
              clearTimeout(streamLoadTimer);
              bufferingEl.style.display = 'none';
              attemptPlay(false);
            });

            hls.on(window.Hls.Events.ERROR, (event, data) => {
              if (!data || !data.fatal || isDestroyed || token !== activeStreamToken) return;
              console.warn('HLS stream error on', source.name, data);
              if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 1) {
                networkRetries += 1;
                hls.startLoad();
                return;
              }
              if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 1) {
                mediaRetries += 1;
                hls.recoverMediaError();
                return;
              }
              clearTimeout(streamLoadTimer);
              fallbackToNextServer('Server error — switching…');
            });
          } else if (canPlayNativeHls) {
            attachNativeHls(false);
          } else {
            clearTimeout(streamLoadTimer);
            bufferingEl.style.display = 'none';
            showPausedCenterPlay('HLS playback not supported in this browser');
          }
        });
      }

      attachStream(currentServer);

      function togglePlay() {
        if (videoEl.paused) {
          attemptPlay(true);
        } else {
          videoEl.pause();
        }
        wakeControls();
      }

      // Skip Intro resolution (IntroDB / AniSkip / Verified Series Intros)
      const VERIFIED_INTRO_FALLBACKS = {
        tt4574334: { start: 155, end: 232 },
        tt11280740: { start: 95, end: 175 },
        tt12637874: { start: 110, end: 185 },
        tt11198330: { start: 80, end: 165 },
        tt3581920: { start: 110, end: 185 },
        tt11126994: { start: 125, end: 215 },
        tt0903747: { start: 180, end: 200 },
        tt3032476: { start: 120, end: 140 },
        tt0944947: { start: 70, end: 168 },
        tt2442560: { start: 90, end: 150 },
        tt1475582: { start: 120, end: 175 },
        tt7366338: { start: 85, end: 145 },
        tt14452776: { start: 60, end: 110 },
        tt7660850: { start: 90, end: 175 },
        tt2788316: { start: 75, end: 155 },
        tt5753856: { start: 80, end: 155 },
        tt2560140: { start: 90, end: 180 },
        tt12590266: { start: 85, end: 175 },
        tt0460649: { start: 95, end: 115 },
        tt0475784: { start: 85, end: 165 },
        tt0141842: { start: 75, end: 155 },
        tt0306414: { start: 65, end: 150 },
        tt2861424: { start: 105, end: 165 },
        tt0979432: { start: 70, end: 145 },
        tt0455275: { start: 60, end: 125 },
        tt0411008: { start: 50, end: 85 },
        tt0108778: { start: 45, end: 95 },
        tt0386676: { start: 60, end: 95 },
        tt10986410: { start: 60, end: 90 },
        tt2306299: { start: 80, end: 145 },
        tt8111088: { start: 60, end: 110 },
        tt9140554: { start: 60, end: 115 },
        tt6741278: { start: 120, end: 170 },
        tt2707408: { start: 90, end: 175 },
        tt4236770: { start: 80, end: 160 },
        tt8707010: { start: 50, end: 85 },
        tt2085059: { start: 50, end: 80 },
        tt4786824: { start: 85, end: 175 },
        tt8772296: { start: 60, end: 120 },
        tt2356777: { start: 90, end: 185 },
        tt14218830: { start: 110, end: 150 },
        tt0121955: { start: 0, end: 30 },
        tt1442437: { start: 244, end: 256 },
        tt7587890: { start: 87, end: 159 },
        tt7631058: { start: 86, end: 179 },
        tt31510819: { start: 340, end: 400 }
      };

      let introSegment = null;
      let introSkippedForPlay = false;
      let skipIntroVisible = false;

      function hideSkipIntroBtn() {
        skipIntroVisible = false;
        if (skipIntroBtnEl) {
          skipIntroBtnEl.classList.remove('atv-visible');
          skipIntroBtnEl.setAttribute('aria-hidden', 'true');
        }
      }

      function updateSkipIntroVisibility(cur) {
        if (!skipIntroBtnEl || !introSegment || isEmbedMode) {
          if (skipIntroVisible) hideSkipIntroBtn();
          return;
        }
        if (cur < introSegment.start) {
          introSkippedForPlay = false;
        }
        const shouldShow = !introSkippedForPlay && cur >= introSegment.start && cur < (introSegment.end - 1);
        if (shouldShow && !skipIntroVisible) {
          skipIntroVisible = true;
          skipIntroBtnEl.classList.add('atv-visible');
          skipIntroBtnEl.setAttribute('aria-hidden', 'false');
        } else if (!shouldShow && skipIntroVisible) {
          hideSkipIntroBtn();
        }
      }

      function performSkipIntro() {
        if (!introSegment || isEmbedMode) return;
        introSkippedForPlay = true;
        resumeTargetSeconds = 0;
        hasAppliedResume = true;
        const dur = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 1e9;
        videoEl.currentTime = Math.min(dur, introSegment.end);
        hideSkipIntroBtn();
        updateTimeDisplay();
        persistPlaybackProgress(true);
        showPlayerStatus('Skipped Intro');
        wakeControls();
      }

      if (skipIntroBtnEl) {
        skipIntroBtnEl.onclick = (e) => {
          e.stopPropagation();
          performSkipIntro();
        };
      }

      if ((isShow || isAnimeRoute) && skipIntroBtnEl) {
        (async () => {
          let resolved = null;
          if (isAnimeRoute && animeId) {
            try {
              const r = await fetch(`https://api.aniskip.com/v2/skip-times/${encodeURIComponent(animeId)}/${episodeNum}?types[]=op`, {
                signal: AbortSignal.timeout(3000)
              });
              if (r.ok) {
                const d = await r.json().catch(() => null);
                const op = d && d.found && Array.isArray(d.results) ? d.results[0] : null;
                if (op && op.interval && op.interval.endTime > op.interval.startTime) {
                  resolved = { start: Math.round(op.interval.startTime), end: Math.round(op.interval.endTime) };
                }
              }
            } catch {}
          } else if (imdbId && /^tt\d+$/i.test(imdbId)) {
            const cleanImdb = imdbId.toLowerCase();
            try {
              const introRes = await fetchApiJsonWithMeta(
                `/api/introdb?imdb_id=${encodeURIComponent(cleanImdb)}&season=${seasonNum}&episode=${episodeNum}`
              );
              const d = introRes && introRes.data;
              if (d?.intro && typeof d.intro.start_sec === 'number' && typeof d.intro.end_sec === 'number' && d.intro.end_sec > d.intro.start_sec) {
                resolved = { start: Math.round(d.intro.start_sec), end: Math.round(d.intro.end_sec) };
              }
            } catch {}
            if (!resolved && VERIFIED_INTRO_FALLBACKS[cleanImdb]) {
              resolved = VERIFIED_INTRO_FALLBACKS[cleanImdb];
            }
            if (!resolved) {
              const dur = Number.isFinite(videoEl.duration) && videoEl.duration >= 300 ? videoEl.duration : 2700;
              const isShort = dur < 1800;
              resolved = { start: isShort ? 40 : 75, end: isShort ? 90 : 160 };
            }
          }
          if (!isDestroyed && resolved) {
            introSegment = resolved;
            updateSkipIntroVisibility(videoEl.currentTime || 0);
          }
        })();
      }

      // TV & Anime "Up Next" episode card logic
      let nextSeasonNum = seasonNum;
      let nextEpisodeNum = episodeNum + 1;
      let nextEpisodeUrl = isAnimeRoute
        ? withBasePath(`/watch/anime/${encodeURIComponent(animeId)}/${nextEpisodeNum}`)
        : isShow
          ? withBasePath(`/watch/${encodeURIComponent(titleSlug)}/s${nextSeasonNum}e${nextEpisodeNum}`)
          : null;

      function applyNextEpisodeFromVideos(videos) {
        if (!isShow || isAnimeRoute || !Array.isArray(videos) || videos.length === 0) return;
        const epList = videos
          .map(v => ({
            s: Number(v.season),
            e: Number(v.episode || v.number),
            title: v.name || v.title || '',
            thumb: v.thumbnail || ''
          }))
          .filter(v => Number.isFinite(v.s) && v.s > 0 && Number.isFinite(v.e) && v.e > 0);
        if (epList.length === 0) return;
        let targetEp = epList.find(v => v.s === seasonNum && v.e === episodeNum + 1) || null;
        if (!targetEp) {
          const nextSeasonEps = epList.filter(v => v.s === seasonNum + 1).sort((a, b) => a.e - b.e);
          if (nextSeasonEps.length > 0) {
            targetEp = nextSeasonEps[0];
            nextSeasonNum = seasonNum + 1;
            nextEpisodeNum = targetEp.e;
            nextEpisodeUrl = withBasePath(`/watch/${encodeURIComponent(titleSlug)}/s${nextSeasonNum}e${nextEpisodeNum}`);
            const upNextTitleEl = watchRoot.querySelector('#atv-upnext-title');
            if (upNextTitleEl) upNextTitleEl.textContent = `S${nextSeasonNum} · E${nextEpisodeNum}`;
          } else {
            nextEpisodeUrl = null;
            hideUpNextCard();
            return;
          }
        }
        if (targetEp) {
          if (upNextEpTitleEl && targetEp.title) {
            upNextEpTitleEl.textContent = targetEp.title;
          }
          if (upNextThumbEl && targetEp.thumb && /^https?:\/\//i.test(targetEp.thumb)) {
            upNextThumbEl.src = targetEp.thumb;
            upNextThumbEl.style.display = '';
          }
        }
      }

      if (isShow && !isAnimeRoute) {
        if (Array.isArray(titleInfo?.videos) && titleInfo.videos.length > 0) {
          applyNextEpisodeFromVideos(titleInfo.videos);
        } else if (imdbId && /^tt\d+$/i.test(imdbId)) {
          fetch(`https://v3-cinemeta.strem.io/meta/series/${encodeURIComponent(imdbId)}.json`)
            .then(r => (r.ok ? r.json() : null))
            .then(d => {
              if (!isDestroyed && Array.isArray(d?.meta?.videos)) {
                applyNextEpisodeFromVideos(d.meta.videos);
              }
            })
            .catch(() => {});
        }
      }

      const UPNEXT_RING_CIRCUMFERENCE = 169.65;
      function updateUpNextRing(remainingSec, totalSec = 10) {
        if (!upNextRingEl) return;
        if (!Number.isFinite(remainingSec)) {
          upNextRingEl.style.strokeDashoffset = String(UPNEXT_RING_CIRCUMFERENCE);
          return;
        }
        const progress = Math.max(0, Math.min(1, (totalSec - remainingSec) / totalSec));
        upNextRingEl.style.strokeDashoffset = String(UPNEXT_RING_CIRCUMFERENCE * (1 - progress));
      }

      function hideUpNextCard() {
        clearInterval(upNextCountdownTimer);
        upNextCountdownTimer = null;
        upNextVisible = false;
        updateUpNextRing(null);
        if (upNextCardEl) {
          upNextCardEl.classList.remove('atv-visible');
          upNextCardEl.setAttribute('aria-hidden', 'true');
        }
      }

      function showUpNextCard(countdownSec) {
        if (!upNextCardEl || !nextEpisodeUrl || isEmbedMode || upNextDismissed) return;
        upNextVisible = true;
        if (upNextKickerEl) {
          upNextKickerEl.textContent = Number.isFinite(countdownSec) ? `Up Next · ${countdownSec}s` : 'Up Next';
        }
        if (upNextCcBadgeEl) {
          upNextCcBadgeEl.style.display = selectedSubtitleId && selectedSubtitleId !== 'off' ? '' : 'none';
        }
        if (upNextQBadgeEl && currentServer?.quality) {
          upNextQBadgeEl.textContent = currentServer.quality;
        }
        updateUpNextRing(countdownSec);
        upNextCardEl.classList.add('atv-visible');
        upNextCardEl.setAttribute('aria-hidden', 'false');
      }

      function startUpNextCountdown() {
        if (!upNextCardEl || !nextEpisodeUrl || isEmbedMode || upNextDismissed) return;
        clearInterval(upNextCountdownTimer);
        const totalSec = 10;
        let remainingSec = totalSec;
        showUpNextCard(remainingSec);
        upNextCountdownTimer = setInterval(() => {
          if (isDestroyed || upNextDismissed) {
            clearInterval(upNextCountdownTimer);
            upNextCountdownTimer = null;
            return;
          }
          remainingSec -= 1;
          if (remainingSec <= 0) {
            updateUpNextRing(0, totalSec);
            clearInterval(upNextCountdownTimer);
            upNextCountdownTimer = null;
            navigateTo(nextEpisodeUrl);
            return;
          }
          updateUpNextRing(remainingSec, totalSec);
          if (upNextKickerEl) {
            upNextKickerEl.textContent = `Up Next · ${remainingSec}s`;
          }
        }, 1000);
      }

      if (upNextPlayBtn) {
        upNextPlayBtn.onclick = (e) => {
          e.stopPropagation();
          if (!nextEpisodeUrl) return;
          hideUpNextCard();
          navigateTo(nextEpisodeUrl);
        };
      }
      if (upNextDismissBtn) {
        upNextDismissBtn.onclick = (e) => {
          e.stopPropagation();
          upNextDismissed = true;
          hideUpNextCard();
          wakeControls();
        };
      }

      playBtn.onclick = (e) => { e.stopPropagation(); togglePlay(); };
      if (centerPlayBtn) centerPlayBtn.onclick = (e) => { e.stopPropagation(); togglePlay(); };
      if (back10Btn) back10Btn.onclick = (e) => {
        e.stopPropagation();
        resumeTargetSeconds = 0;
        hasAppliedResume = true;
        videoEl.currentTime = Math.max(0, (videoEl.currentTime || 0) - 10);
        updateTimeDisplay();
        persistPlaybackProgress(true);
        wakeControls();
      };
      if (fwd10Btn) fwd10Btn.onclick = (e) => {
        e.stopPropagation();
        resumeTargetSeconds = 0;
        hasAppliedResume = true;
        videoEl.currentTime = Math.min(videoEl.duration || 1e9, (videoEl.currentTime || 0) + 10);
        updateTimeDisplay();
        persistPlaybackProgress(true);
        wakeControls();
      };

      // Unified Stage Gesture Arbiter: Mobile stacked double-tap skip (±10s/±20s/±30s) + Press-and-hold 2x speed
      let gestureStartX = 0;
      let gestureStartY = 0;
      let gestureMoved = false;
      let mouseDownActive = false;
      let holdBoostActive = false;
      let preBoostRate = 1;
      let suppressNextMouseClick = false;
      let tapSide = null;
      let tapCount = 0;
      let lastTapTime = 0;
      let lastTouchGestureEndAt = 0;

      function triggerSeekRipple(side, totalDeltaSeconds) {
        const activeEl = side === 'left' ? seekRippleLeftEl : seekRippleRightEl;
        const otherEl = side === 'left' ? seekRippleRightEl : seekRippleLeftEl;
        const labelEl = side === 'left' ? seekLabelLeftEl : seekLabelRightEl;
        if (!activeEl) return;
        if (otherEl) {
          otherEl.classList.remove('atv-ripple-active');
          otherEl.setAttribute('aria-hidden', 'true');
        }
        if (labelEl) {
          const abs = Math.abs(Math.round(totalDeltaSeconds));
          labelEl.textContent = side === 'left' ? `-${abs}s` : `+${abs}s`;
        }
        activeEl.classList.remove('atv-ripple-active');
        void activeEl.offsetWidth;
        activeEl.classList.add('atv-ripple-active');
        activeEl.setAttribute('aria-hidden', 'false');
        clearTimeout(rippleHideTimer);
        rippleHideTimer = setTimeout(() => {
          activeEl.classList.remove('atv-ripple-active');
          activeEl.setAttribute('aria-hidden', 'true');
        }, 720);
      }

      function startHoldSpeedBoost() {
        if (isDestroyed || isEmbedMode || videoEl.paused || activePopover || activeDrawer || holdBoostActive) return;
        holdBoostActive = true;
        preBoostRate = videoEl.playbackRate || 1;
        videoEl.playbackRate = 2;
        if (speedBoostPillEl) {
          speedBoostPillEl.classList.add('atv-visible');
          speedBoostPillEl.setAttribute('aria-hidden', 'false');
        }
      }

      function stopHoldSpeedBoost() {
        clearTimeout(holdBoostTimer);
        holdBoostTimer = null;
        if (!holdBoostActive) return;
        holdBoostActive = false;
        try { videoEl.playbackRate = preBoostRate || 1; } catch {}
        if (speedBoostPillEl) {
          speedBoostPillEl.classList.remove('atv-visible');
          speedBoostPillEl.setAttribute('aria-hidden', 'true');
        }
      }

      function executeSingleTouchTap() {
        tapSide = null;
        tapCount = 0;
        if (isDestroyed || isEmbedMode) return;
        if (!videoEl.paused && !uiEl.hasAttribute('data-chrome')) {
          wakeControls();
          return;
        }
        togglePlay();
      }

      videoEl.addEventListener('touchstart', (e) => {
        if (isEmbedMode || !e.touches || e.touches.length !== 1) {
          stopHoldSpeedBoost();
          return;
        }
        const touch = e.touches[0];
        gestureStartX = touch.clientX;
        gestureStartY = touch.clientY;
        gestureMoved = false;
        clearTimeout(holdBoostTimer);
        holdBoostTimer = setTimeout(startHoldSpeedBoost, 420);
      }, { passive: true });

      videoEl.addEventListener('touchmove', (e) => {
        if (!e.touches || e.touches.length !== 1) {
          gestureMoved = true;
          clearTimeout(holdBoostTimer);
          return;
        }
        if (!gestureMoved) {
          const touch = e.touches[0];
          const dist = Math.hypot(touch.clientX - gestureStartX, touch.clientY - gestureStartY);
          if (dist > 12) {
            gestureMoved = true;
            clearTimeout(holdBoostTimer);
          }
        }
      }, { passive: true });

      videoEl.addEventListener('touchend', (e) => {
        lastTouchGestureEndAt = Date.now();
        clearTimeout(holdBoostTimer);
        if (holdBoostActive) {
          stopHoldSpeedBoost();
          if (e.cancelable) e.preventDefault();
          return;
        }
        if (isEmbedMode || gestureMoved) return;
        if (activePopover || activeDrawer) {
          closeAllPopovers();
          closeAllDrawers();
          wakeControls();
          if (e.cancelable) e.preventDefault();
          return;
        }

        const rect = videoEl.getBoundingClientRect();
        const relX = rect.width > 0 ? (gestureStartX - rect.left) / rect.width : 0.5;
        const zone = relX < 0.35 ? 'left' : relX > 0.65 ? 'right' : 'center';
        const now = Date.now();

        if (zone !== 'center' && tapSide === zone && (now - lastTapTime) <= 650) {
          clearTimeout(singleTapTimer);
          tapCount = tapCount < 1 ? 2 : tapCount + 1;
          lastTapTime = now;
          resumeTargetSeconds = 0;
          hasAppliedResume = true;
          const step = zone === 'left' ? -10 : 10;
          const dur = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 1e9;
          videoEl.currentTime = Math.max(0, Math.min(dur, (videoEl.currentTime || 0) + step));
          updateTimeDisplay();
          persistPlaybackProgress(true);
          triggerSeekRipple(zone, (tapCount - 1) * step);
          if (e.cancelable) e.preventDefault();
          return;
        }

        lastTapTime = now;
        if (zone === 'center') {
          clearTimeout(singleTapTimer);
          executeSingleTouchTap();
          if (e.cancelable) e.preventDefault();
        } else {
          tapSide = zone;
          tapCount = 1;
          clearTimeout(singleTapTimer);
          singleTapTimer = setTimeout(executeSingleTouchTap, 260);
          if (e.cancelable) e.preventDefault();
        }
      }, { passive: false });

      videoEl.addEventListener('touchcancel', () => {
        clearTimeout(holdBoostTimer);
        stopHoldSpeedBoost();
      });

      videoEl.addEventListener('mousedown', (e) => {
        if (isEmbedMode || e.button !== 0 || (Date.now() - lastTouchGestureEndAt < 450)) return;
        mouseDownActive = true;
        gestureStartX = e.clientX;
        gestureStartY = e.clientY;
        gestureMoved = false;
        clearTimeout(holdBoostTimer);
        holdBoostTimer = setTimeout(startHoldSpeedBoost, 420);
      });

      videoEl.addEventListener('mousemove', (e) => {
        if (!mouseDownActive || gestureMoved) return;
        if (Math.hypot(e.clientX - gestureStartX, e.clientY - gestureStartY) > 12) {
          gestureMoved = true;
          clearTimeout(holdBoostTimer);
        }
      });

      const onWindowGestureMouseUp = () => {
        if (!mouseDownActive) return;
        mouseDownActive = false;
        clearTimeout(holdBoostTimer);
        if (holdBoostActive) {
          suppressNextMouseClick = true;
          stopHoldSpeedBoost();
        }
      };
      window.addEventListener('mouseup', onWindowGestureMouseUp);

      videoEl.onclick = () => {
        if (Date.now() - lastTouchGestureEndAt < 450) return;
        if (suppressNextMouseClick) {
          suppressNextMouseClick = false;
          return;
        }
        if (activePopover || activeDrawer) {
          closeAllPopovers();
          closeAllDrawers();
          wakeControls();
          return;
        }
        // On touch devices, first tap while playing reveals hidden controls instead of abruptly pausing
        if (isTouchMobile && !videoEl.paused && !uiEl.hasAttribute('data-chrome')) {
          wakeControls();
          return;
        }
        togglePlay();
      };

      videoEl.onplay = () => {
        if (upNextCountdownTimer) {
          clearInterval(upNextCountdownTimer);
          upNextCountdownTimer = null;
          if (upNextKickerEl) upNextKickerEl.textContent = 'Up Next';
        }
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
        if (centerPlayBtn) {
          centerPlayBtn.classList.remove('atv-visible');
          centerPlayBtn.setAttribute('aria-hidden', 'true');
        }
        wakeControls();
      };
      videoEl.onpause = () => {
        stopHoldSpeedBoost();
        persistPlaybackProgress(true);
        showPausedCenterPlay();
      };
      videoEl.onended = () => {
        stopHoldSpeedBoost();
        persistPlaybackProgress(true);
        startUpNextCountdown();
      };
      videoEl.onwaiting = () => { bufferingEl.style.display = 'block'; };
      videoEl.onplaying = () => {
        clearTimeout(streamLoadTimer);
        bufferingEl.style.display = 'none';
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
        if (centerPlayBtn) {
          centerPlayBtn.classList.remove('atv-visible');
          centerPlayBtn.setAttribute('aria-hidden', 'true');
        }
        tryApplyResumePosition(true);
      };

      function updateTimeDisplay() {
        const cur = videoEl.currentTime || 0;
        const dur = videoEl.duration || 0;
        timeNow.textContent = formatTime(cur);
        if (dur > 0) {
          timeRemaining.textContent = showTotalInsteadOfRemaining ? formatTime(dur) : formatRemaining(cur, dur);
          const pct = Math.max(0, Math.min(100, (cur / dur) * 100));
          scrubPlayed.style.width = pct + '%';
          scrubThumb.style.left = pct + '%';
          if (scrubWrap) scrubWrap.setAttribute('aria-valuenow', String(Math.round(pct)));
          if (activeDrawer === 'chapters') highlightActiveChapter();
          if ((isShow || isAnimeRoute) && nextEpisodeUrl && !isEmbedMode && !upNextDismissed && dur >= 45 && cur >= 10 && (dur - cur) <= 25) {
            if (!upNextVisible) showUpNextCard(null);
          } else if (upNextVisible && !upNextCountdownTimer && (dur - cur) > 30) {
            hideUpNextCard();
          }
        }
        if (videoEl.buffered && videoEl.buffered.length > 0 && dur > 0) {
          const bufEnd = videoEl.buffered.end(videoEl.buffered.length - 1);
          scrubBuffered.style.width = Math.min(100, (bufEnd / dur) * 100) + '%';
        }
        renderActiveSubtitleCue();
        updateSkipIntroVisibility(cur);
        persistPlaybackProgress(false);
      }

      videoEl.ontimeupdate = updateTimeDisplay;
      videoEl.onseeked = () => {
        renderActiveSubtitleCue();
        persistPlaybackProgress(true);
      };
      videoEl.onloadedmetadata = () => {
        tryApplyResumePosition(true);
        updateTimeDisplay();
        if (activeDrawer === 'chapters') renderChaptersIfReady();
      };
      videoEl.onloadeddata = () => {
        tryApplyResumePosition(true);
      };
      videoEl.oncanplay = () => {
        tryApplyResumePosition(true);
      };

      if (timeRemaining) {
        timeRemaining.onclick = (e) => {
          e.stopPropagation();
          showTotalInsteadOfRemaining = !showTotalInsteadOfRemaining;
          updateTimeDisplay();
          wakeControls();
        };
      }

      let isScrubbing = false;
      function seekAtEvent(e) {
        const rect = scrubTrack.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
        const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        if (videoEl.duration) {
          resumeTargetSeconds = 0;
          hasAppliedResume = true;
          videoEl.currentTime = pos * videoEl.duration;
          updateTimeDisplay();
        }
      }

      const onWindowMouseMove = (e) => { if (isScrubbing) seekAtEvent(e); };
      const onWindowMouseUp = () => {
        if (isScrubbing) {
          isScrubbing = false;
          if (scrubWrap) scrubWrap.classList.remove('atv-scrubbing');
          persistPlaybackProgress(true);
        }
      };
      const onWindowTouchMove = (e) => {
        if (!isScrubbing) return;
        if (e.cancelable) e.preventDefault();
        seekAtEvent(e);
      };
      const onWindowTouchEnd = () => {
        if (isScrubbing) {
          isScrubbing = false;
          if (scrubWrap) scrubWrap.classList.remove('atv-scrubbing');
          persistPlaybackProgress(true);
        }
      };

      scrubWrap.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isScrubbing = true;
        scrubWrap.classList.add('atv-scrubbing');
        seekAtEvent(e);
        wakeControls();
      });
      scrubWrap.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        isScrubbing = true;
        scrubWrap.classList.add('atv-scrubbing');
        seekAtEvent(e);
        wakeControls();
      }, { passive: false });
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
      window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
      window.addEventListener('touchend', onWindowTouchEnd);
      window.addEventListener('touchcancel', onWindowTouchEnd);

      // Bidirectional Volume & Mute (Inline Transport + Audio Popover + Keyboard)
      function updateVolumeUI() {
        const isMuted = videoEl.muted || videoEl.volume === 0;
        const effectiveVol = isMuted ? 0 : Math.max(0, Math.min(1, videoEl.volume));
        const pct = Math.round(effectiveVol * 100);
        if (!isMuted && effectiveVol > 0) {
          lastNonZeroVolume = effectiveVol;
        }
        if (iconVol) iconVol.style.display = isMuted ? 'none' : 'block';
        if (iconMuted) iconMuted.style.display = isMuted ? 'block' : 'none';
        if (volPctEl) volPctEl.textContent = `${pct}%`;
        if (volSlider) volSlider.value = String(effectiveVol);
        if (muteBtn) {
          muteBtn.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
          muteBtn.setAttribute('aria-pressed', String(isMuted));
        }

        if (inlineVolSlider) {
          inlineVolSlider.value = String(effectiveVol);
          inlineVolSlider.style.setProperty('--vol-pct', `${pct}%`);
          inlineVolSlider.setAttribute('aria-valuetext', `${pct}%`);
        }
        if (inlineMuteBtn) {
          inlineMuteBtn.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
          inlineMuteBtn.setAttribute('aria-pressed', String(isMuted));
        }
        if (inlineIconVolHigh) inlineIconVolHigh.style.display = (!isMuted && effectiveVol >= 0.5) ? 'block' : 'none';
        if (inlineIconVolLow) inlineIconVolLow.style.display = (!isMuted && effectiveVol > 0 && effectiveVol < 0.5) ? 'block' : 'none';
        if (inlineIconVolMuted) inlineIconVolMuted.style.display = isMuted ? 'block' : 'none';
      }

      function applyVolume(nextVal) {
        const clamped = Math.max(0, Math.min(1, Number.isFinite(nextVal) ? nextVal : 1));
        videoEl.volume = clamped;
        videoEl.muted = clamped === 0;
        if (clamped > 0) lastNonZeroVolume = clamped;
        updateVolumeUI();
        wakeControls();
      }

      function toggleMuteStateUI() {
        if (videoEl.muted || videoEl.volume === 0) {
          videoEl.muted = false;
          if (videoEl.volume === 0) {
            videoEl.volume = lastNonZeroVolume > 0 ? lastNonZeroVolume : 0.8;
          }
        } else {
          if (videoEl.volume > 0) lastNonZeroVolume = videoEl.volume;
          videoEl.muted = true;
        }
        updateVolumeUI();
        wakeControls();
      }

      if (volSlider) {
        volSlider.oninput = (e) => {
          e.stopPropagation();
          applyVolume(parseFloat(e.target.value));
        };
      }

      if (muteBtn) {
        muteBtn.onclick = (e) => {
          e.stopPropagation();
          toggleMuteStateUI();
        };
      }

      const onWindowVolumePointerUp = () => {
        if (!isAdjustingVolume) return;
        isAdjustingVolume = false;
        wakeControls();
      };
      window.addEventListener('pointerup', onWindowVolumePointerUp);
      window.addEventListener('pointercancel', onWindowVolumePointerUp);

      if (inlineVolSlider) {
        inlineVolSlider.addEventListener('click', (e) => e.stopPropagation());
        inlineVolSlider.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          isAdjustingVolume = true;
          wakeControls();
        });
        inlineVolSlider.oninput = (e) => {
          e.stopPropagation();
          applyVolume(parseFloat(e.target.value));
        };
        inlineVolSlider.onchange = (e) => {
          e.stopPropagation();
          isAdjustingVolume = false;
          wakeControls();
        };
      }

      if (inlineMuteBtn) {
        inlineMuteBtn.onclick = (e) => {
          e.stopPropagation();
          toggleMuteStateUI();
        };
      }

      updateVolumeUI();

      // Playback speed buttons inside Audio popover
      watchRoot.querySelectorAll('.atv-speed-item').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const rate = parseFloat(btn.getAttribute('data-rate') || '1');
          videoEl.playbackRate = rate;
          watchRoot.querySelectorAll('.atv-speed-item').forEach(item => {
            const active = parseFloat(item.getAttribute('data-rate') || '1') === rate;
            item.setAttribute('aria-checked', String(active));
            const chk = item.querySelector('.atv-pop-check');
            if (chk) chk.innerHTML = active ? CHECK_SVG : '';
          });
          showPlayerStatus(`Speed: ${rate}×`);
          wakeControls();
        };
      });

      // Sound mode toggle (Full Dynamic Range vs Reduce Loud Sounds)
      watchRoot.querySelectorAll('.atv-sound-mode-item').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const mode = btn.getAttribute('data-mode');
          watchRoot.querySelectorAll('.atv-sound-mode-item').forEach(item => {
            const active = item.getAttribute('data-mode') === mode;
            item.setAttribute('aria-checked', String(active));
            const chk = item.querySelector('.atv-pop-check');
            if (chk) chk.innerHTML = active ? CHECK_SVG : '';
          });
          if (mode === 'reduce' && videoEl.volume > 0.72) {
            videoEl.volume = 0.72;
            updateVolumeUI();
          }
          showPlayerStatus(mode === 'reduce' ? 'Reduce Loud Sounds On' : 'Full Dynamic Range');
          wakeControls();
        };
      });

      // Apple TV Circular Action Buttons
      if (subsBtn) subsBtn.onclick = (e) => { e.stopPropagation(); togglePopover('subs'); };
      if (audioBtn) audioBtn.onclick = (e) => { e.stopPropagation(); togglePopover('audio'); };
      if (castBtn) castBtn.onclick = (e) => { e.stopPropagation(); togglePopover('cast'); };
      if (tabInfoBtn) tabInfoBtn.onclick = (e) => { e.stopPropagation(); toggleDrawer('info'); };
      if (tabChaptersBtn) tabChaptersBtn.onclick = (e) => { e.stopPropagation(); toggleDrawer('chapters'); };

      // Picture-in-Picture
      async function togglePiP() {
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else if (document.pictureInPictureEnabled && videoEl.requestPictureInPicture) {
            await videoEl.requestPictureInPicture();
          } else if (typeof videoEl.webkitSetPresentationMode === 'function') {
            const next = videoEl.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture';
            videoEl.webkitSetPresentationMode(next);
          } else {
            showPlayerStatus('Picture-in-Picture unavailable in this browser');
          }
        } catch {
          showPlayerStatus('Picture-in-Picture unavailable');
        }
      }
      if (pipBtn) {
        pipBtn.onclick = (e) => { e.stopPropagation(); togglePiP(); wakeControls(); };
      }
      const onEnterPiP = () => {
        if (pipBtn) { pipBtn.classList.add('atv-icon-active'); pipBtn.setAttribute('aria-pressed', 'true'); }
      };
      const onLeavePiP = () => {
        if (pipBtn) { pipBtn.classList.remove('atv-icon-active'); pipBtn.setAttribute('aria-pressed', 'false'); }
      };
      videoEl.addEventListener('enterpictureinpicture', onEnterPiP);
      videoEl.addEventListener('leavepictureinpicture', onLeavePiP);

      // Cast & AirPlay Actions (Google Cast Web Sender SDK v3 + Public HTTPS HLS Selection + AirPlay + VLC/Infuse)
      const castRemoteBtn = watchRoot.querySelector('#atv-cast-remote');
      const castDisconnectBtn = watchRoot.querySelector('#atv-cast-disconnect');
      const castAirplayBtn = watchRoot.querySelector('#atv-cast-airplay');
      const castVlcBtn = watchRoot.querySelector('#atv-cast-vlc');
      const castInfuseBtn = watchRoot.querySelector('#atv-cast-infuse');
      const castCopyStreamBtn = watchRoot.querySelector('#atv-cast-copy-stream');
      const castShareLinkBtn = watchRoot.querySelector('#atv-cast-share-link');
      const topCastBtn = watchRoot.querySelector('#atv-top-cast-btn');
      const castBannerEl = watchRoot.querySelector('#atv-cast-banner');
      const castDeviceLabelEl = watchRoot.querySelector('#atv-cast-device-label');
      const castBannerPlayBtn = watchRoot.querySelector('#atv-cast-banner-play');
      const castBannerStopBtn = watchRoot.querySelector('#atv-cast-banner-stop');

      let activeCastSession = null;
      let castRemotePlayer = null;
      let castRemoteController = null;
      let castSessionStateHandler = null;
      let castFallbackVideoEl = null;

      function updateCastStatus(text) {
        if (castStatusEl) castStatusEl.textContent = text;
      }

      function setCastingUiActive(connected, deviceName) {
        const isConnected = Boolean(connected);
        if (playerEl) playerEl.classList.toggle('atv-casting-active', isConnected);
        if (castBtn) castBtn.classList.toggle('atv-icon-connected', isConnected);
        if (topCastBtn) topCastBtn.classList.toggle('atv-icon-connected', isConnected);
        if (castDisconnectBtn) castDisconnectBtn.style.display = isConnected ? '' : 'none';
        if (castBannerEl) {
          castBannerEl.classList.toggle('atv-cast-active', isConnected);
          castBannerEl.setAttribute('aria-hidden', isConnected ? 'false' : 'true');
        }
        if (castDeviceLabelEl && deviceName) {
          castDeviceLabelEl.textContent = `Casting to ${deviceName}`;
        }
      }

      function syncCastBannerPlayLabel() {
        if (!castBannerPlayBtn || !castRemotePlayer) return;
        castBannerPlayBtn.textContent = castRemotePlayer.isPaused ? 'Resume on TV' : 'Pause on TV';
      }

      function loadMediaIntoCastSession(session) {
        if (!session || !window.chrome || !window.chrome.cast) return;
        const target = pickCastableStreamSource(servers, currentServer);
        const deviceName = session.getCastDevice?.()?.friendlyName || 'Chromecast TV';
        if (target.kind !== 'direct' || !target.url) {
          updateCastStatus(`Connected to ${deviceName} — switch to a direct HLS server or use Chrome's Cast Tab for embed players`);
          showPlayerStatus(`Connected to ${deviceName} (embed server cannot stream directly)`);
          setCastingUiActive(true, deviceName);
          return;
        }

        const mediaInfo = new window.chrome.cast.media.MediaInfo(target.url, target.contentType || 'application/x-mpegurl');
        mediaInfo.streamType = window.chrome.cast.media.StreamType.BUFFERED;
        if (target.contentType === 'application/x-mpegurl') {
          try {
            mediaInfo.hlsSegmentFormat = window.chrome.cast.media.HlsSegmentFormat.TS;
            mediaInfo.hlsVideoSegmentFormat = window.chrome.cast.media.HlsVideoSegmentFormat.MPEG2_TS;
          } catch {}
        }

        const metadata = new window.chrome.cast.media.MovieMediaMetadata();
        metadata.title = cleanTitle;
        metadata.subtitle = isShow
          ? (isAnimeRoute ? `Episode ${episodeNum}` : `Season ${seasonNum} · Episode ${episodeNum}`)
          : (yearStr || 'Kaira');
        if (posterUrl) {
          metadata.images = [new window.chrome.cast.Image(posterUrl)];
        }
        mediaInfo.metadata = metadata;

        const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
        request.autoplay = true;
        request.currentTime = Number.isFinite(videoEl.currentTime) && videoEl.currentTime > 1 ? videoEl.currentTime : 0;

        updateCastStatus(`Sending ${target.server?.name || 'stream'} to ${deviceName}…`);
        session.loadMedia(request).then(
          () => {
            if (isDestroyed) return;
            activeCastSession = session;
            try { videoEl.pause(); } catch {}
            setCastingUiActive(true, deviceName);
            updateCastStatus(`Casting ${target.server?.name || ''} to ${deviceName}`.trim());
            showPlayerStatus(`Casting to ${deviceName}`);
            try {
              if (!castRemotePlayer && window.cast?.framework?.RemotePlayer) {
                castRemotePlayer = new window.cast.framework.RemotePlayer();
                castRemoteController = new window.cast.framework.RemotePlayerController(castRemotePlayer);
                castRemoteController.addEventListener(
                  window.cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
                  syncCastBannerPlayLabel
                );
              }
              syncCastBannerPlayLabel();
            } catch {}
          },
          (errCode) => {
            if (isDestroyed) return;
            updateCastStatus(`TV could not play stream (${String(errCode || 'error')}). Try switching server or Copy Stream URL.`);
            showPlayerStatus('Cast stream load failed — try another server');
          }
        );
      }

      function stopActiveCastSession() {
        try {
          if (activeCastSession && typeof activeCastSession.endSession === 'function') {
            activeCastSession.endSession(true);
          } else if (window.cast?.framework?.CastContext) {
            const cur = window.cast.framework.CastContext.getInstance().getCurrentSession();
            if (cur) cur.endSession(true);
          }
        } catch {}
        activeCastSession = null;
        setCastingUiActive(false);
        updateCastStatus('Disconnected from TV');
        showPlayerStatus('Stopped casting');
      }

      // Preload Google Cast Web Sender SDK in the background so clicks stay inside a valid user gesture
      ensureGoogleCastSdkLoaded().then((available) => {
        if (isDestroyed || !available || !window.cast?.framework?.CastContext) return;
        try {
          const ctx = window.cast.framework.CastContext.getInstance();
          castSessionStateHandler = (ev) => {
            if (isDestroyed) return;
            const state = ev?.sessionState;
            const SS = window.cast.framework.SessionState;
            if (state === SS.SESSION_STARTED || state === SS.SESSION_RESUMED) {
              const sess = ctx.getCurrentSession();
              if (sess) loadMediaIntoCastSession(sess);
            } else if (state === SS.SESSION_ENDED) {
              activeCastSession = null;
              setCastingUiActive(false);
              updateCastStatus('Ready to connect to a TV or external player');
            }
          };
          ctx.addEventListener(window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED, castSessionStateHandler);
          const existing = ctx.getCurrentSession();
          if (existing) {
            activeCastSession = existing;
            const devName = existing.getCastDevice?.()?.friendlyName || 'Chromecast TV';
            setCastingUiActive(true, devName);
            updateCastStatus(`Connected to ${devName}`);
          }
        } catch {}
      });

      // Safari AirPlay wireless playback status listener
      const onAirplayWirelessChange = () => {
        const isWireless = Boolean(videoEl.webkitCurrentPlaybackTargetIsWireless);
        setCastingUiActive(isWireless, 'AirPlay TV');
        updateCastStatus(isWireless ? 'Playing via AirPlay' : 'Ready to connect to a TV or external player');
        if (isWireless) showPlayerStatus('AirPlay connected');
      };
      try {
        videoEl.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', onAirplayWirelessChange);
      } catch {}

      if (videoEl.remote) {
        try {
          videoEl.remote.addEventListener('connecting', () => updateCastStatus('Connecting to TV display…'));
          videoEl.remote.addEventListener('connect', () => {
            setCastingUiActive(true, 'TV Display');
            updateCastStatus('Casting to remote display');
            showPlayerStatus('Casting connected');
          });
          videoEl.remote.addEventListener('disconnect', () => {
            setCastingUiActive(false);
            updateCastStatus('Disconnected from remote display');
          });
        } catch {}
      }

      async function triggerCastToTv() {
        const target = pickCastableStreamSource(servers, currentServer);

        // 1. Official Google Cast Web Sender SDK (Chrome Desktop, Edge, Android Chrome)
        if (initGoogleCastContextIfReady() && window.cast?.framework?.CastContext) {
          try {
            const ctx = window.cast.framework.CastContext.getInstance();
            const existing = ctx.getCurrentSession();
            if (existing) {
              loadMediaIntoCastSession(existing);
              return;
            }
            updateCastStatus('Opening Chromecast device picker…');
            await ctx.requestSession();
            const session = ctx.getCurrentSession();
            if (session) loadMediaIntoCastSession(session);
            return;
          } catch (err) {
            const errStr = String(err?.code || err?.message || err || '').toLowerCase();
            if (errStr.includes('cancel')) {
              updateCastStatus('Cast cancelled');
              return;
            }
            if (errStr.includes('receiver_unavailable') || errStr.includes('no_devices')) {
              updateCastStatus('No Chromecast devices found on your Wi-Fi network');
              showPlayerStatus('No Chromecast devices found on Wi-Fi');
              return;
            }
            // Fall through to Remote Playback API if Cast SDK is blocked (e.g. inside iframe preview)
          }
        }

        // 2. W3C Remote Playback API using a real public HTTPS stream URL (avoids HLS.js blob: MediaSource failure)
        if (target.kind === 'direct' && target.url) {
          const canUseDirectOnMain = videoEl.currentSrc && isPublicHttpStreamUrl(videoEl.currentSrc);
          let promptEl = canUseDirectOnMain ? videoEl : null;
          if (!promptEl) {
            if (!castFallbackVideoEl) {
              castFallbackVideoEl = document.createElement('video');
              castFallbackVideoEl.crossOrigin = 'anonymous';
              castFallbackVideoEl.playsInline = true;
              castFallbackVideoEl.style.display = 'none';
              playerEl.appendChild(castFallbackVideoEl);
            }
            if (castFallbackVideoEl.src !== target.url) {
              castFallbackVideoEl.src = target.url;
            }
            promptEl = castFallbackVideoEl;
          }

          if (promptEl && promptEl.remote && typeof promptEl.remote.prompt === 'function') {
            try {
              updateCastStatus('Searching for Cast devices…');
              await promptEl.remote.prompt();
              return;
            } catch (err) {
              const name = err?.name || '';
              if (name === 'NotFoundError') {
                updateCastStatus('No Cast devices found on this Wi-Fi network');
                showPlayerStatus('No Cast devices found on Wi-Fi');
                return;
              }
              if (name === 'NotAllowedError') {
                updateCastStatus('Cast blocked inside embedded preview — open Kaira directly in Chrome or use VLC / Infuse below');
                showPlayerStatus('Open in Chrome tab or copy stream URL for TV');
                return;
              }
            }
          }
        }

        // 3. Clear, actionable guidance when browser lacks native Cast SDK (Firefox, embedded iframe, or embed-only server)
        if (target.kind === 'embed-only') {
          updateCastStatus('This embed server requires Chrome Cast Tab (⋮ → Cast) — or switch to a direct HLS server like Vega');
          showPlayerStatus('Use Chrome menu → Cast Tab for embed streams');
        } else if (window.self !== window.top) {
          updateCastStatus('Open Kaira in its own Chrome tab for Chromecast, or tap Open in VLC / Copy Stream URL below');
          showPlayerStatus('Open in a direct Chrome tab to cast');
        } else {
          updateCastStatus('Chromecast requires Chrome/Edge on the same Wi-Fi — or use Open in VLC / Infuse below');
          showPlayerStatus('Use Chrome for Chromecast, or VLC / Infuse');
        }
      }

      if (castRemoteBtn) {
        castRemoteBtn.onclick = async (e) => {
          e.stopPropagation();
          await triggerCastToTv();
          wakeControls();
        };
      }

      if (castDisconnectBtn) {
        castDisconnectBtn.onclick = (e) => {
          e.stopPropagation();
          stopActiveCastSession();
          wakeControls();
        };
      }

      if (castBannerStopBtn) {
        castBannerStopBtn.onclick = (e) => {
          e.stopPropagation();
          stopActiveCastSession();
        };
      }

      if (castBannerPlayBtn) {
        castBannerPlayBtn.onclick = (e) => {
          e.stopPropagation();
          if (castRemoteController) {
            try { castRemoteController.playOrPause(); } catch {}
          }
        };
      }

      if (topCastBtn) {
        topCastBtn.onclick = async (e) => {
          e.stopPropagation();
          await triggerCastToTv();
        };
      }

      if (castAirplayBtn) {
        castAirplayBtn.onclick = (e) => {
          e.stopPropagation();
          const target = pickCastableStreamSource(servers, currentServer);
          if (typeof videoEl.webkitShowPlaybackTargetPicker === 'function') {
            // Safari AirPlay cannot cast HLS.js blob: MediaSource URLs — switch to native .m3u8 first if needed
            if (
              target.kind === 'direct' &&
              target.url &&
              String(videoEl.currentSrc || '').startsWith('blob:') &&
              (videoEl.canPlayType('application/vnd.apple.mpegurl') || videoEl.canPlayType('application/x-mpegURL'))
            ) {
              const resumeAt = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0;
              if (currentHls) {
                try { currentHls.destroy(); } catch {}
                currentHls = null;
              }
              videoEl.src = target.url;
              videoEl.addEventListener('loadedmetadata', () => {
                if (resumeAt > 1) {
                  try { videoEl.currentTime = resumeAt; } catch {}
                }
                videoEl.play().catch(() => {});
              }, { once: true });
            }
            videoEl.webkitShowPlaybackTargetPicker();
            updateCastStatus('Opening AirPlay picker…');
          } else {
            updateCastStatus('AirPlay is supported in Safari on macOS, iOS, and iPadOS');
            showPlayerStatus('AirPlay requires Safari on Apple devices');
          }
          wakeControls();
        };
      }

      async function copyTextWithFeedback(text, successMsg) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
          }
          updateCastStatus(successMsg);
          showPlayerStatus(successMsg);
        } catch {
          updateCastStatus('Could not access clipboard');
          showPlayerStatus('Could not copy to clipboard');
        }
      }

      if (castVlcBtn) {
        castVlcBtn.onclick = (e) => {
          e.stopPropagation();
          const target = pickCastableStreamSource(servers, currentServer);
          const links = buildExternalPlayerLinks(target.url);
          if (!links.vlcUrl) {
            updateCastStatus('No direct HLS stream available for VLC on this title');
            showPlayerStatus('Direct HLS stream required for VLC');
            return;
          }
          updateCastStatus(`Opening ${target.server?.name || 'stream'} in VLC…`);
          showPlayerStatus('Launching VLC…');
          window.location.href = links.vlcUrl;
          wakeControls();
        };
      }

      if (castInfuseBtn) {
        castInfuseBtn.onclick = (e) => {
          e.stopPropagation();
          const target = pickCastableStreamSource(servers, currentServer);
          const links = buildExternalPlayerLinks(target.url);
          if (!links.infuseUrl) {
            updateCastStatus('No direct HLS stream available for Infuse on this title');
            showPlayerStatus('Direct HLS stream required for Infuse');
            return;
          }
          updateCastStatus(`Opening ${target.server?.name || 'stream'} in Infuse…`);
          showPlayerStatus('Launching Infuse…');
          window.location.href = links.infuseUrl;
          wakeControls();
        };
      }

      if (castCopyStreamBtn) {
        castCopyStreamBtn.onclick = (e) => {
          e.stopPropagation();
          const target = pickCastableStreamSource(servers, currentServer);
          if (target.url) {
            copyTextWithFeedback(target.url, `Public ${target.server?.name || ''} stream URL copied for VLC / Infuse`.replace(/\s+/g, ' '));
          } else {
            copyTextWithFeedback(window.location.href, 'No direct stream URL — copied Watch Link instead');
          }
          wakeControls();
        };
      }

      if (castShareLinkBtn) {
        castShareLinkBtn.onclick = (e) => {
          e.stopPropagation();
          copyTextWithFeedback(window.location.href, 'Watch link copied to clipboard');
          wakeControls();
        };
      }

      function toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          if (playerStage.requestFullscreen) {
            playerStage.requestFullscreen().catch(() => {});
          } else if (playerStage.webkitRequestFullscreen) {
            playerStage.webkitRequestFullscreen();
          } else if (typeof videoEl.webkitEnterFullscreen === 'function') {
            videoEl.webkitEnterFullscreen();
          }
          playerEl.setAttribute('data-fullscreen', '');
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
          playerEl.removeAttribute('data-fullscreen');
        }
      }

      const onFullscreenChange = () => {
        if (isDestroyed) return;
        const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
        if (isFs) playerEl.setAttribute('data-fullscreen', '');
        else playerEl.removeAttribute('data-fullscreen');
        renderActiveSubtitleCue();
      };
      document.addEventListener('fullscreenchange', onFullscreenChange);
      document.addEventListener('webkitfullscreenchange', onFullscreenChange);

      fsBtns.forEach(btn => {
        btn.onclick = (e) => { e.stopPropagation(); toggleFullscreen(); };
      });

      const onOutsideClick = (e) => {
        if (!activePopover) return;
        const popEls = [subsPopover, audioPopover, castPopover, serverMenu, subsBtn, audioBtn, castBtn, serverBtn];
        if (!popEls.some(el => el && el.contains(e.target))) {
          closeAllPopovers();
        }
      };

      if (serverBtn && serverMenu) {
        serverBtn.onclick = (e) => {
          e.stopPropagation();
          togglePopover('server');
        };

        const serverItems = serverMenu.querySelectorAll('.fx-menu-item');
        serverItems.forEach(item => {
          item.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(item.getAttribute('data-idx'), 10);
            currentServerIndex = idx;
            currentServer = servers[idx];

            if (serverName) serverName.textContent = currentServer.name;
            const qualityEl = watchRoot.querySelector('#fx-active-quality');
            if (qualityEl) qualityEl.textContent = currentServer.quality || 'HD';

            if (!isEmbedMode && Number.isFinite(videoEl.currentTime) && videoEl.currentTime >= CONTINUE_WATCHING_MIN_SECONDS) {
              resumeTargetSeconds = Math.floor(videoEl.currentTime);
              hasAppliedResume = false;
              resumeAttemptCount = 0;
            }
            try { localStorage.setItem('flicx:player:server', currentServer.name); } catch {}
            attachStream(currentServer);
            closeAllPopovers();

            serverItems.forEach(it => {
              const itIdx = parseInt(it.getAttribute('data-idx'), 10);
              it.setAttribute('aria-checked', String(itIdx === idx));
              const chk = it.querySelector('.atv-pop-check');
              if (chk) chk.innerHTML = itIdx === idx ? CHECK_SVG : '';
            });
            showPlayerStatus(`Server: ${currentServer.name}`);
            wakeControls();
          };
        });
      }

      document.addEventListener('click', onOutsideClick);

      function wakeControls() {
        if (isDestroyed) return;
        uiEl.setAttribute('data-chrome', '');
        uiEl.style.opacity = '1';
        playerEl.classList.add('atv-chrome-visible');
        clearTimeout(hideTimeout);
        if (isEmbedMode) return;
        hideTimeout = setTimeout(() => {
          if (!isDestroyed && !isEmbedMode && !activePopover && !activeDrawer && !videoEl.paused && !isPointerOverControls && !isScrubbing && !isAdjustingVolume) {
            uiEl.removeAttribute('data-chrome');
            uiEl.style.opacity = '0';
            playerEl.classList.remove('atv-chrome-visible');
          }
        }, 3800);
      }

      if (topBarEl) {
        topBarEl.addEventListener('mouseenter', () => { isPointerOverControls = true; wakeControls(); });
        topBarEl.addEventListener('mouseleave', () => { isPointerOverControls = false; wakeControls(); });
      }
      if (bottomBarEl) {
        bottomBarEl.addEventListener('mouseenter', () => { isPointerOverControls = true; wakeControls(); });
        bottomBarEl.addEventListener('mouseleave', () => { isPointerOverControls = false; wakeControls(); });
      }
      playerEl.addEventListener('pointermove', wakeControls);
      playerEl.addEventListener('mousemove', wakeControls);
      playerEl.addEventListener('click', wakeControls);
      playerEl.addEventListener('touchstart', wakeControls, { passive: true });
      wakeControls();

      const onKeyDown = (e) => {
        if (isDestroyed || !videoEl.isConnected) return;
        if (/^(input|textarea|select)$/i.test(document.activeElement?.tagName || '')) return;
        if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          togglePlay();
          wakeControls();
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          toggleFullscreen();
        } else if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          togglePopover('subs');
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          togglePiP();
        } else if ((e.key === 's' || e.key === 'S') && skipIntroVisible) {
          e.preventDefault();
          performSkipIntro();
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          toggleMuteStateUI();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          resumeTargetSeconds = 0;
          hasAppliedResume = true;
          videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
          updateTimeDisplay();
          persistPlaybackProgress(true);
          wakeControls();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          resumeTargetSeconds = 0;
          hasAppliedResume = true;
          videoEl.currentTime = Math.min(videoEl.duration || 1e9, videoEl.currentTime + 10);
          updateTimeDisplay();
          persistPlaybackProgress(true);
          wakeControls();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          applyVolume(Math.min(1, (videoEl.muted ? 0 : videoEl.volume) + 0.1));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          applyVolume(Math.max(0, (videoEl.muted ? 0 : videoEl.volume) - 0.1));
        } else if (e.key === 'Escape') {
          if (activePopover || activeDrawer) {
            closeAllPopovers();
            closeAllDrawers();
            wakeControls();
          }
        }
      };
      document.addEventListener('keydown', onKeyDown);

      const onPageHideSave = () => {
        if (!isDestroyed) persistPlaybackProgress(true);
      };
      const onVisibilitySave = () => {
        if (!isDestroyed && document.visibilityState === 'hidden') {
          persistPlaybackProgress(true);
        }
      };
      window.addEventListener('pagehide', onPageHideSave);
      document.addEventListener('visibilitychange', onVisibilitySave);

      // Register complete teardown hook so leaving /watch/* never leaks streams or listeners
      activePlayerCleanup = () => {
        if (!isDestroyed) {
          try { persistPlaybackProgress(true); } catch {}
        }
        isDestroyed = true;
        subtitleFetchToken += 1;
        activeSubtitleCues = [];
        stopHoldSpeedBoost();
        clearTimeout(hideTimeout);
        clearTimeout(statusTimeout);
        clearTimeout(resumePillTimeout);
        clearTimeout(streamLoadTimer);
        clearTimeout(singleTapTimer);
        clearTimeout(holdBoostTimer);
        clearTimeout(rippleHideTimer);
        clearInterval(upNextCountdownTimer);
        upNextCountdownTimer = null;
        window.removeEventListener('pagehide', onPageHideSave);
        document.removeEventListener('visibilitychange', onVisibilitySave);
        document.removeEventListener('fullscreenchange', onFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
        clearNativeStreamListeners();
        if (currentHls) {
          try { currentHls.destroy(); } catch {}
          currentHls = null;
        }
        if (embedFrameEl) {
          try { embedFrameEl.src = 'about:blank'; } catch {}
        }
        try {
          if (castSessionStateHandler && window.cast?.framework?.CastContext) {
            window.cast.framework.CastContext.getInstance().removeEventListener(
              window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
              castSessionStateHandler
            );
          }
          if (castFallbackVideoEl) {
            castFallbackVideoEl.removeAttribute('src');
            castFallbackVideoEl.remove();
            castFallbackVideoEl = null;
          }
          videoEl.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', onAirplayWirelessChange);
          videoEl.removeEventListener('enterpictureinpicture', onEnterPiP);
          videoEl.removeEventListener('leavepictureinpicture', onLeavePiP);
          videoEl.pause();
          videoEl.removeAttribute('src');
          videoEl.load();
        } catch {}
        window.removeEventListener('mousemove', onWindowMouseMove);
        window.removeEventListener('mouseup', onWindowMouseUp);
        window.removeEventListener('mouseup', onWindowGestureMouseUp);
        window.removeEventListener('pointerup', onWindowVolumePointerUp);
        window.removeEventListener('pointercancel', onWindowVolumePointerUp);
        window.removeEventListener('touchmove', onWindowTouchMove);
        window.removeEventListener('touchend', onWindowTouchEnd);
        window.removeEventListener('touchcancel', onWindowTouchEnd);
        document.removeEventListener('click', onOutsideClick);
        document.removeEventListener('keydown', onKeyDown);
      };
    }
  }

  // --- 3. Trailer Modal & Detail Page Controls (Trailers, Ratings, Downloads) ---
  let trailerCloseTimer = null;
  function openTrailerModal(trailerId, title) {
    if (!trailerId || !/^[A-Za-z0-9_-]{6,20}$/.test(trailerId)) {
      showKairaToast(`Trailer unavailable${title ? ' for ' + title : ''}`);
      return;
    }
    let modal = document.getElementById('flicx-trailer-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'flicx-trailer-modal';
      modal.className = 'kaira-trailer-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Trailer');
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
      modal.innerHTML = `
        <div class="kaira-trailer-box">
          <button type="button" id="close-trailer-modal" class="kaira-trailer-close" aria-label="Close trailer">&times;</button>
          <iframe id="trailer-iframe" class="kaira-trailer-iframe" title="Trailer" allow="autoplay; fullscreen; encrypted-media; picture-in-picture"></iframe>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#close-trailer-modal').onclick = (e) => {
        e.stopPropagation();
        closeTrailerModal();
      };
      modal.onclick = (e) => {
        if (e.target === modal) closeTrailerModal();
      };
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('kaira-modal-open')) {
          closeTrailerModal();
        }
      });
    }

    if (trailerCloseTimer) {
      clearTimeout(trailerCloseTimer);
      trailerCloseTimer = null;
    }

    const iframe = modal.querySelector('#trailer-iframe');
    const muteParam = (typeof settingsState !== 'undefined' && settingsState.trailerSound === false) ? '&mute=1' : '';
    iframe.title = title ? `Trailer: ${title}` : 'Trailer';
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerId)}?autoplay=1&rel=0${muteParam}`;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    void modal.offsetHeight;
    modal.classList.add('kaira-modal-open');
  }

  function closeTrailerModal(immediate = false) {
    const modal = document.getElementById('flicx-trailer-modal');
    if (!modal) return;
    if (trailerCloseTimer) {
      clearTimeout(trailerCloseTimer);
      trailerCloseTimer = null;
    }
    const iframe = modal.querySelector('#trailer-iframe');
    modal.classList.remove('kaira-modal-open');
    modal.setAttribute('aria-hidden', 'true');
    const delay = immediate || prefersReducedMotion() ? 0 : 230;
    if (delay === 0) {
      if (iframe) iframe.src = '';
      modal.style.display = 'none';
      return;
    }
    trailerCloseTimer = setTimeout(() => {
      trailerCloseTimer = null;
      if (!modal.classList.contains('kaira-modal-open')) {
        if (iframe) iframe.src = '';
        modal.style.display = 'none';
      }
    }, delay);
  }

  let detailActionsBound = false;
  function initDetailPageControls() {
    // 1. Restore saved 5-star user rating on movie/TV detail pages
    const rateGroup = document.querySelector('.rate-stars[role="radiogroup"]');
    if (rateGroup) {
      const rateKey = rateGroup.getAttribute('aria-labelledby') || normalizeWatchSlug(window.location.pathname);
      let ratingsMap = {};
      try { ratingsMap = JSON.parse(localStorage.getItem('kaira:ratings:v1') || '{}'); } catch {}
      const savedVal = Number(ratingsMap[rateKey]) || 0;
      const stars = Array.from(rateGroup.querySelectorAll('button[role="radio"]'));
      const applyRatingUI = (val) => {
        stars.forEach((btn, idx) => {
          const starNum = idx + 1;
          btn.setAttribute('aria-checked', String(starNum === val));
          btn.classList.toggle('rate-star-active', starNum <= val);
          btn.style.color = starNum <= val ? 'var(--color-flare, #f59e0b)' : '';
        });
      };
      applyRatingUI(savedVal);
      if (!rateGroup.__ratingBound) {
        rateGroup.__ratingBound = true;
        stars.forEach((btn, idx) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const starNum = idx + 1;
            let map = {};
            try { map = JSON.parse(localStorage.getItem('kaira:ratings:v1') || '{}'); } catch {}
            const nextVal = map[rateKey] === starNum ? 0 : starNum;
            if (nextVal === 0) delete map[rateKey];
            else map[rateKey] = nextVal;
            try { localStorage.setItem('kaira:ratings:v1', JSON.stringify(map)); } catch {}
            applyRatingUI(nextVal);
            showKairaToast(nextVal ? `Rated ${nextVal} of 5 stars` : 'Rating cleared');
          });
        });
      }
    }

    // 2. Wire "Show all N files" download expander
    document.querySelectorAll('button.dl-more').forEach((btn) => {
      if (btn.__dlMoreBound) return;
      btn.__dlMoreBound = true;
      const origLabel = btn.textContent.trim();
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const container = btn.closest('.downloads-part, section, div');
        const list = container?.querySelector('.dl-list');
        const isExpanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!isExpanded));
        if (list) {
          list.classList.toggle('dl-list-expanded', !isExpanded);
          list.querySelectorAll('li[hidden], li.hidden').forEach((li) => {
            li.hidden = isExpanded;
            li.classList.toggle('hidden', isExpanded);
          });
        }
        const folderLink = container?.querySelector('a.dl-folder');
        if (!isExpanded) {
          btn.textContent = 'Show fewer files';
          if (folderLink && (!list || list.children.length <= 3)) {
            showKairaToast('All available files are shown — use "Open the folder" for the complete directory.');
          }
        } else {
          btn.textContent = origLabel;
        }
      });
    });

    // 2b. Wire TV detail page season download rows (button.dl-file: "Season 1 · 20 files")
    document.querySelectorAll('button.dl-file').forEach((btn) => {
      if (btn.__dlSeasonBound) return;
      btn.__dlSeasonBound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isExpanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!isExpanded));

        const titleText = btn.querySelector('.dl-file-title')?.textContent || btn.textContent || '';
        const seasonMatch = titleText.match(/Season\s+(\d+)/i);
        const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
        const cleanPath = normalizeRoutePath(window.location.pathname);

        if (cleanPath.startsWith('/tv/')) {
          const showSlug = normalizeWatchSlug(cleanPath);
          const seasonTrigger = document.querySelector('button.title-select, [role="combobox"].title-select');
          if (seasonTrigger) {
            const labelSpan = seasonTrigger.querySelector('.title-select-text') || seasonTrigger;
            labelSpan.textContent = `Season ${seasonNum}`;
          }
          if (typeof loadSeasonEpisodes === 'function' && showSlug) {
            loadSeasonEpisodes(showSlug, seasonNum);
          }
          const episodesSection = document.querySelector('.rail-track[role="list"]')?.closest('section, .section');
          if (episodesSection) {
            episodesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          showKairaToast(`Showing Season ${seasonNum} episodes`);
        } else {
          const folderLink = btn.closest('.downloads-part, section, div')?.querySelector('a.dl-folder');
          showKairaToast(folderLink ? 'Use "Open the folder" below for direct season downloads.' : `Selected ${titleText.trim()}`);
        }
      });
    });

    // 3. Global delegated Trailer click handler (once)
    if (!detailActionsBound) {
      detailActionsBound = true;
      document.addEventListener('click', async (e) => {
        // A. Detail page trailer thumbnail cards
        const trailerCard = e.target.closest('button[aria-label^="Play trailer"]');
        if (trailerCard) {
          e.preventDefault();
          e.stopPropagation();
          const img = trailerCard.querySelector('img');
          const src = img?.getAttribute('src') || '';
          const m = src.match(/\/y\/vi\/([A-Za-z0-9_-]{6,20})\//);
          if (m) {
            openTrailerModal(m[1], trailerCard.getAttribute('aria-label') || 'Trailer');
          } else {
            showKairaToast('Trailer preview unavailable');
          }
          return;
        }

        // B. Hero or detail page "Trailer" capsule button
        const trailerBtn = e.target.closest('button.capsule-btn');
        if (trailerBtn && !trailerBtn.hasAttribute('data-watchlist-button') && /trailer/i.test(trailerBtn.textContent || '')) {
          e.preventDefault();
          e.stopPropagation();

          // If on detail page and trailer thumbnail already exists in DOM, play immediately
          const firstThumb = document.querySelector('button[aria-label^="Play trailer"] img[src*="/y/vi/"]');
          if (firstThumb && !trailerBtn.getAttribute('data-trailer-slug')) {
            const m = firstThumb.getAttribute('src').match(/\/y\/vi\/([A-Za-z0-9_-]{6,20})\//);
            if (m) {
              const title = document.querySelector('h1')?.textContent?.trim() || 'Trailer';
              openTrailerModal(m[1], title);
              return;
            }
          }

          const cleanPath = normalizeRoutePath(window.location.pathname);
          const slug =
            trailerBtn.getAttribute('data-trailer-slug') ||
            normalizeWatchSlug(cleanPath) ||
            currentHeroSlides[currentSlideIndex]?.slug;
          const title =
            trailerBtn.getAttribute('data-trailer-title') ||
            document.querySelector('h1')?.textContent?.trim() ||
            currentHeroSlides[currentSlideIndex]?.title ||
            '';
          const kind = trailerBtn.getAttribute('data-trailer-kind') || (cleanPath.startsWith('/tv/') ? 'show' : 'movie');

          const directTrailerId = trailerBtn.getAttribute('data-trailer-id');
          if (directTrailerId) {
            openTrailerModal(directTrailerId, title || slug);
            return;
          }

          if (!slug) {
            showKairaToast('Trailer unavailable');
            return;
          }

          showKairaToast(`Loading trailer for ${title || slug}...`);
          try {
            const meta = await resolveTitleMeta(slug, kind);
            if (meta && meta.trailerId) {
              openTrailerModal(meta.trailerId, meta.title || title);
            } else {
              showKairaToast(`No trailer available for ${title || slug}`);
            }
          } catch {
            showKairaToast('Could not load trailer right now');
          }
        }
      });
    }
  }

  // --- 4. Card Clicks & Navigation (Guarded single listener) ---
  let cardNavBound = false;
  function initCardNavigation() {
    if (cardNavBound) return;
    cardNavBound = true;
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-watchlist-button], .cover-add, .card-over-genre, button, input, select')) {
        return;
      }

      // Wire Cast & Crew /person/<id>-<slug> links cleanly to live Kaira search instead of 404
      const personLink = e.target.closest('a[href*="/person/"]');
      if (personLink) {
        const personQuery = parsePersonRouteToSearchQuery(personLink.getAttribute('href') || '');
        if (personQuery) {
          e.preventDefault();
          navigateTo(withBasePath(`/search?q=${encodeURIComponent(personQuery)}`));
          return;
        }
      }

      const card = e.target.closest('.card, .card-over, .card-action, [data-href]');
      if (!card) return;

      const link = card.querySelector('a[href]') || card.closest('a[href]');
      const href = card.getAttribute('data-href') || (link ? link.getAttribute('href') : null);
      const normHref = href ? normalizeRoutePath(href) : '';

      if (href && (normHref.startsWith('/movie/') || normHref.startsWith('/tv/') || normHref.startsWith('/genres/') || normHref.startsWith('/watch/') || normHref.startsWith('/collection/') || normHref.startsWith('/collections') || normHref.startsWith('/studio/') || normHref.startsWith('/just-added') || normHref.startsWith('/awards') || normHref.startsWith('/4k') || normHref.startsWith('/anime') || normHref.startsWith('/discover') || normHref.startsWith('/library') || normHref === '/top-rated' || normHref === '/new')) {
        stashCardMetaFromElement(card, normHref);
        e.preventDefault();
        navigateTo(withBasePath(href));
      }
    });
  }

  // --- 5. Horizontal Rail Scrolling ---
  function initRailScroll() {
    document.querySelectorAll('.rail-scroll, .rail-track, .rail').forEach(rail => {
      if (rail.__dragBound) return;
      rail.__dragBound = true;
      let isDown = false;
      let startX;
      let scrollLeft;

      rail.addEventListener('mousedown', (e) => {
        if (e.target.closest('a, button')) return;
        isDown = true;
        startX = e.pageX - rail.offsetLeft;
        scrollLeft = rail.scrollLeft;
      });
      rail.addEventListener('mouseleave', () => { isDown = false; });
      rail.addEventListener('mouseup', () => { isDown = false; });
      rail.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - rail.offsetLeft;
        const walk = (x - startX) * 1.5;
        rail.scrollLeft = scrollLeft - walk;
      });
    });

    document.querySelectorAll('.rail, .section').forEach(container => {
      const track = container.querySelector('.rail-track') || container.querySelector('.rail-scroll');
      if (!track) return;
      const prevBtn = container.querySelector('.rail-arrow[data-dir="prev"]');
      const nextBtn = container.querySelector('.rail-arrow[data-dir="next"]');

      function updateArrowStates() {
        if (prevBtn) {
          if (track.scrollLeft <= 5) {
            prevBtn.setAttribute('disabled', '');
            prevBtn.style.opacity = '0';
            prevBtn.style.pointerEvents = 'none';
          } else {
            prevBtn.removeAttribute('disabled');
            prevBtn.style.opacity = '1';
            prevBtn.style.pointerEvents = 'auto';
          }
        }
        if (nextBtn) {
          const maxScroll = track.scrollWidth - track.clientWidth - 5;
          if (track.scrollLeft >= maxScroll) {
            nextBtn.setAttribute('disabled', '');
            nextBtn.style.opacity = '0';
            nextBtn.style.pointerEvents = 'none';
          } else {
            nextBtn.removeAttribute('disabled');
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        }
      }

      if (prevBtn && !prevBtn.__arrowBound) {
        prevBtn.__arrowBound = true;
        prevBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const amount = track.clientWidth * 0.75;
          track.scrollBy({ left: -amount, behavior: 'smooth' });
        };
      }

      if (nextBtn && !nextBtn.__arrowBound) {
        nextBtn.__arrowBound = true;
        nextBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const amount = track.clientWidth * 0.75;
          track.scrollBy({ left: amount, behavior: 'smooth' });
        };
      }

      if (!track.__scrollArrowBound) {
        track.__scrollArrowBound = true;
        track.addEventListener('scroll', updateArrowStates, { passive: true });
      }
      updateArrowStates();
    });
  }

  // --- 6. Shared Poster Card Builder, Watchlist (+ Icon) & Dynamic Library ---
  const WATCHLIST_PLUS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"><path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z"></path></svg>';
  const WATCHLIST_CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"></path></svg>';

  // Shared card HTML generator: keeps <a class="card-link"> and <button class="cover-add"> INSIDE .card-art so container-query sizing (16cqi) is always card-relative!
  function renderPosterCardHtml(item, opts) {
    const isShow = item.kind === 'show' || (opts && opts.defaultIsTv) || isItemTvShow(item, false);
    const slug = normalizeWatchSlug(item.slug || '');
    const title = item.title || slug.replace(/-\d{4}$/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const year = item.year || (slug.match(/-(\d{4})$/)?.[1] || '');
    const detailUrl = isShow ? `/tv/${encodeURIComponent(slug)}` : `/movie/${encodeURIComponent(slug)}`;
    const posterUrl = safeImageUrl(item.poster) || (item.id ? `https://s.fli.cx/a/poster/medium/${encodeURIComponent(item.id)}/img` : '');
    const stillUrl = safeImageUrl(item.still) || '';
    const ratingStr = item.rating ? Number(item.rating).toFixed(1) : '';
    const genre = (Array.isArray(item.genres) && item.genres[0]) || item.genre || (opts && opts.fallbackGenre) || (isShow ? 'Series' : 'Film');
    const toneColor = safeColor(item.tone, '#2a2623');
    const inLib = isInWatchlist(slug);

    return `
      <div class="card" style="--tone:${toneColor}">
        <div class="card-art card-poster">
          <span class="card-pic">
            ${posterUrl
              ? `<img data-fade="true" src="${escapeAttr(posterUrl)}" ${stillUrl ? `data-fallback-src="${escapeAttr(stillUrl)}"` : ''} alt="" width="500" height="750" loading="lazy" decoding="async" draggable="false" />`
              : `<img data-fade="true" data-failed="true" alt="" width="500" height="750" />`}
          </span>
          <span class="card-fallback" aria-hidden="true">${escapeHtml(title)}</span>
          <span class="card-over">
            <span class="card-over-cap">
              <span class="card-over-title" aria-hidden="true">${escapeHtml(title)}</span>
              <span class="card-over-meta">
                <span class="card-over-genre">${escapeHtml(genre)}</span>
                <span class="card-over-year">${escapeHtml(year)}</span>
                ${ratingStr ? `<span class="card-over-score" aria-label="Rated ${escapeAttr(ratingStr)} out of 10">${escapeHtml(ratingStr)}<span class="card-over-star" aria-hidden="true"></span></span>` : ''}
              </span>
            </span>
          </span>
          <a class="card-link" data-film="${escapeAttr(slug)}" data-rail-focus="true" aria-label="${escapeAttr(title)}${year ? ` (${escapeAttr(year)})` : ''}" href="${escapeAttr(detailUrl)}"></a>
          <button type="button" class="cover-add" aria-pressed="${inLib ? 'true' : 'false'}" aria-label="${inLib ? 'In your library' : 'Add to library'}: ${escapeAttr(title)}" title="${inLib ? 'In your library' : 'Add to library'}" tabindex="-1" data-watchlist-button="" data-title-slug="${escapeAttr(slug)}" data-title-id="${escapeAttr(item.id || '')}" data-title="${escapeAttr(title)}" data-title-kind="${isShow ? 'show' : 'movie'}" data-title-year="${escapeAttr(year)}" data-title-rating="${escapeAttr(ratingStr)}" data-title-genre="${escapeAttr(genre)}" data-title-tone="${escapeAttr(toneColor)}">
            ${inLib ? WATCHLIST_CHECK_SVG : WATCHLIST_PLUS_SVG}
          </button>
        </div>
      </div>
    `;
  }

  // --- 6a. Continue Watching (Per-Browser Playback Progress Engine & UI Rails) ---
  const CONTINUE_WATCHING_KEY = 'kaira:continue-watching:v1';
  const LEGACY_CONTINUE_WATCHING_KEY = 'flicx:player:progress';
  const CONTINUE_WATCHING_MIN_SECONDS = 5;
  const CONTINUE_WATCHING_COMPLETE_RATIO = 0.92;
  const CONTINUE_WATCHING_MAX_ITEMS = 24;

  function computeProgressMetrics(currentTime, duration, mode) {
    if (mode === 'embed') {
      return { shouldTrack: true, isCompleted: false, progressPercent: 0, remainingSeconds: 0 };
    }
    const safeTime = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    if (safeDuration > 0 && (safeTime / safeDuration) >= CONTINUE_WATCHING_COMPLETE_RATIO) {
      return { shouldTrack: false, isCompleted: true, progressPercent: 100, remainingSeconds: 0 };
    }
    if (safeTime < CONTINUE_WATCHING_MIN_SECONDS) {
      return {
        shouldTrack: false,
        isCompleted: false,
        progressPercent: 0,
        remainingSeconds: safeDuration > 0 ? Math.max(0, safeDuration - safeTime) : 0
      };
    }
    const pct = safeDuration > 0
      ? Math.min(99, Math.max(1, Math.round((safeTime / safeDuration) * 100)))
      : 0;
    return {
      shouldTrack: true,
      isCompleted: false,
      progressPercent: pct,
      remainingSeconds: safeDuration > 0 ? Math.max(0, safeDuration - safeTime) : 0
    };
  }

  function formatContinueTimeLeft(entry) {
    if (!entry) return 'Resume';
    const epPrefix =
      entry.kind === 'show' && entry.season && entry.episode
        ? `S${entry.season} E${entry.episode} · `
        : entry.kind === 'anime' && entry.episode
          ? `Ep ${entry.episode} · `
          : '';
    if (entry.mode === 'embed' || !entry.duration || entry.duration <= 0) {
      return `${epPrefix}Resume`;
    }
    const remaining = Math.max(0, entry.duration - (entry.currentTime || 0));
    if (remaining < 60) return `${epPrefix}< 1m left`;
    const totalMins = Math.ceil(remaining / 60);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0) {
      return mins > 0 ? `${epPrefix}${hours}h ${mins}m left` : `${epPrefix}${hours}h left`;
    }
    return `${epPrefix}${mins}m left`;
  }

  function formatResumeTimestamp(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function getResumeTimeForEntry(entry, season, episode) {
    if (!entry || entry.mode !== 'direct') return 0;
    if (entry.kind === 'show') {
      if (typeof season === 'number' && typeof entry.season === 'number' && entry.season !== season) return 0;
      if (typeof episode === 'number' && typeof entry.episode === 'number' && entry.episode !== episode) return 0;
    } else if (entry.kind === 'anime') {
      if (typeof episode === 'number' && typeof entry.episode === 'number' && entry.episode !== episode) return 0;
    }
    const metrics = computeProgressMetrics(entry.currentTime, entry.duration, 'direct');
    if (!metrics.shouldTrack || metrics.isCompleted) return 0;
    return Math.floor(entry.currentTime);
  }

  function normalizeContinueWatchingRecord(rawItem, fallbackSlug) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const clean = normalizeWatchSlug(rawItem.slug || fallbackSlug);
    if (!clean) return null;

    const isLegacyNext = typeof rawItem.t === 'number' || typeof rawItem.d === 'number' || typeof rawItem.at === 'number';
    const currentTime = Number(isLegacyNext ? (rawItem.currentTime ?? rawItem.t) : rawItem.currentTime) || 0;
    const duration = Number(isLegacyNext ? (rawItem.duration ?? rawItem.d) : rawItem.duration) || 0;
    const updatedAt = Number(isLegacyNext ? (rawItem.updatedAt ?? rawItem.at) : rawItem.updatedAt) || 0;

    const seasonNum = Number(rawItem.season);
    const episodeNum = Number(rawItem.episode);
    const season = Number.isFinite(seasonNum) && seasonNum > 0 ? Math.floor(seasonNum) : undefined;
    const episode = Number.isFinite(episodeNum) && episodeNum > 0 ? Math.floor(episodeNum) : undefined;

    const kind =
      rawItem.kind === 'anime'
        ? 'anime'
        : rawItem.kind === 'show' || rawItem.show === true || (season !== undefined && episode !== undefined)
          ? 'show'
          : 'movie';
    const mode = rawItem.mode === 'embed' ? 'embed' : 'direct';
    const metrics = computeProgressMetrics(currentTime, duration, mode);
    if (metrics.isCompleted) return null;
    if (mode === 'direct' && !metrics.shouldTrack) return null;

    const defaultTitle = clean
      .replace(/-\d{4}$/, '')
      .split('-')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const defaultWatchUrl = kind === 'show' && season && episode
      ? `/watch/${encodeURIComponent(clean)}/s${season}e${episode}`
      : `/watch/${encodeURIComponent(clean)}`;
    const defaultDetailUrl = kind === 'anime'
      ? '/anime'
      : kind === 'show'
        ? `/tv/${encodeURIComponent(clean)}`
        : `/movie/${encodeURIComponent(clean)}`;

    return {
      ...rawItem,
      slug: clean,
      title: (typeof rawItem.title === 'string' && rawItem.title.trim()) ? rawItem.title.trim() : defaultTitle,
      kind,
      watchUrl: (typeof rawItem.watchUrl === 'string' && rawItem.watchUrl) ? rawItem.watchUrl : defaultWatchUrl,
      detailUrl: (typeof rawItem.detailUrl === 'string' && rawItem.detailUrl) ? rawItem.detailUrl : defaultDetailUrl,
      season,
      episode,
      mode,
      currentTime: mode === 'embed' ? 0 : Math.floor(currentTime),
      duration: mode === 'embed' ? 0 : Math.floor(Math.max(0, duration)),
      progressPercent: (Number(rawItem.progressPercent) > 0)
        ? Math.min(99, Math.round(Number(rawItem.progressPercent)))
        : metrics.progressPercent,
      updatedAt
    };
  }

  function parseContinueWatchingRaw(raw) {
    if (!raw || typeof raw !== 'object') return [];
    const parsed = [];
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const rec = normalizeContinueWatchingRecord(item);
        if (rec) parsed.push(rec);
      }
    } else if (Array.isArray(raw.items)) {
      for (const item of raw.items) {
        const rec = normalizeContinueWatchingRecord(item);
        if (rec) parsed.push(rec);
      }
    } else {
      for (const [key, val] of Object.entries(raw)) {
        if (key === 'items' || !val || typeof val !== 'object' || Array.isArray(val)) continue;
        const rec = normalizeContinueWatchingRecord(val, key);
        if (rec) parsed.push(rec);
      }
    }
    return parsed;
  }

  function getContinueWatchingItems() {
    let list = [];
    try {
      const primaryRaw = JSON.parse(localStorage.getItem(CONTINUE_WATCHING_KEY) || 'null');
      const primaryItems = parseContinueWatchingRaw(primaryRaw);

      let legacyItems = [];
      let hadLegacyKey = false;
      try {
        const legacyStr = localStorage.getItem(LEGACY_CONTINUE_WATCHING_KEY);
        if (legacyStr) {
          hadLegacyKey = true;
          legacyItems = parseContinueWatchingRaw(JSON.parse(legacyStr));
        }
      } catch {}

      const bySlug = new Map();
      for (const item of [...primaryItems, ...legacyItems]) {
        const prev = bySlug.get(item.slug);
        if (!prev || (item.updatedAt || 0) > (prev.updatedAt || 0)) {
          bySlug.set(item.slug, item);
        }
      }

      list = Array.from(bySlug.values())
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, CONTINUE_WATCHING_MAX_ITEMS);

      if (hadLegacyKey) {
        if (list.length > 0) {
          localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify({ items: list }));
        }
        localStorage.removeItem(LEGACY_CONTINUE_WATCHING_KEY);
      }
    } catch {}
    document.documentElement.classList.toggle('has-progress', list.length > 0);
    return list;
  }

  function saveContinueWatchingItems(items) {
    const cleanList = (Array.isArray(items) ? items : []).slice(0, CONTINUE_WATCHING_MAX_ITEMS);
    try {
      if (cleanList.length === 0) {
        localStorage.removeItem(CONTINUE_WATCHING_KEY);
      } else {
        localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify({ items: cleanList }));
      }
      localStorage.removeItem(LEGACY_CONTINUE_WATCHING_KEY);
    } catch {}
    document.documentElement.classList.toggle('has-progress', cleanList.length > 0);
    return cleanList;
  }

  function getContinueWatchingBySlug(slug) {
    const clean = normalizeWatchSlug(slug);
    if (!clean) return null;
    return getContinueWatchingItems().find(item => item.slug === clean) || null;
  }

  function upsertContinueWatchingProgress(incoming) {
    const cleanSlug = normalizeWatchSlug(incoming?.slug);
    if (!cleanSlug) return [];
    const existing = getContinueWatchingItems();
    const prevMatch = existing.find(item => item.slug === cleanSlug);
    const mode = incoming.mode === 'embed' ? 'embed' : 'direct';
    const metrics = computeProgressMetrics(incoming.currentTime, incoming.duration, mode);
    const filtered = existing.filter(item => item.slug !== cleanSlug);

    if (metrics.isCompleted) {
      return saveContinueWatchingItems(filtered);
    }
    if (!metrics.shouldTrack) {
      return existing;
    }

    const sameEpisode =
      !prevMatch ||
      (prevMatch.kind === 'show'
        ? prevMatch.season === incoming.season && prevMatch.episode === incoming.episode
        : prevMatch.kind === 'anime'
          ? prevMatch.episode === incoming.episode
          : true);

    const shouldPreserveDirect =
      mode === 'embed' &&
      Boolean(prevMatch) &&
      sameEpisode &&
      prevMatch.mode === 'direct' &&
      prevMatch.currentTime >= CONTINUE_WATCHING_MIN_SECONDS &&
      prevMatch.duration > 0;

    const nextEntry = shouldPreserveDirect
      ? {
          ...prevMatch,
          ...incoming,
          slug: cleanSlug,
          mode: 'direct',
          currentTime: prevMatch.currentTime,
          duration: prevMatch.duration,
          progressPercent: prevMatch.progressPercent,
          updatedAt: typeof incoming.updatedAt === 'number' ? incoming.updatedAt : Date.now()
        }
      : {
          ...incoming,
          slug: cleanSlug,
          mode,
          currentTime: mode === 'embed' ? 0 : Math.floor(incoming.currentTime || 0),
          duration: mode === 'embed' ? 0 : Math.floor(Math.max(0, incoming.duration || 0)),
          progressPercent: metrics.progressPercent,
          updatedAt: typeof incoming.updatedAt === 'number' ? incoming.updatedAt : Date.now()
        };

    const updated = [nextEntry, ...filtered]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, CONTINUE_WATCHING_MAX_ITEMS);
    return saveContinueWatchingItems(updated);
  }

  function removeContinueWatchingBySlug(slug) {
    const clean = normalizeWatchSlug(slug);
    if (!clean) return;
    const next = getContinueWatchingItems().filter(item => item.slug !== clean);
    saveContinueWatchingItems(next);
    refreshContinueWatchingUI();
  }

  function clearAllContinueWatching() {
    try { localStorage.removeItem(LEGACY_CONTINUE_WATCHING_KEY); } catch {}
    saveContinueWatchingItems([]);
    refreshContinueWatchingUI();
  }

  function markLoadedContinueWatchingImages(container) {
    if (!container) return;
    container.querySelectorAll('img[data-fade="true"]').forEach(img => {
      if (img.complete && img.naturalWidth > 0) {
        img.setAttribute('data-loaded', '');
      }
    });
  }

  function renderContinueWatchingCardHtml(entry) {
    const slug = normalizeWatchSlug(entry.slug);
    const title = entry.title || slug.replace(/-\d{4}$/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const posterUrl = safeImageUrl(entry.poster) || (entry.imdbId ? `https://s.fli.cx/a/poster/medium/${encodeURIComponent(entry.imdbId)}/img` : '');
    const watchHref = withBasePath(entry.watchUrl || `/watch/${encodeURIComponent(slug)}`);
    const timeLeftLabel = formatContinueTimeLeft(entry);
    const pct = entry.mode === 'direct' && entry.progressPercent > 0 ? Math.min(99, Math.max(2, entry.progressPercent)) : 0;
    const toneColor = safeColor(entry.tone, '#2a2623');

    return `
      <div class="card kaira-cw-card" style="--tone:${toneColor}" data-cw-slug="${escapeAttr(slug)}">
        <div class="card-art card-poster">
          <span class="card-pic">
            ${posterUrl
              ? `<img data-fade="true" src="${escapeAttr(posterUrl)}" alt="" width="500" height="750" loading="lazy" decoding="async" draggable="false" onload="this.setAttribute('data-loaded','')" onerror="this.setAttribute('data-failed','true')" />`
              : `<img data-fade="true" data-failed="true" alt="" width="500" height="750" />`}
          </span>
          <span class="card-fallback" aria-hidden="true">${escapeHtml(title)}</span>
          <span class="kaira-cw-play-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M5.5 4.5v15l13-7.5-13-7.5Z"/></svg>
          </span>
          <span class="kaira-cw-overlay">
            <span class="kaira-cw-title">${escapeHtml(title)}</span>
            <span class="kaira-cw-meta">${escapeHtml(timeLeftLabel)}</span>
            ${pct > 0
              ? `<span class="kaira-cw-track" aria-hidden="true"><span class="kaira-cw-fill" style="width:${pct}%"></span></span>`
              : `<span class="kaira-cw-track kaira-cw-track-embed" aria-hidden="true"><span class="kaira-cw-fill" style="width:100%"></span></span>`}
          </span>
          <a class="card-link" data-film="${escapeAttr(slug)}" data-rail-focus="true" aria-label="Continue watching ${escapeAttr(title)} (${escapeAttr(timeLeftLabel)})" href="${escapeAttr(watchHref)}"></a>
          <button type="button" class="kaira-cw-remove" data-cw-remove="${escapeAttr(slug)}" aria-label="Remove ${escapeAttr(title)} from Continue Watching" title="Remove from Continue Watching">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  function buildContinueWatchingSectionHtml(sectionId, items) {
    return `
      <section id="${escapeAttr(sectionId)}" class="section pt-6 md:pt-4 kaira-cw-section" aria-labelledby="${escapeAttr(sectionId)}-title">
        <header class="shell gutter relative z-[1] mb-4 flex justify-between md:mb-5 items-baseline gap-6">
          <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="${escapeAttr(sectionId)}-title" class="section-title min-w-0 max-w-full text-section font-semibold">
              <span class="title-row">Continue Watching</span>
            </h2>
          </div>
          <button type="button" class="section-action kaira-cw-clear-all -mr-2 flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2">Clear all</button>
        </header>
        <div class="shell">
          <div class="rail">
            <div role="list" aria-label="Continue Watching" class="rail-track [--cols:2.35] sm:[--cols:3.4] md:[--cols:4.3] lg:[--cols:5] xl:[--cols:6] 2xl:[--cols:7]">
              ${items.map(item => `<div role="listitem">${renderContinueWatchingCardHtml(item)}</div>`).join('')}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderContinueWatchingHomeRail() {
    document.querySelectorAll('.continue-outline').forEach(el => el.remove());
    const cleanPath = normalizeRoutePath(window.location.pathname);
    const existing = document.getElementById('kaira-continue-watching-section');
    if (cleanPath !== '/' && cleanPath !== '/index.html') {
      if (existing) existing.remove();
      return;
    }
    const items = getContinueWatchingItems();
    if (items.length === 0) {
      if (existing) existing.remove();
      return;
    }

    const html = buildContinueWatchingSectionHtml('kaira-continue-watching-section', items);
    if (existing) {
      existing.outerHTML = html;
    } else {
      const hero = document.querySelector('section.hero');
      const main = document.querySelector('main');
      if (hero && hero.parentNode) {
        hero.insertAdjacentHTML('afterend', html);
      } else if (main) {
        main.insertAdjacentHTML('afterbegin', html);
      }
    }
    markLoadedContinueWatchingImages(document.getElementById('kaira-continue-watching-section'));
    try { initRailScroll(); } catch {}
  }

  function renderContinueWatchingLibraryRail() {
    const cleanPath = normalizeRoutePath(window.location.pathname);
    const existing = document.getElementById('kaira-library-cw-section');
    if (cleanPath !== '/library') {
      if (existing) existing.remove();
      return;
    }
    const items = getContinueWatchingItems();
    if (items.length === 0) {
      if (existing) existing.remove();
      return;
    }
    const html = buildContinueWatchingSectionHtml('kaira-library-cw-section', items);
    if (existing) {
      existing.outerHTML = html;
    } else {
      const firstSection = document.querySelector('main section.section, section.section');
      if (firstSection && firstSection.parentNode) {
        firstSection.insertAdjacentHTML('beforebegin', html);
      }
    }
    markLoadedContinueWatchingImages(document.getElementById('kaira-library-cw-section'));
    try { initRailScroll(); } catch {}
  }

  function syncDetailContinueWatchingButton() {
    const cleanPath = normalizeRoutePath(window.location.pathname);
    if (!cleanPath.startsWith('/movie/') && !cleanPath.startsWith('/tv/')) return;
    const slug = normalizeWatchSlug(cleanPath);
    if (!slug) return;
    const playBtn = document.querySelector('.hero-actions a.capsule-btn-play');
    if (!playBtn) return;

    if (!playBtn.dataset.origHtml) {
      playBtn.dataset.origHtml = playBtn.innerHTML;
      playBtn.dataset.origHref = playBtn.getAttribute('href') || '';
    }

    const entry = getContinueWatchingBySlug(slug);
    if (!entry) {
      playBtn.classList.remove('kaira-btn-continue');
      playBtn.style.removeProperty('--cw-pct');
      if (playBtn.dataset.origHtml) playBtn.innerHTML = playBtn.dataset.origHtml;
      if (playBtn.dataset.origHref) playBtn.setAttribute('href', playBtn.dataset.origHref);
      return;
    }

    const timeLabel = formatContinueTimeLeft(entry);
    const pct = entry.mode === 'direct' && entry.progressPercent > 0 ? entry.progressPercent : 0;
    const playIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M4.66 4.62v14.76c0 1.02 1.1 1.66 1.98 1.14l12.06-7.38a1.33 1.33 0 0 0 0-2.28L6.64 3.48C5.76 2.96 4.66 3.6 4.66 4.62Z"></path></svg>';
    playBtn.setAttribute('href', withBasePath(entry.watchUrl || playBtn.dataset.origHref));
    playBtn.classList.add('kaira-btn-continue');
    playBtn.style.setProperty('--cw-pct', `${pct}%`);
    playBtn.innerHTML = `${playIcon}<span>Continue Watching</span>${timeLabel && timeLabel !== 'Resume' ? `<span class="kaira-continue-meta">${escapeHtml(timeLabel)}</span>` : ''}`;
  }

  function refreshContinueWatchingUI() {
    try { renderContinueWatchingHomeRail(); } catch {}
    try { renderContinueWatchingLibraryRail(); } catch {}
    try { syncDetailContinueWatchingButton(); } catch {}
  }

  let continueWatchingBound = false;
  function initContinueWatching() {
    refreshContinueWatchingUI();
    // Guard against late Next.js hydration removing the home rail or leaving skeletons
    const cleanPath = normalizeRoutePath(window.location.pathname);
    if (cleanPath === '/' || cleanPath === '/index.html') {
      setTimeout(() => {
        try {
          if (normalizeRoutePath(window.location.pathname) === '/' && getContinueWatchingItems().length > 0 && !document.getElementById('kaira-continue-watching-section')) {
            renderContinueWatchingHomeRail();
          } else {
            document.querySelectorAll('.continue-outline').forEach(el => el.remove());
          }
        } catch {}
      }, 600);
    }
    if (continueWatchingBound) return;
    continueWatchingBound = true;
    window.addEventListener('storage', (e) => {
      if (!e.key || e.key === CONTINUE_WATCHING_KEY || e.key === LEGACY_CONTINUE_WATCHING_KEY) {
        refreshContinueWatchingUI();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !normalizeRoutePath(window.location.pathname).startsWith('/watch/')) {
        refreshContinueWatchingUI();
      }
    });
    document.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('button.kaira-cw-remove');
      if (removeBtn) {
        e.preventDefault();
        e.stopPropagation();
        const slug = removeBtn.getAttribute('data-cw-remove');
        if (slug) {
          const itemEl = removeBtn.closest('[role="listitem"]');
          const delay = itemEl && !prefersReducedMotion() ? 210 : 0;
          if (itemEl && delay > 0) {
            itemEl.classList.add('kaira-cw-removing');
            setTimeout(() => {
              removeContinueWatchingBySlug(slug);
              showKairaToast('Removed from Continue Watching');
            }, delay);
          } else {
            removeContinueWatchingBySlug(slug);
            showKairaToast('Removed from Continue Watching');
          }
        }
        return;
      }
      const clearAllBtn = e.target.closest('button.kaira-cw-clear-all');
      if (clearAllBtn) {
        e.preventDefault();
        e.stopPropagation();
        const sectionEl = clearAllBtn.closest('.kaira-cw-section');
        const delay = sectionEl && !prefersReducedMotion() ? 220 : 0;
        if (sectionEl && delay > 0) {
          sectionEl.classList.add('kaira-cw-section-closing');
          setTimeout(() => {
            clearAllContinueWatching();
            showKairaToast('Continue Watching cleared');
          }, delay);
        } else {
          clearAllContinueWatching();
          showKairaToast('Continue Watching cleared');
        }
      }
    });
  }

  function getWatchlistItems() {
    try {
      const raw = JSON.parse(localStorage.getItem('flicx:watchlist:v1') || 'null');
      if (Array.isArray(raw)) {
        return raw
          .map(entry => (typeof entry === 'string' ? { slug: normalizeWatchSlug(entry) } : entry))
          .filter(item => item && item.slug)
          .map(item => ({ ...item, slug: normalizeWatchSlug(item.slug) }));
      }
      if (raw && Array.isArray(raw.items)) {
        return raw.items
          .map(entry => (typeof entry === 'string' ? { slug: normalizeWatchSlug(entry) } : entry))
          .filter(item => item && item.slug)
          .map(item => ({ ...item, slug: normalizeWatchSlug(item.slug) }));
      }
    } catch {}
    return [];
  }

  function getWatchlist() {
    return getWatchlistItems().map(item => item.slug);
  }

  function saveWatchlistItems(items) {
    // Deduplicate by normalized slug while preserving insertion order
    const deduped = [];
    const seen = new Set();
    for (const item of items) {
      const clean = normalizeWatchSlug(item?.slug);
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      deduped.push({ ...item, slug: clean });
    }
    try {
      localStorage.setItem('flicx:watchlist:v1', JSON.stringify({ items: deduped }));
    } catch {}
    document.documentElement.setAttribute('data-watchlist', deduped.length ? 'some' : 'empty');
    return deduped;
  }

  function isInWatchlist(slug) {
    const clean = normalizeWatchSlug(slug);
    if (!clean) return false;
    return getWatchlist().includes(clean);
  }

  function extractItemMetaFromElement(btn) {
    const card = btn.closest('.card, .card-over, .hero-copy, .hero-actions, .hero, article');
    let rawSlug =
      btn.getAttribute('data-title-slug') ||
      btn.getAttribute('data-slug') ||
      (card && card.querySelector('a.card-link, a[href^="/movie/"], a[href^="/tv/"]')
        ? card.querySelector('a.card-link, a[href^="/movie/"], a[href^="/tv/"]').getAttribute('href')
        : null);

    if (!rawSlug && /^\/(movie|tv)\//.test(window.location.pathname)) {
      rawSlug = window.location.pathname;
    }
    if (!rawSlug && card) {
      const anyLink = card.querySelector('a[href]');
      if (anyLink) rawSlug = anyLink.getAttribute('href');
    }

    const slug = normalizeWatchSlug(rawSlug || '');
    if (!slug) return null;

    const kindAttr = btn.getAttribute('data-title-kind');
    const detailLink = card?.querySelector('a[href^="/movie/"], a[href^="/tv/"]');
    const kind =
      kindAttr ||
      (detailLink && detailLink.getAttribute('href')?.startsWith('/tv/') ? 'show' : null) ||
      (window.location.pathname.startsWith('/tv/') ? 'show' : 'movie');

    const title =
      btn.getAttribute('data-title') ||
      card?.querySelector('.card-over-title')?.textContent?.trim() ||
      card?.querySelector('.card-fallback')?.textContent?.trim() ||
      card?.querySelector('h1, h2.sr-only, h2')?.textContent?.trim() ||
      slug.replace(/-\d{4}$/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const imgEl = card?.querySelector('.card-pic img, img[src*="/a/poster/"]');
    const posterSrc = imgEl?.getAttribute('src') || '';
    const idFromPoster = posterSrc.match(/\/(tt\d+)\//)?.[1] || '';
    const idFromRate = document.querySelector('[id^="rate-tt"]')?.id?.replace(/^rate-/, '') || '';
    const id = btn.getAttribute('data-title-id') || idFromPoster || (window.location.pathname.includes(slug) ? idFromRate : '');

    const year =
      btn.getAttribute('data-title-year') ||
      card?.querySelector('.card-over-year')?.textContent?.trim() ||
      (slug.match(/-(\d{4})$/)?.[1] || '');

    const rating =
      btn.getAttribute('data-title-rating') ||
      card?.querySelector('.card-over-score')?.textContent?.trim()?.replace(/[^\d.]/g, '') ||
      '';

    const genre =
      btn.getAttribute('data-title-genre') ||
      card?.querySelector('.card-over-genre')?.textContent?.trim() ||
      '';

    const tone =
      btn.getAttribute('data-title-tone') ||
      card?.style?.getPropertyValue('--tone')?.trim() ||
      '#2a2623';

    return {
      slug,
      id: id || undefined,
      title,
      kind,
      year,
      rating,
      genre,
      poster: posterSrc || (id ? `https://s.fli.cx/a/poster/medium/${id}/img` : ''),
      tone,
      addedAt: Date.now()
    };
  }

  // Always render Add to library as a crisp + icon (or checkmark when saved) on both hero capsules & poster cards
  function updateWatchlistButton(btn, inLib, title) {
    btn.setAttribute('aria-pressed', inLib ? 'true' : 'false');
    btn.setAttribute('title', inLib ? 'In your library' : 'Add to library');
    btn.setAttribute('aria-label', `${inLib ? 'In your library' : 'Add to library'}${title ? ': ' + title : ''}`);
    if (btn.classList.contains('capsule-btn') || btn.closest('.capsule')) {
      btn.classList.remove('capsule-btn-text');
    }
    btn.innerHTML = inLib ? WATCHLIST_CHECK_SVG : WATCHLIST_PLUS_SVG;
  }

  function syncWatchlistButtonsForSlug(slug, inLib, title) {
    const clean = normalizeWatchSlug(slug);
    document.querySelectorAll('button[data-watchlist-button], button.cover-add').forEach(btn => {
      const meta = extractItemMetaFromElement(btn);
      if (meta && meta.slug === clean) {
        updateWatchlistButton(btn, inLib, title || meta.title);
      }
    });
  }

  async function renderLibraryPage() {
    const cleanPath = normalizeRoutePath(window.location.pathname);
    const items = getWatchlistItems();
    document.documentElement.setAttribute('data-watchlist', items.length ? 'some' : 'empty');

    if (cleanPath !== '/library') return;
    renderContinueWatchingLibraryRail();

    const grid = document.querySelector('ul.film-grid');
    const emptyState = document.querySelector('.empty-state');
    const countEl = document.querySelector('#library-title span:nth-of-type(2)');
    if (countEl) {
      countEl.textContent = items.length ? `${items.length} ${items.length === 1 ? 'title' : 'titles'}` : '';
    }

    if (!grid) return;

    if (items.length === 0) {
      grid.innerHTML = '';
      if (emptyState) emptyState.style.display = '';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    grid.style.display = 'grid';

    // Enrich any slug-only legacy items with real title/poster metadata
    let didEnrich = false;
    const enriched = await Promise.all(
      items.map(async (item) => {
        if (item.id && item.title && item.poster) return item;
        try {
          const meta = await resolveTitleMeta(item.slug, item.kind);
          if (meta) {
            didEnrich = true;
            return {
              ...item,
              id: meta.id || item.id,
              title: meta.title || item.title,
              year: meta.year || item.year,
              kind: meta.kind || item.kind || 'movie',
              poster: meta.poster || item.poster,
              rating: meta.rating || item.rating,
              genre: (meta.genres && meta.genres[0]) || item.genre
            };
          }
        } catch {}
        return item;
      })
    );

    if (didEnrich) {
      saveWatchlistItems(enriched);
    }

    // Abort if user navigated away during fetch
    if (normalizeRoutePath(window.location.pathname) !== '/library') return;

    grid.innerHTML = enriched
      .map(item => `<li>${renderPosterCardHtml(item)}</li>`)
      .join('');
  }

  let watchlistBound = false;
  function initWatchlist() {
    // Sync data-watchlist attribute & normalize legacy storage on load
    const existing = getWatchlistItems();
    document.documentElement.setAttribute('data-watchlist', existing.length ? 'some' : 'empty');

    // Sync all visible watchlist buttons to current saved state (with + / check icons)
    document.querySelectorAll('button[data-watchlist-button], button.cover-add').forEach(btn => {
      const meta = extractItemMetaFromElement(btn);
      if (meta && meta.slug) {
        updateWatchlistButton(btn, isInWatchlist(meta.slug), meta.title);
      }
    });

    if (watchlistBound) return;
    watchlistBound = true;

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-watchlist-button], .cover-add');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const meta = extractItemMetaFromElement(btn);
      if (!meta || !meta.slug) return;

      const items = getWatchlistItems();
      const idx = items.findIndex(it => it.slug === meta.slug);
      const isNowAdded = idx === -1;
      if (isNowAdded) {
        items.unshift(meta);
      } else {
        items.splice(idx, 1);
      }
      saveWatchlistItems(items);
      syncWatchlistButtonsForSlug(meta.slug, isNowAdded, meta.title);
      showKairaToast(isNowAdded ? `Added "${meta.title}" to your library` : `Removed "${meta.title}" from your library`);

      if (normalizeRoutePath(window.location.pathname) === '/library') {
        renderLibraryPage();
      }
    });

    // Share button interaction (copy link with toast feedback)
    document.addEventListener('click', (e) => {
      const shareBtn = e.target.closest('button[title="Share"], button[aria-label*="Share"], .capsule-btn[aria-label*="Share"]');
      if (!shareBtn) return;
      e.preventDefault();
      e.stopPropagation();

      const shareUrl = window.location.href;
      if (navigator.share) {
        navigator.share({ url: shareUrl, title: document.title }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          showKairaToast('Link copied to clipboard');
        }).catch(() => {});
      }
    });
  }

  // --- 7. Settings Modal & Engine ---
  const PHOSPHOR_ICONS = {
    palette: 'M200.77,53.89A103.27,103.27,0,0,0,128,24h-1.07A104,104,0,0,0,24,128c0,43,26.58,79.06,69.36,94.17A32,32,0,0,0,136,192a16,16,0,0,1,16-16h46.21a31.81,31.81,0,0,0,31.2-24.88,104.43,104.43,0,0,0,2.59-24A103.28,103.28,0,0,0,200.77,53.89Zm13,93.71A15.89,15.89,0,0,1,198.21,160H152a32,32,0,0,0-32,32,16,16,0,0,1-21.31,15.07C62.49,194.3,40,164,40,128a88,88,0,0,1,87.09-88h.9a88.35,88.35,0,0,1,88,87.25A88.86,88.86,0,0,1,213.81,147.6ZM140,76a12,12,0,1,1-12-12A12,12,0,0,1,140,76ZM96,100A12,12,0,1,1,84,88,12,12,0,0,1,96,100Zm0,56a12,12,0,1,1-12-12A12,12,0,0,1,96,156Zm88-56a12,12,0,1,1-12-12A12,12,0,0,1,184,100Z',
    light: 'M176,232a8,8,0,0,1-8,8H88a8,8,0,0,1,0-16h80A8,8,0,0,1,176,232Zm40-128a87.55,87.55,0,0,1-33.64,69.21A16.24,16.24,0,0,0,176,186v6a16,16,0,0,1-16,16H96a16,16,0,0,1-16-16v-6a16,16,0,0,0-6.23-12.66A87.59,87.59,0,0,1,40,104.49C39.74,56.83,78.26,17.14,125.88,16A88,88,0,0,1,216,104Zm-16,0a72,72,0,0,0-73.74-72c-39,.92-70.47,33.39-70.26,72.39a71.65,71.65,0,0,0,27.64,56.3A32,32,0,0,1,96,186v6h64v-6a32.15,32.15,0,0,1,12.47-25.35A71.65,71.65,0,0,0,200,104Zm-16.11-9.34a57.6,57.6,0,0,0-46.56-46.55,8,8,0,0,0-2.66,15.78c16.57,2.79,30.63,16.85,33.44,33.45A8,8,0,0,0,176,104a9,9,0,0,0,1.35-.11A8,8,0,0,0,183.89,94.66Z',
    covers: 'M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM48,48H208v77.38l-24.69-24.7a16,16,0,0,0-22.62,0L53.37,208H48ZM208,208H76l96-96,36,36v60ZM96,120A24,24,0,1,0,72,96,24,24,0,0,0,96,120Zm0-32a8,8,0,1,1-8,8A8,8,0,0,1,96,88Z',
    home: 'M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z',
    access: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM40,128a88,88,0,0,1,88-88v176A88.1,88.1,0,0,1,40,128Z',
    trailers: 'M216,104H102.09L210,75.51a8,8,0,0,0,5.68-9.84l-8.16-30a15.93,15.93,0,0,0-19.42-11.13L35.81,64.74a15.75,15.75,0,0,0-9.7,7.4,15.51,15.51,0,0,0-1.55,12L32,111.56c0,.14,0,.29,0,.44v88a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V112A8,8,0,0,0,216,104ZM192.16,40l6,22.07-22.62,6L147.42,51.83Zm-66.69,17.6,28.12,16.24-36.94,9.75L88.53,67.37Zm-79.4,44.62-6-22.08,26.5-7L94.69,89.4ZM208,200H48V120H208v80Z',
    keyboard: 'M224,48H32A16,16,0,0,0,16,64V192a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48Zm0,144H32V64H224V192Zm-16-64a8,8,0,0,1-8,8H56a8,8,0,0,1,0-16H200A8,8,0,0,1,208,128Zm0-32a8,8,0,0,1-8,8H56a8,8,0,0,1,0-16H200A8,8,0,0,1,208,96ZM72,160a8,8,0,0,1-8,8H56a8,8,0,0,1,0-16h8A8,8,0,0,1,72,160Zm96,0a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,160Zm40,0a8,8,0,0,1-8,8h-8a8,8,0,0,1,0-16h8A8,8,0,0,1,208,160Z',
    integrations: 'M237.66,18.34a8,8,0,0,0-11.32,0l-52.4,52.41-5.37-5.38a32.05,32.05,0,0,0-45.26,0L100,88.69l-6.34-6.35A8,8,0,0,0,82.34,93.66L88.69,100,65.37,123.31a32,32,0,0,0,0,45.26l5.38,5.37-52.41,52.4a8,8,0,0,0,11.32,11.32l52.4-52.41,5.37,5.38a32,32,0,0,0,45.26,0L156,167.31l6.34,6.35a8,8,0,0,0,11.32-11.32L167.31,156l23.32-23.31a32,32,0,0,0,0-45.26l-5.38-5.37,52.41-52.4A8,8,0,0,0,237.66,18.34Zm-116.29,161a16,16,0,0,1-22.62,0L76.69,157.25a16,16,0,0,1,0-22.62L100,111.31,144.69,156Zm57.94-57.94L156,144.69,111.31,100l23.32-23.31a16,16,0,0,1,22.62,0l22.06,22A16,16,0,0,1,179.31,121.37ZM88.57,35A8,8,0,0,1,103.43,29l8,20A8,8,0,0,1,96.57,55ZM24.57,93A8,8,0,0,1,35,88.57l20,8A8,8,0,0,1,49,111.43l-20-8A8,8,0,0,1,24.57,93ZM231.43,163a8,8,0,0,1-10.4,4.46l-20-8A8,8,0,1,1,207,144.57l20,8A8,8,0,0,1,231.43,163Zm-64,58.06A8,8,0,0,1,152.57,227l-8-20A8,8,0,0,1,159.43,201Z',
    privacy: 'M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm0,72c0,37.07-13.66,67.16-40.6,89.42A129.3,129.3,0,0,1,128,223.62a128.25,128.25,0,0,1-38.92-21.81C61.82,179.51,48,149.3,48,112l0-56,160,0ZM82.34,141.66a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32l-56,56a8,8,0,0,1-11.32,0Z',
    data: 'M128,24C74.17,24,32,48.6,32,80v96c0,31.4,42.17,56,96,56s96-24.6,96-56V80C224,48.6,181.83,24,128,24Zm80,104c0,9.62-7.88,19.43-21.61,26.92C170.93,163.35,150.19,168,128,168s-42.93-4.65-58.39-13.08C55.88,147.43,48,137.62,48,128V111.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64ZM69.61,53.08C85.07,44.65,105.81,40,128,40s42.93,4.65,58.39,13.08C200.12,60.57,208,70.38,208,80s-7.88,19.43-21.61,26.92C170.93,115.35,150.19,120,128,120s-42.93-4.65-58.39-13.08C55.88,99.43,48,89.62,48,80S55.88,60.57,69.61,53.08ZM186.39,202.92C170.93,211.35,150.19,216,128,216s-42.93-4.65-58.39-13.08C55.88,195.43,48,185.62,48,176V159.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64V176C208,185.62,200.12,195.43,186.39,202.92Z',
    reset: 'M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,197.8a8,8,0,0,1,11-11.63A80,80,0,1,0,71.43,71.39a3.07,3.07,0,0,1-.26.25L44.59,96H72a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V56a8,8,0,0,1,16,0V85.8L60.25,60A96,96,0,0,1,224,128Z',
    caretRight: 'M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z',
    caretLeft: 'M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z',
    close: 'M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z',
    search: 'M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z',
    bell: 'M168,224a8,8,0,0,1-8,8H96a8,8,0,1,1,0-16h64A8,8,0,0,1,168,224Zm53.85-32A15.8,15.8,0,0,1,208,200H48a16,16,0,0,1-13.8-24.06C39.75,166.38,48,139.34,48,104a80,80,0,1,1,160,0c0,35.33,8.26,62.38,13.81,71.94A15.89,15.89,0,0,1,221.84,192ZM208,184c-7.73-13.27-16-43.95-16-80a64,64,0,1,0-128,0c0,36.06-8.28,66.74-16,80Z'
  };

  function svg(pathKey, className) {
    const d = PHOSPHOR_ICONS[pathKey];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="${className || ''}" aria-hidden="true"><path d="${d}"></path></svg>`;
  }

  let activeSettingsView = 'main';
  const DEFAULT_SETTINGS = {
    accentColor: '#f59e0b',
    accentName: 'Kaira',
    accentHue: 62,
    ambientLight: '60%',
    ambientEnabled: true,
    coverZoom: 'Zoom 110%',
    coverZoomEnabled: true,
    coverZoomVal: 110,
    coverWords: false,
    coverScores: true,
    homeShelves: '15 shelves',
    heroSeconds: 7,
    accessibility: '1 on',
    reduceMotion: false,
    contrast: true,
    underlineLinks: false,
    trailers: 'Sound on',
    trailerSound: true,
    keyboard: 'On',
    keyboardEnabled: true,
    downloadsEnabled: true,
    localOnlyMode: true,
    background: 'Black',
    glassBlur: 100
  };
  let settingsState = { ...DEFAULT_SETTINGS };

  function computeSettingsSummaries() {
    settingsState.coverZoom = settingsState.coverZoomEnabled
      ? `Zoom ${settingsState.coverZoomVal || 110}%`
      : 'Zoom off';
    const accessCount =
      (settingsState.reduceMotion ? 1 : 0) +
      (settingsState.contrast ? 1 : 0) +
      (settingsState.underlineLinks ? 1 : 0);
    settingsState.accessibility = accessCount > 0 ? `${accessCount} on` : 'Default';
    settingsState.trailers = settingsState.trailerSound ? 'Sound on' : 'Muted';
    settingsState.keyboard = settingsState.keyboardEnabled !== false ? 'On' : 'Off';
    settingsState.homeShelves = `${settingsState.heroSeconds || 7}s hero`;
  }

  function getSettingsState() {
    try {
      const legacy = JSON.parse(localStorage.getItem('flicx_settings') || 'null');
      const v1 = JSON.parse(localStorage.getItem('flicx:settings:v1') || 'null');
      settingsState = { ...DEFAULT_SETTINGS };
      if (legacy && typeof legacy === 'object') {
        settingsState = { ...settingsState, ...legacy };
      }
      if (v1 && typeof v1 === 'object') {
        if (typeof v1.accentHue === 'number') settingsState.accentHue = v1.accentHue;
        if (typeof v1.ambient === 'boolean') settingsState.ambientEnabled = v1.ambient;
        if (typeof v1.ambientStrength === 'number') settingsState.ambientLight = `${v1.ambientStrength}%`;
        if (typeof v1.glassBlur === 'number') settingsState.glassBlur = v1.glassBlur;
        if (typeof v1.coverZoom === 'boolean') settingsState.coverZoomEnabled = v1.coverZoom;
        if (typeof v1.coverZoomAmount === 'number') settingsState.coverZoomVal = v1.coverZoomAmount;
        if (typeof v1.coverWords === 'boolean') settingsState.coverWords = v1.coverWords;
        if (typeof v1.coverScores === 'boolean') settingsState.coverScores = v1.coverScores;
        if (typeof v1.reduceMotion === 'boolean') settingsState.reduceMotion = v1.reduceMotion;
        if (typeof v1.contrast === 'boolean') settingsState.contrast = v1.contrast;
        if (typeof v1.underlineLinks === 'boolean') settingsState.underlineLinks = v1.underlineLinks;
        if (typeof v1.downloads === 'boolean') settingsState.downloadsEnabled = v1.downloads;
        if (typeof v1.heroSeconds === 'number') settingsState.heroSeconds = v1.heroSeconds;
        if (v1.background === 'grey') settingsState.background = 'Dark grey';
        else if (v1.background === 'tint') settingsState.background = 'Tinted';
        else if (v1.background === 'black') settingsState.background = 'Black';
      }
      if (settingsState.accentName === 'Flicx') settingsState.accentName = 'Kaira';
      computeSettingsSummaries();
    } catch {}
    applySettingsToDOM();
    return settingsState;
  }

  function saveSettingsState() {
    computeSettingsSummaries();
    try {
      localStorage.setItem('flicx_settings', JSON.stringify(settingsState));
      const bgCode = settingsState.background === 'Dark grey'
        ? 'grey'
        : settingsState.background === 'Tinted'
          ? 'tint'
          : 'black';
      const v1Payload = {
        settingsVersion: 6,
        accentHue: Number(settingsState.accentHue) || 62,
        background: bgCode,
        ambient: settingsState.ambientEnabled !== false,
        ambientStrength: parseInt(settingsState.ambientLight, 10) || 60,
        glassBlur: Number(settingsState.glassBlur) ?? 100,
        coverZoom: settingsState.coverZoomEnabled !== false,
        coverZoomAmount: Number(settingsState.coverZoomVal) || 110,
        coverWords: Boolean(settingsState.coverWords),
        coverScores: settingsState.coverScores !== false,
        reduceMotion: Boolean(settingsState.reduceMotion),
        contrast: settingsState.contrast !== false,
        underlineLinks: Boolean(settingsState.underlineLinks),
        downloads: settingsState.downloadsEnabled !== false,
        heroSeconds: Number(settingsState.heroSeconds) || 7
      };
      localStorage.setItem('flicx:settings:v1', JSON.stringify(v1Payload));
    } catch {}
    applySettingsToDOM();
  }

  function applySettingsToDOM() {
    const root = document.documentElement;
    // 1. Accent color
    const accent = safeColor(settingsState.accentColor, '#f59e0b');
    root.style.setProperty('--color-flare', accent);
    root.style.setProperty('--accent', accent);

    // 2. Glass blur scale
    const blurScale = (settingsState.glassBlur != null ? settingsState.glassBlur : 100) / 100;
    root.style.setProperty('--blur-scale', String(blurScale));
    root.style.setProperty('--frost-chrome', `blur(${22 * blurScale}px) saturate(1.7) brightness(0.78)`);

    // 3. Background color & data-background attribute
    if (settingsState.background === 'Dark grey') {
      root.setAttribute('data-background', 'grey');
      root.style.setProperty('--color-canvas', '#0e1016');
    } else if (settingsState.background === 'Tinted') {
      root.setAttribute('data-background', 'tint');
      root.style.setProperty('--color-canvas', `color-mix(in oklab, ${accent} 12%, #0a0c10)`);
    } else {
      root.removeAttribute('data-background');
      root.style.setProperty('--color-canvas', '#000000');
    }

    // 4. Ambient light
    const ambStrength = settingsState.ambientEnabled ? (parseInt(settingsState.ambientLight, 10) || 60) / 100 : 0;
    root.style.setProperty('--ambient-strength', String(ambStrength));
    if (settingsState.ambientEnabled) root.removeAttribute('data-ambient');
    else root.setAttribute('data-ambient', 'off');

    // 5. Covers (zoom, always show titles, show scores)
    const zoomVal = (settingsState.coverZoomVal || 110) / 100;
    root.style.setProperty('--cover-zoom-to', String(zoomVal));
    if (settingsState.coverZoomEnabled === false) root.setAttribute('data-cover-zoom', 'off');
    else root.removeAttribute('data-cover-zoom');

    if (settingsState.coverWords) root.setAttribute('data-cover-words', 'on');
    else root.removeAttribute('data-cover-words');

    if (settingsState.coverScores === false) root.setAttribute('data-cover-scores', 'off');
    else root.removeAttribute('data-cover-scores');

    // 6. Hero slide duration
    const heroSecs = Math.min(20, Math.max(4, Number(settingsState.heroSeconds) || 7));
    root.style.setProperty('--hero-duration', `${heroSecs}s`);

    // 7. Accessibility & Downloads
    if (settingsState.reduceMotion) root.setAttribute('data-motion', 'reduce');
    else root.removeAttribute('data-motion');

    if (settingsState.contrast !== false) root.setAttribute('data-contrast', 'more');
    else root.removeAttribute('data-contrast');

    if (settingsState.underlineLinks) root.setAttribute('data-underline', 'on');
    else root.removeAttribute('data-underline');

    if (settingsState.downloadsEnabled === false) root.setAttribute('data-downloads', 'off');
    else root.removeAttribute('data-downloads');
  }

  let settingsEscBound = false;
  let settingsCloseTimer = null;
  function closeSettingsModal(e, immediate = false) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
      e.stopPropagation();
    }
    const dialog = document.getElementById('flicx-settings-dialog');
    const backdrop = document.getElementById('flicx-settings-backdrop');
    if (settingsCloseTimer) {
      clearTimeout(settingsCloseTimer);
      settingsCloseTimer = null;
    }
    if (dialog) {
      dialog.classList.remove('set-open');
      dialog.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) {
      backdrop.classList.remove('set-open');
    }
    document.body.style.overflow = '';
    const delay = immediate || prefersReducedMotion() ? 0 : 240;
    if (delay === 0) {
      if (dialog) dialog.style.display = 'none';
      if (backdrop) backdrop.style.display = 'none';
      activeSettingsView = 'main';
      return;
    }
    settingsCloseTimer = setTimeout(() => {
      settingsCloseTimer = null;
      if (dialog && !dialog.classList.contains('set-open')) {
        dialog.style.display = 'none';
        if (backdrop) backdrop.style.display = 'none';
        activeSettingsView = 'main';
      }
    }, delay);
  }

  function buildSettingsModal() {
    let dialog = document.getElementById('flicx-settings-dialog');
    if (dialog) return dialog;

    const backdrop = document.createElement('div');
    backdrop.id = 'flicx-settings-backdrop';
    backdrop.className = 'set-backdrop';
    backdrop.style.display = 'none';

    dialog = document.createElement('div');
    dialog.id = 'flicx-settings-dialog';
    dialog.className = 'set-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Settings');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-hidden', 'true');
    dialog.style.display = 'none';

    dialog.innerHTML = `
      <div class="set-window" data-view="main">
        <header class="set-head">
          <button type="button" class="set-back" aria-label="All settings" style="display:none;">
            ${svg('caretLeft')}
          </button>
          <h2 class="set-title">Settings</h2>
          <button type="button" class="set-close" aria-label="Close settings">
            ${svg('close')}
          </button>
        </header>

        <div class="set-search">
          <span class="set-search-icon">${svg('search')}</span>
          <input type="search" class="set-search-input" placeholder="Search settings" aria-label="Search settings" autocomplete="off" />
        </div>

        <div class="set-body" id="flicx-settings-body"></div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);

    dialog.querySelector('.set-close').onclick = closeSettingsModal;
    backdrop.onclick = closeSettingsModal;

    const backBtn = dialog.querySelector('.set-back');
    backBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      activeSettingsView = 'main';
      renderSettingsView('main');
    };

    const searchInput = dialog.querySelector('.set-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        filterSettingsRows(searchInput.value);
      });
    }

    if (!settingsEscBound) {
      settingsEscBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const dlg = document.getElementById('flicx-settings-dialog');
          if (dlg && dlg.classList.contains('set-open')) {
            closeSettingsModal();
          }
        }
      });
    }

    return dialog;
  }

  function filterSettingsRows(query) {
    const body = document.getElementById('flicx-settings-body');
    if (!body) return;
    const q = (query || '').trim().toLowerCase();
    let visibleCount = 0;

    body.querySelectorAll('.set-group').forEach(group => {
      let groupVisible = 0;
      group.querySelectorAll('.set-row').forEach(row => {
        const keywords = (row.getAttribute('data-keywords') || '') + ' ' + (row.textContent || '');
        const match = !q || keywords.toLowerCase().includes(q);
        row.style.display = match ? '' : 'none';
        if (match) {
          groupVisible++;
          visibleCount++;
        }
      });
      group.style.display = groupVisible > 0 ? '' : 'none';
    });

    let emptyEl = body.querySelector('.set-search-empty');
    if (visibleCount === 0 && q) {
      if (!emptyEl) {
        emptyEl = document.createElement('p');
        emptyEl.className = 'set-search-empty';
        emptyEl.style.cssText = 'text-align:center;color:rgba(255,255,255,0.55);padding:2rem 1rem;font-size:0.9rem;';
        body.appendChild(emptyEl);
      }
      emptyEl.textContent = `No settings matching "${query.trim()}"`;
      emptyEl.style.display = 'block';
    } else if (emptyEl) {
      emptyEl.style.display = 'none';
    }
  }

  function renderSettingsView(view) {
    const dialog = buildSettingsModal();
    const body = dialog.querySelector('#flicx-settings-body');
    const titleEl = dialog.querySelector('.set-title');
    const backBtn = dialog.querySelector('.set-back');
    const searchWrap = dialog.querySelector('.set-search');
    const searchInput = dialog.querySelector('.set-search-input');

    computeSettingsSummaries();

    if (view === 'main') {
      titleEl.textContent = 'Settings';
      backBtn.style.display = 'none';
      searchWrap.style.display = 'flex';
      if (searchInput) searchInput.value = '';

      body.innerHTML = `
        <div class="set-group">
          <button type="button" class="set-row" data-subview="appearance" data-keywords="accent color colour hue background dark grey black tinted glass blur theme">
            <span class="set-row-icon">${svg('palette')}</span>
            <span class="set-row-label">Appearance</span>
            <span class="set-row-value">${escapeHtml(settingsState.accentName)}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="light" data-keywords="ambient light glow reflections brightness">
            <span class="set-row-icon">${svg('light')}</span>
            <span class="set-row-label">Ambient light</span>
            <span class="set-row-value">${escapeHtml(settingsState.ambientEnabled ? settingsState.ambientLight : 'Off')}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="covers" data-keywords="covers posters zoom titles scores ratings">
            <span class="set-row-icon">${svg('covers')}</span>
            <span class="set-row-label">Covers</span>
            <span class="set-row-value">${escapeHtml(settingsState.coverZoom)}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="home" data-keywords="home page hero duration carousel shelves">
            <span class="set-row-icon">${svg('home')}</span>
            <span class="set-row-label">Home page</span>
            <span class="set-row-value">${escapeHtml(settingsState.homeShelves)}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="access" data-keywords="accessibility reduce motion contrast underline links">
            <span class="set-row-icon">${svg('access')}</span>
            <span class="set-row-label">Accessibility</span>
            <span class="set-row-value">${escapeHtml(settingsState.accessibility)}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="trailers" data-keywords="trailers sound muted audio video">
            <span class="set-row-icon">${svg('trailers')}</span>
            <span class="set-row-label">Trailers</span>
            <span class="set-row-value">${escapeHtml(settingsState.trailers)}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="keyboard" data-keywords="keyboard shortcuts hotkeys slash space fullscreen">
            <span class="set-row-icon">${svg('keyboard')}</span>
            <span class="set-row-label">Keyboard</span>
            <span class="set-row-value">${escapeHtml(settingsState.keyboard)}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
        </div>

        <div class="set-group">
          <button type="button" class="set-row" data-subview="integrations" data-keywords="integrations downloads export library watchlist json">
            <span class="set-row-icon">${svg('integrations')}</span>
            <span class="set-row-label">Integrations</span>
            <span class="set-row-value">${settingsState.downloadsEnabled ? 'Downloads on' : 'Downloads off'}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="privacy" data-keywords="privacy history progress ratings local storage">
            <span class="set-row-icon">${svg('privacy')}</span>
            <span class="set-row-label">Privacy</span>
            <span class="set-row-value">${settingsState.localOnlyMode ? 'Local only' : 'Standard'}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="data" data-keywords="your data backup export import restore clear">
            <span class="set-row-icon">${svg('data')}</span>
            <span class="set-row-label">Your data</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
        </div>

        <div class="set-group">
          <button type="button" class="set-row set-reset-btn" id="flicx-reset-all" data-keywords="reset default factory">
            <span class="set-row-icon">${svg('reset')}</span>
            <span class="set-row-label">Reset all settings</span>
          </button>
        </div>
      `;

      body.querySelectorAll('[data-subview]').forEach(btn => {
        btn.onclick = () => {
          const sub = btn.getAttribute('data-subview');
          activeSettingsView = sub;
          renderSettingsView(sub);
        };
      });

      const resetBtn = body.querySelector('#flicx-reset-all');
      if (resetBtn) {
        let armed = false;
        let armTimer = null;
        resetBtn.onclick = () => {
          if (!armed) {
            armed = true;
            const lbl = resetBtn.querySelector('.set-row-label');
            if (lbl) lbl.textContent = 'Click again to confirm reset';
            resetBtn.style.color = '#f59e0b';
            armTimer = setTimeout(() => {
              armed = false;
              if (lbl) lbl.textContent = 'Reset all settings';
              resetBtn.style.color = '';
            }, 3500);
            return;
          }
          clearTimeout(armTimer);
          localStorage.removeItem('flicx_settings');
          localStorage.removeItem('flicx:settings:v1');
          settingsState = { ...DEFAULT_SETTINGS };
          saveSettingsState();
          showKairaToast('Settings reset to defaults');
          renderSettingsView('main');
        };
      }
    } else if (view === 'appearance') {
      titleEl.textContent = 'Appearance';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-field">
          <label class="set-label">Background</label>
          <div class="set-choices" role="radiogroup">
            <button type="button" class="set-choice ${settingsState.background === 'Black' ? 'set-choice-active' : ''}" data-bg="Black">Black</button>
            <button type="button" class="set-choice ${settingsState.background === 'Dark grey' ? 'set-choice-active' : ''}" data-bg="Dark grey">Dark grey</button>
            <button type="button" class="set-choice ${settingsState.background === 'Tinted' ? 'set-choice-active' : ''}" data-bg="Tinted">Tinted</button>
          </div>
        </div>

        <div class="set-field">
          <label class="set-label">Accent colour</label>
          <div class="set-swatches" role="radiogroup">
            <button type="button" class="set-swatch" data-color="#f59e0b" data-name="Kaira" data-hue="62" style="--swatch:#f59e0b;" aria-label="Kaira Gold">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#f43f5e" data-name="Rose" data-hue="350" style="--swatch:#f43f5e;" aria-label="Rose">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#ec4899" data-name="Pink" data-hue="330" style="--swatch:#ec4899;" aria-label="Pink">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#a855f7" data-name="Purple" data-hue="290" style="--swatch:#a855f7;" aria-label="Purple">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#6366f1" data-name="Indigo" data-hue="250" style="--swatch:#6366f1;" aria-label="Indigo">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#0ea5e9" data-name="Sky" data-hue="200" style="--swatch:#0ea5e9;" aria-label="Sky">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#10b981" data-name="Emerald" data-hue="150" style="--swatch:#10b981;" aria-label="Emerald">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#84cc16" data-name="Lime" data-hue="100" style="--swatch:#84cc16;" aria-label="Lime">
              <span class="set-swatch-dot"></span>
            </button>
          </div>
        </div>

        <div class="set-field">
          <div class="set-slider-head">
            <label class="set-label">Accent hue</label>
            <span class="set-slider-value" id="flicx-hue-val">${Number(settingsState.accentHue) || 62}&deg;</span>
          </div>
          <input type="range" class="set-range" id="flicx-hue-range" min="0" max="360" value="${Number(settingsState.accentHue) || 62}" />
        </div>

        <div class="set-field">
          <div class="set-slider-head">
            <label class="set-label">Glass blur</label>
            <span class="set-slider-value" id="flicx-blur-val">${Number(settingsState.glassBlur) ?? 100}%</span>
          </div>
          <input type="range" class="set-range" id="flicx-blur-range" min="0" max="200" value="${Number(settingsState.glassBlur) ?? 100}" />
        </div>
      `;

      body.querySelectorAll('.set-swatch').forEach(btn => {
        btn.onclick = () => {
          settingsState.accentColor = btn.getAttribute('data-color');
          settingsState.accentName = btn.getAttribute('data-name');
          settingsState.accentHue = parseInt(btn.getAttribute('data-hue'), 10);
          saveSettingsState();
          const hueVal = body.querySelector('#flicx-hue-val');
          const hueRange = body.querySelector('#flicx-hue-range');
          if (hueVal) hueVal.innerHTML = settingsState.accentHue + '&deg;';
          if (hueRange) hueRange.value = settingsState.accentHue;
        };
      });

      body.querySelectorAll('.set-choice[data-bg]').forEach(btn => {
        btn.onclick = () => {
          body.querySelectorAll('.set-choice[data-bg]').forEach(b => b.classList.remove('set-choice-active'));
          btn.classList.add('set-choice-active');
          settingsState.background = btn.getAttribute('data-bg');
          saveSettingsState();
        };
      });

      const hueInput = body.querySelector('#flicx-hue-range');
      if (hueInput) {
        hueInput.oninput = (e) => {
          const val = parseInt(e.target.value, 10);
          settingsState.accentHue = val;
          settingsState.accentColor = `hsl(${val}, 90%, 55%)`;
          settingsState.accentName = 'Custom';
          body.querySelector('#flicx-hue-val').innerHTML = val + '&deg;';
          saveSettingsState();
        };
      }

      const blurInput = body.querySelector('#flicx-blur-range');
      if (blurInput) {
        blurInput.oninput = (e) => {
          const val = parseInt(e.target.value, 10);
          settingsState.glassBlur = val;
          body.querySelector('#flicx-blur-val').textContent = val + '%';
          saveSettingsState();
        };
      }
    } else if (view === 'light') {
      titleEl.textContent = 'Ambient light';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-field">
          <div class="set-slider-head">
            <label class="set-label">Ambient light power</label>
            <span class="set-slider-value" id="flicx-amb-val">${escapeHtml(settingsState.ambientLight)}</span>
          </div>
          <input type="range" class="set-range" id="flicx-amb-range" min="0" max="100" value="${parseInt(settingsState.ambientLight, 10) || 60}" />
        </div>
        <div class="set-group" style="margin-top:1.25rem;">
          <label class="set-row" style="cursor:pointer;">
            <span class="set-row-label">Ambient light reflections</span>
            <input type="checkbox" id="flicx-amb-toggle" ${settingsState.ambientEnabled ? 'checked' : ''} style="cursor:pointer;width:1.15rem;height:1.15rem;accent-color:var(--color-flare);" />
          </label>
        </div>
      `;

      const ambRange = body.querySelector('#flicx-amb-range');
      if (ambRange) {
        ambRange.oninput = (e) => {
          const val = e.target.value;
          settingsState.ambientLight = val + '%';
          body.querySelector('#flicx-amb-val').textContent = val + '%';
          saveSettingsState();
        };
      }

      const ambToggle = body.querySelector('#flicx-amb-toggle');
      if (ambToggle) {
        ambToggle.onchange = (e) => {
          settingsState.ambientEnabled = e.target.checked;
          saveSettingsState();
        };
      }
    } else if (view === 'covers') {
      titleEl.textContent = 'Covers';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-field">
          <div class="set-slider-head">
            <label class="set-label">Poster hover zoom</label>
            <span class="set-slider-value" id="kaira-zoom-val">${Number(settingsState.coverZoomVal) || 110}%</span>
          </div>
          <input type="range" class="set-range" id="kaira-zoom-range" min="101" max="125" value="${Number(settingsState.coverZoomVal) || 110}" />
        </div>
        <div class="set-group" style="margin-top:1.25rem;">
          <label class="set-row" style="cursor:pointer;">
            <span class="set-row-label">Enable hover zoom</span>
            <input type="checkbox" id="kaira-zoom-toggle" ${settingsState.coverZoomEnabled !== false ? 'checked' : ''} style="cursor:pointer;width:1.15rem;height:1.15rem;accent-color:var(--color-flare);" />
          </label>
          <label class="set-row" style="cursor:pointer;">
            <span class="set-row-label">Always show titles on covers</span>
            <input type="checkbox" id="kaira-words-toggle" ${settingsState.coverWords ? 'checked' : ''} style="cursor:pointer;width:1.15rem;height:1.15rem;accent-color:var(--color-flare);" />
          </label>
          <label class="set-row" style="cursor:pointer;">
            <span class="set-row-label">Show ratings on covers</span>
            <input type="checkbox" id="kaira-scores-toggle" ${settingsState.coverScores !== false ? 'checked' : ''} style="cursor:pointer;width:1.15rem;height:1.15rem;accent-color:var(--color-flare);" />
          </label>
        </div>
      `;

      const zoomRange = body.querySelector('#kaira-zoom-range');
      if (zoomRange) {
        zoomRange.oninput = (e) => {
          const val = parseInt(e.target.value, 10);
          settingsState.coverZoomVal = val;
          body.querySelector('#kaira-zoom-val').textContent = `${val}%`;
          saveSettingsState();
        };
      }
      body.querySelector('#kaira-zoom-toggle').onchange = (e) => {
        settingsState.coverZoomEnabled = e.target.checked;
        saveSettingsState();
      };
      body.querySelector('#kaira-words-toggle').onchange = (e) => {
        settingsState.coverWords = e.target.checked;
        saveSettingsState();
      };
      body.querySelector('#kaira-scores-toggle').onchange = (e) => {
        settingsState.coverScores = e.target.checked;
        saveSettingsState();
      };
    } else if (view === 'home') {
      titleEl.textContent = 'Home page';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-field">
          <div class="set-slider-head">
            <label class="set-label">Hero slide duration</label>
            <span class="set-slider-value" id="kaira-hero-sec-val">${Number(settingsState.heroSeconds) || 7}s</span>
          </div>
          <input type="range" class="set-range" id="kaira-hero-sec-range" min="4" max="20" value="${Number(settingsState.heroSeconds) || 7}" />
        </div>
        <div class="set-group" style="margin-top:1.25rem;">
          <div class="set-row" style="cursor:default;">
            <span class="set-row-label">Featured shelves</span>
            <span class="set-row-value">All visible</span>
          </div>
        </div>
      `;

      const heroRange = body.querySelector('#kaira-hero-sec-range');
      if (heroRange) {
        heroRange.oninput = (e) => {
          const val = parseInt(e.target.value, 10);
          settingsState.heroSeconds = val;
          body.querySelector('#kaira-hero-sec-val').textContent = `${val}s`;
          saveSettingsState();
        };
      }
    } else if (view === 'access') {
      titleEl.textContent = 'Accessibility';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-group">
          <label class="set-row" style="cursor:pointer;">
            <span class="set-row-label">Reduce motion</span>
            <input type="checkbox" id="kaira-motion-toggle" ${settingsState.reduceMotion ? 'checked' : ''} style="cursor:pointer;width:1.15rem;height:1.15rem;accent-color:var(--color-flare);" />
          </label>
          <label class="set-row" style="cursor:pointer;">
            <span class="set-row-label">Higher contrast</span>
            <input type="checkbox" id="kaira-contrast-toggle" ${settingsState.contrast !== false ? 'checked' : ''} style="cursor:pointer;width:1.15rem;height:1.15rem;accent-color:var(--color-flare);" />
          </label>
          <label class="set-row" style="cursor:pointer;">
            <span class="set-row-label">Underline links</span>
            <input type="checkbox" id="kaira-underline-toggle" ${settingsState.underlineLinks ? 'checked' : ''} style="cursor:pointer;width:1.15rem;height:1.15rem;accent-color:var(--color-flare);" />
          </label>
        </div>
      `;

      body.querySelector('#kaira-motion-toggle').onchange = (e) => {
        settingsState.reduceMotion = e.target.checked;
        saveSettingsState();
      };
      body.querySelector('#kaira-contrast-toggle').onchange = (e) => {
        settingsState.contrast = e.target.checked;
        saveSettingsState();
      };
      body.querySelector('#kaira-underline-toggle').onchange = (e) => {
        settingsState.underlineLinks = e.target.checked;
        saveSettingsState();
      };
    } else if (view === 'trailers') {
      titleEl.textContent = 'Trailers';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-group">
          <label class="set-row" style="cursor:pointer;">
            <span class="set-row-label">Trailer sound</span>
            <input type="checkbox" id="flicx-sound-toggle" ${settingsState.trailerSound ? 'checked' : ''} style="cursor:pointer;width:1.15rem;height:1.15rem;accent-color:var(--color-flare);" />
          </label>
        </div>
      `;

      const soundToggle = body.querySelector('#flicx-sound-toggle');
      if (soundToggle) {
        soundToggle.onchange = (e) => {
          settingsState.trailerSound = e.target.checked;
          saveSettingsState();
        };
      }
    } else if (view === 'keyboard') {
      titleEl.textContent = 'Keyboard Shortcuts';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-group" style="margin-bottom:1rem;">
          <label class="set-row" style="cursor:pointer;">
            <span class="set-row-label">Enable keyboard shortcuts</span>
            <input type="checkbox" id="kaira-kbd-toggle" ${settingsState.keyboardEnabled !== false ? 'checked' : ''} style="cursor:pointer;width:1.15rem;height:1.15rem;accent-color:var(--color-flare);" />
          </label>
        </div>
        <div class="set-group" style="font-size:0.9rem;">
          <div class="set-row"><span class="set-row-label">Search</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">/</kbd></div>
          <div class="set-row"><span class="set-row-label">Play / Pause</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">Space</kbd></div>
          <div class="set-row"><span class="set-row-label">Fullscreen</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">F</kbd></div>
          <div class="set-row"><span class="set-row-label">Mute / Unmute</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">M</kbd></div>
          <div class="set-row"><span class="set-row-label">Seek back / forward</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">&larr; / &rarr;</kbd></div>
          <div class="set-row"><span class="set-row-label">Close modal / back</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">Esc</kbd></div>
        </div>
      `;

      body.querySelector('#kaira-kbd-toggle').onchange = (e) => {
        settingsState.keyboardEnabled = e.target.checked;
        saveSettingsState();
      };
    } else if (view === 'integrations') {
      titleEl.textContent = 'Integrations';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      const watchlistCount = getWatchlistItems().length;
      body.innerHTML = `
        <div class="set-group">
          <label class="set-row" style="cursor:pointer;">
            <span class="set-row-label">Show download links on detail pages</span>
            <input type="checkbox" id="kaira-dl-toggle" ${settingsState.downloadsEnabled !== false ? 'checked' : ''} style="cursor:pointer;width:1.15rem;height:1.15rem;accent-color:var(--color-flare);" />
          </label>
          <button type="button" class="set-row" id="kaira-export-watchlist">
            <span class="set-row-label">Export library as JSON</span>
            <span class="set-row-value">${watchlistCount} ${watchlistCount === 1 ? 'title' : 'titles'}</span>
          </button>
        </div>
      `;

      body.querySelector('#kaira-dl-toggle').onchange = (e) => {
        settingsState.downloadsEnabled = e.target.checked;
        saveSettingsState();
      };

      body.querySelector('#kaira-export-watchlist').onclick = () => {
        const items = getWatchlistItems();
        const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), items }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kaira-watchlist.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showKairaToast(`Exported ${items.length} saved ${items.length === 1 ? 'title' : 'titles'}`);
      };
    } else if (view === 'privacy') {
      titleEl.textContent = 'Privacy';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-group">
          <label class="set-row" style="cursor:pointer;">
            <span class="set-row-label">Keep watchlist &amp; ratings local only</span>
            <input type="checkbox" id="kaira-local-toggle" ${settingsState.localOnlyMode !== false ? 'checked' : ''} style="cursor:pointer;width:1.15rem;height:1.15rem;accent-color:var(--color-flare);" />
          </label>
          <button type="button" class="set-row" id="kaira-clear-progress">
            <span class="set-row-label">Clear playback progress</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" id="kaira-clear-ratings">
            <span class="set-row-label">Clear your ratings</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
        </div>
      `;

      body.querySelector('#kaira-local-toggle').onchange = (e) => {
        settingsState.localOnlyMode = e.target.checked;
        saveSettingsState();
      };
      body.querySelector('#kaira-clear-progress').onclick = () => {
        clearAllContinueWatching();
        showKairaToast('Playback progress cleared');
      };
      body.querySelector('#kaira-clear-ratings').onclick = () => {
        localStorage.removeItem('kaira:ratings:v1');
        showKairaToast('Saved ratings cleared');
      };
    } else if (view === 'data') {
      titleEl.textContent = 'Your data';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-group">
          <button type="button" class="set-row" id="flicx-export-data">
            <span class="set-row-label">Save settings to a file</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" id="flicx-import-data">
            <span class="set-row-label">Load settings from a file</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <input type="file" id="flicx-file-input" accept=".json" style="display:none;" />
          <button type="button" class="set-row" id="flicx-clear-data" style="color:#ef4444;">
            <span class="set-row-label">Clear all local data</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
        </div>
      `;

      body.querySelector('#flicx-export-data').onclick = () => {
        const blob = new Blob([JSON.stringify(settingsState, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kaira-settings.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showKairaToast('Settings exported to kaira-settings.json');
      };

      const fileInput = body.querySelector('#flicx-file-input');
      body.querySelector('#flicx-import-data').onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
          try {
            const parsed = JSON.parse(re.target.result);
            if (!parsed || typeof parsed !== 'object') throw new Error('Invalid');
            settingsState = { ...DEFAULT_SETTINGS, ...parsed };
            saveSettingsState();
            showKairaToast('Settings restored successfully');
            renderSettingsView('main');
          } catch {
            showKairaToast('Invalid settings file format');
          }
        };
        reader.readAsText(file);
      };

      const clearDataBtn = body.querySelector('#flicx-clear-data');
      let clearArmed = false;
      let clearArmTimer = null;
      clearDataBtn.onclick = () => {
        if (!clearArmed) {
          clearArmed = true;
          const lbl = clearDataBtn.querySelector('.set-row-label');
          if (lbl) lbl.textContent = 'Click again to clear everything';
          clearArmTimer = setTimeout(() => {
            clearArmed = false;
            if (lbl) lbl.textContent = 'Clear all local data';
          }, 3500);
          return;
        }
        clearTimeout(clearArmTimer);
        localStorage.clear();
        settingsState = { ...DEFAULT_SETTINGS };
        applySettingsToDOM();
        showKairaToast('All local data cleared');
        closeSettingsModal();
        refreshContinueWatchingUI();
        renderLibraryPage();
      };
    }
  }

  function openSettingsModal() {
    getSettingsState();
    const dialog = buildSettingsModal();
    renderSettingsView('main');
    const backdrop = document.getElementById('flicx-settings-backdrop');
    if (settingsCloseTimer) {
      clearTimeout(settingsCloseTimer);
      settingsCloseTimer = null;
    }
    dialog.style.display = 'flex';
    dialog.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.style.display = 'block';
    document.body.style.overflow = 'hidden';
    void dialog.offsetHeight;
    dialog.classList.add('set-open');
    if (backdrop) backdrop.classList.add('set-open');
  }

  // --- 8. Notifications Popover ---
  let notifOutsideHandler = null;
  let notifResizeHandler = null;
  let notifCloseTimer = null;

  function positionNotificationsPopover(popover) {
    if (!popover) return;
    const bell = document.querySelector('.notes-bell');
    const vw = window.innerWidth;
    const margin = 12;
    const panelWidth = Math.min(360, vw - margin * 2);
    const topPos = bell ? Math.round(bell.getBoundingClientRect().bottom + 12) : 72;

    popover.style.position = 'fixed';
    popover.style.top = topPos + 'px';
    popover.style.zIndex = '9999';
    popover.style.maxWidth = `calc(100vw - ${margin * 2}px)`;

    if (vw <= 540) {
      popover.style.left = margin + 'px';
      popover.style.right = margin + 'px';
      popover.style.width = 'auto';
    } else {
      const bellRect = bell ? bell.getBoundingClientRect() : null;
      const desiredRight = bellRect ? Math.max(margin, vw - bellRect.right) : margin;
      const maxRight = Math.max(margin, vw - panelWidth - margin);
      popover.style.left = 'auto';
      popover.style.right = Math.min(desiredRight, maxRight) + 'px';
      popover.style.width = panelWidth + 'px';
    }
  }

  function closeNotifications(immediate = false) {
    const popover = document.getElementById('flicx-notes-popover');
    if (notifCloseTimer) {
      clearTimeout(notifCloseTimer);
      notifCloseTimer = null;
    }
    if (popover) {
      popover.classList.remove('notes-open');
      popover.setAttribute('aria-hidden', 'true');
      const delay = immediate || prefersReducedMotion() ? 0 : 220;
      if (delay === 0) {
        popover.style.display = 'none';
      } else {
        notifCloseTimer = setTimeout(() => {
          notifCloseTimer = null;
          if (!popover.classList.contains('notes-open')) {
            popover.style.display = 'none';
          }
        }, delay);
      }
    }
    if (notifOutsideHandler) {
      document.removeEventListener('click', notifOutsideHandler);
      notifOutsideHandler = null;
    }
    if (notifResizeHandler) {
      window.removeEventListener('resize', notifResizeHandler);
      notifResizeHandler = null;
    }
  }

  function buildNotificationsPopover() {
    let popover = document.getElementById('flicx-notes-popover');
    if (popover) return popover;

    popover = document.createElement('div');
    popover.id = 'flicx-notes-popover';
    popover.className = 'notes-popup';
    popover.style.display = 'none';
    popover.setAttribute('aria-hidden', 'true');

    popover.innerHTML = `
      <div class="notes-panel">
        <header class="notes-head">
          <h3 class="notes-title">Notifications</h3>
          <button type="button" class="notes-close" aria-label="Close notifications">
            ${svg('close')}
          </button>
        </header>
        <div class="notes-body">
          <div class="notes-empty">
            <span class="notes-empty-icon">${svg('bell')}</span>
            <p class="notes-empty-text">No new notifications</p>
            <p class="notes-empty-sub">We will notify you about updates and new releases here.</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(popover);
    popover.querySelector('.notes-close').onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeNotifications();
    };

    return popover;
  }

  function toggleNotifications() {
    const popover = buildNotificationsPopover();
    if (popover.classList.contains('notes-open')) {
      closeNotifications();
      return;
    }

    if (notifCloseTimer) {
      clearTimeout(notifCloseTimer);
      notifCloseTimer = null;
    }

    positionNotificationsPopover(popover);
    popover.style.display = 'block';
    popover.setAttribute('aria-hidden', 'false');
    void popover.offsetHeight;
    popover.classList.add('notes-open');

    if (notifOutsideHandler) {
      document.removeEventListener('click', notifOutsideHandler);
    }
    notifOutsideHandler = function(e) {
      if (!popover.contains(e.target) && !e.target.closest('.notes-bell')) {
        closeNotifications();
      }
    };
    if (notifResizeHandler) {
      window.removeEventListener('resize', notifResizeHandler);
    }
    notifResizeHandler = function() {
      if (popover.classList.contains('notes-open')) {
        positionNotificationsPopover(popover);
      }
    };
    window.addEventListener('resize', notifResizeHandler);
    setTimeout(() => {
      if (notifOutsideHandler && popover.classList.contains('notes-open')) {
        document.addEventListener('click', notifOutsideHandler);
      }
    }, 10);
  }

  // --- 9. Animated Logo Hover Re-trigger ---
  function initAnimatedLogoHover() {
    document.querySelectorAll('.flicx-logo-link, a[aria-label="Kaira home"]').forEach(link => {
      if (link.dataset.logoHoverActive) return;
      link.dataset.logoHoverActive = 'true';

      const svgEl = link.querySelector('svg');
      if (!svgEl) return;
      const parts = svgEl.querySelectorAll('#Rectangle_22048, #Union, #Rectangle_22049');
      if (!parts.length) return;

      parts.forEach(el => {
        el.style.animationPlayState = 'paused';
      });

      let animTimer = null;
      link.addEventListener('mouseenter', () => {
        if (animTimer) clearTimeout(animTimer);
        link.classList.remove('is-animating');
        parts.forEach(el => {
          el.style.animation = 'none';
        });
        void link.offsetHeight;
        parts.forEach(el => {
          el.style.animation = '';
          el.style.animationIterationCount = '1';
          el.style.animationPlayState = 'running';
        });
        link.classList.add('is-animating');

        animTimer = setTimeout(() => {
          link.classList.remove('is-animating');
          parts.forEach(el => {
            el.style.animationPlayState = 'paused';
          });
        }, 1900);
      });
    });
  }

  // Dynamically update shelf rail with live filtered items (time or genre)
  function updateShelfRail(triggerBtn, isGenre, selectedOpt) {
    const section = triggerBtn.closest('section, .section');
    if (!section) return;
    const railTrack = section.querySelector('.rail-track[role="list"]');
    if (!railTrack) return;

    const parentRow = triggerBtn.closest('.title-row, .section, header');
    const isTv = normalizeRoutePath(window.location.pathname).startsWith('/tv') || (parentRow && parentRow.textContent.includes('TV'));

    railTrack.style.transition = 'opacity 0.22s ease-out';
    railTrack.style.opacity = '0.35';

    let fetchPromise;
    if (isGenre) {
      const genreVal = selectedOpt.value || selectedOpt.label.toLowerCase();
      const kindParam = isTv ? 'show' : 'movie';
      const sectionLink = section.querySelector('.section-link, a[href*="/genres/"]');
      if (sectionLink) {
        sectionLink.href = withBasePath(`/genres/${encodeURIComponent(genreVal)}`);
        for (const n of sectionLink.childNodes) {
          if (n.nodeType === 3) { n.nodeValue = `All ${selectedOpt.label}`; break; }
        }
      }
      fetchPromise = fetchApiJsonWithMeta(`/api/browse?genre=${encodeURIComponent(genreVal)}&kind=${kindParam}`)
        .then(r => (r && r.data ? r.data : Promise.reject(new Error('No API data'))))
        .then(data => data?.films || data?.results || [])
        .catch(async () => {
          // Static GitHub Pages fallback via Cinemeta catalog by genre
          const cmType = isTv ? 'series' : 'movie';
          const genreName = selectedOpt.label || 'Drama';
          const cmRes = await fetch(`https://v3-cinemeta.strem.io/catalog/${cmType}/top/genre=${encodeURIComponent(genreName)}.json`).catch(() => null);
          const cmData = cmRes && cmRes.ok ? await cmRes.json().catch(() => null) : null;
          return (Array.isArray(cmData?.metas) ? cmData.metas : []).slice(0, 18).map(m => ({
            id: m.imdb_id || m.id,
            slug: makeSlugFromTitleYear(m.name, m.releaseInfo || m.year),
            title: m.name,
            year: String(m.releaseInfo || m.year || '').slice(0, 4),
            kind: isTv ? 'show' : 'movie',
            poster: m.poster || '',
            rating: m.imdbRating ? Number(m.imdbRating) : undefined,
            genres: Array.isArray(m.genres) ? m.genres : [genreName]
          }));
        });
    } else {
      const timeKeyMap = {
        'today': 'day',
        'this-week': 'week',
        'this-month': 'month',
        'this-year': 'year',
        'all-time': 'all'
      };
      const key = timeKeyMap[selectedOpt.value] || 'week';
      const kindParam = isTv ? 'show' : 'movie';
      fetchPromise = fetchApiJsonWithMeta(`/api/trending?kind=${kindParam}`)
        .then(r => (r && r.data ? r.data : Promise.reject(new Error('No API data'))))
        .then(data => data?.lists?.[key] || data?.lists?.week || [])
        .catch(() => {
          // Graceful static fallback: re-order existing rail cards deterministically by chosen window
          const existing = Array.from(railTrack.children);
          if (existing.length > 1) {
            const offset = { day: 1, week: 0, month: 3, year: 5, all: 7 }[key] || 0;
            const rotated = existing.slice(offset % existing.length).concat(existing.slice(0, offset % existing.length));
            rotated.forEach(el => railTrack.appendChild(el));
          }
          return [];
        });
    }

    fetchPromise
      .then(items => {
        if (!items || items.length === 0) {
          railTrack.style.opacity = '1';
          return;
        }

        // Uses shared renderPosterCardHtml so <button class="cover-add"> stays INSIDE .card-art
        railTrack.innerHTML = items.map(item => `
          <div role="listitem">
            ${renderPosterCardHtml(item, {
              defaultIsTv: isTv,
              fallbackGenre: isGenre ? selectedOpt.label : undefined
            })}
          </div>
        `).join('');

        railTrack.scrollLeft = 0;
        railTrack.style.opacity = '1';
        try { initRailScroll(); } catch (e) {}
      })
      .catch(err => {
        console.warn('Failed to filter rail:', err);
        railTrack.style.opacity = '1';
      });
  }

  // --- 10. <title-select>, Discover Filters & Season Selection ---
  const TIME_FILTER_OPTIONS = [
    { value: "today", label: "Today" },
    { value: "this-week", label: "This week" },
    { value: "this-month", label: "This month" },
    { value: "this-year", label: "This year" },
    { value: "all-time", label: "All time" }
  ];

  const GENRE_FILTER_OPTIONS = [
    { value: "drama", label: "Drama", subtitle: "Top rated drama titles" },
    { value: "action", label: "Action", subtitle: "Top rated action titles" },
    { value: "comedy", label: "Comedy", subtitle: "Top rated comedy titles" },
    { value: "animation", label: "Animation", subtitle: "Top rated animated titles" },
    { value: "horror", label: "Horror", subtitle: "Top rated horror titles" },
    { value: "sci-fi", label: "Sci-Fi", subtitle: "Top rated science fiction" },
    { value: "romance", label: "Romance", subtitle: "Top rated romance" },
    { value: "thriller", label: "Thriller", subtitle: "Top rated thrillers" }
  ];

  const KNOWN_SHOW_SEASONS = {
    "the-lord-of-the-rings-the-rings-of-power-2022": [
      { n: 1, label: "Season 1", subtitle: "8 episodes · 2022" },
      { n: 2, label: "Season 2", subtitle: "8 episodes · 2024" },
      { n: 3, label: "Season 3", subtitle: "6 episodes · 2026" }
    ],
    "the-mentalist-2008": [
      { n: 1, label: "Season 1", subtitle: "23 episodes · 2008" },
      { n: 2, label: "Season 2", subtitle: "23 episodes · 2009" },
      { n: 3, label: "Season 3", subtitle: "24 episodes · 2010" },
      { n: 4, label: "Season 4", subtitle: "24 episodes · 2011" },
      { n: 5, label: "Season 5", subtitle: "22 episodes · 2012" },
      { n: 6, label: "Season 6", subtitle: "22 episodes · 2013" },
      { n: 7, label: "Season 7", subtitle: "13 episodes · 2014" }
    ],
    "dexter-2006": [
      { n: 1, label: "Season 1", subtitle: "12 episodes · 2006" },
      { n: 2, label: "Season 2", subtitle: "12 episodes · 2007" },
      { n: 3, label: "Season 3", subtitle: "12 episodes · 2008" },
      { n: 4, label: "Season 4", subtitle: "12 episodes · 2009" },
      { n: 5, label: "Season 5", subtitle: "12 episodes · 2010" },
      { n: 6, label: "Season 6", subtitle: "12 episodes · 2011" },
      { n: 7, label: "Season 7", subtitle: "12 episodes · 2012" },
      { n: 8, label: "Season 8", subtitle: "12 episodes · 2013" }
    ],
    "the-legend-of-korra-2012": [
      { n: 1, label: "Season 1", subtitle: "12 episodes · 2012" },
      { n: 2, label: "Season 2", subtitle: "14 episodes · 2013" },
      { n: 3, label: "Season 3", subtitle: "13 episodes · 2014" },
      { n: 4, label: "Season 4", subtitle: "13 episodes · 2014" }
    ]
  };

  const showSeasonsCache = new Map();

  function extractSeasonsFromJsonLd() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        const parsed = JSON.parse(s.textContent || 'null');
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        const tv = nodes.find(n => n && n['@type'] === 'TVSeries' && Array.isArray(n.containsSeason) && n.containsSeason.length > 0);
        if (tv) {
          const out = tv.containsSeason
            .map(sec => {
              const n = Number(sec.seasonNumber);
              const count = Number(sec.numberOfEpisodes);
              if (!Number.isFinite(n) || n <= 0) return null;
              const subtitle = Number.isFinite(count) && count > 0
                ? `${count} ${count === 1 ? 'episode' : 'episodes'}`
                : (count === 0 ? 'Upcoming' : 'Episodes available');
              return { n, label: `Season ${n}`, subtitle };
            })
            .filter(Boolean)
            .sort((a, b) => a.n - b.n);
          if (out.length > 0) return out;
        }
      }
    } catch {}
    return null;
  }

  async function resolveShowSeasons(showSlug) {
    if (showSeasonsCache.has(showSlug)) return showSeasonsCache.get(showSlug);
    const fromLd = extractSeasonsFromJsonLd();
    if (fromLd && fromLd.length > 0) {
      showSeasonsCache.set(showSlug, fromLd);
      return fromLd;
    }
    if (KNOWN_SHOW_SEASONS[showSlug]) {
      showSeasonsCache.set(showSlug, KNOWN_SHOW_SEASONS[showSlug]);
      return KNOWN_SHOW_SEASONS[showSlug];
    }
    try {
      let imdbId = document.querySelector('[id^="rate-tt"]')?.id?.replace(/^rate-/, '') || null;
      if (!imdbId || !/^tt\d+$/i.test(imdbId)) {
        const meta = await resolveTitleMeta(showSlug, 'show');
        imdbId = meta?.imdbId || meta?.id || null;
      }
      if (imdbId && /^tt\d+$/i.test(imdbId)) {
        const cmRes = await fetch(`https://v3-cinemeta.strem.io/meta/series/${encodeURIComponent(imdbId)}.json`);
        const cmData = cmRes.ok ? await cmRes.json().catch(() => null) : null;
        const videos = Array.isArray(cmData?.meta?.videos) ? cmData.meta.videos : [];
        const counts = new Map();
        for (const v of videos) {
          const sNum = Number(v.season);
          const eNum = Number(v.episode || v.number);
          if (!Number.isFinite(sNum) || sNum <= 0 || !Number.isFinite(eNum) || eNum <= 0) continue;
          counts.set(sNum, (counts.get(sNum) || 0) + 1);
        }
        if (counts.size > 0) {
          const resolved = Array.from(counts.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([n, count]) => ({
              n,
              label: `Season ${n}`,
              subtitle: `${count} ${count === 1 ? 'episode' : 'episodes'}`
            }));
          showSeasonsCache.set(showSlug, resolved);
          return resolved;
        }
      }
    } catch {}
    return null;
  }

  let activePopupEl = null;
  let activeTriggerBtn = null;
  let popupOutsideHandler = null;
  let popupKeyHandler = null;

  function closeCurrentPopup() {
    if (popupOutsideHandler) {
      document.removeEventListener('click', popupOutsideHandler);
      popupOutsideHandler = null;
    }
    if (popupKeyHandler) {
      document.removeEventListener('keydown', popupKeyHandler);
      popupKeyHandler = null;
    }
    if (!activePopupEl) return;
    const popup = activePopupEl;
    const trigger = activeTriggerBtn;
    activePopupEl = null;
    activeTriggerBtn = null;

    popup.classList.remove('select-popup-open');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      const caret = trigger.querySelector('.title-select-caret svg, .select-caret svg, svg:last-child');
      if (caret) caret.style.transform = '';
    }

    const removeDelay = prefersReducedMotion() ? 0 : 210;
    setTimeout(() => {
      if (popup.parentNode) popup.parentNode.removeChild(popup);
    }, removeDelay);
  }

  function openDropdownPopup(triggerBtn, options, currentSelectedVal, onSelect) {
    closeCurrentPopup();

    const popup = document.createElement('div');
    popup.className = 'select-popup title-select-popup';
    popup.setAttribute('role', 'listbox');

    options.forEach(opt => {
      const optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.setAttribute('role', 'option');
      const normVal = String(currentSelectedVal || '').trim().toLowerCase();
      const isSelected = String(opt.label || '').trim().toLowerCase() === normVal ||
                         String(opt.value || '').trim().toLowerCase() === normVal ||
                         String(opt.value || '').trim().toLowerCase() === normVal.replace(/\s+/g, '-') ||
                         (opt.n != null && String(opt.n) === normVal.replace(/\D+/g, ''));
      optBtn.className = 'select-option' + (isSelected ? ' select-option-active' : '');
      optBtn.setAttribute('aria-selected', isSelected ? 'true' : 'false');

      optBtn.innerHTML = `
        <span class="select-option-text">
          <span class="select-option-title">${escapeHtml(opt.label)}</span>
          ${opt.subtitle ? `<span class="select-option-subtitle">${escapeHtml(opt.subtitle)}</span>` : ''}
        </span>
        ${isSelected ? `
        <svg class="select-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#ffffff;flex-shrink:0;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>` : ''}
      `;

      optBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(opt);
        closeCurrentPopup();
      };

      popup.appendChild(optBtn);
    });

    document.body.appendChild(popup);

    const rect = triggerBtn.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = Math.min(rect.bottom + 8, window.innerHeight - 340) + 'px';
    popup.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 280)) + 'px';
    popup.style.maxHeight = 'min(70vh, 22rem)';
    popup.style.overflowY = 'auto';
    popup.style.zIndex = '99999';

    void popup.offsetHeight;
    popup.classList.add('select-popup-open');
    triggerBtn.setAttribute('aria-expanded', 'true');
    const caret = triggerBtn.querySelector('.title-select-caret svg, .select-caret svg, svg:last-child');
    if (caret) caret.style.transform = 'rotate(180deg)';

    activePopupEl = popup;
    activeTriggerBtn = triggerBtn;

    popupOutsideHandler = function(e) {
      if (!popup.contains(e.target) && !triggerBtn.contains(e.target)) {
        closeCurrentPopup();
      }
    };
    popupKeyHandler = function(e) {
      if (e.key === 'Escape') closeCurrentPopup();
    };
    setTimeout(() => {
      if (popupOutsideHandler && activePopupEl === popup) {
        document.addEventListener('click', popupOutsideHandler);
        document.addEventListener('keydown', popupKeyHandler);
      }
    }, 10);
  }

  function handleDynamicTrendingFilter(timeKey) {
    const isTv = normalizeRoutePath(window.location.pathname).startsWith('/tv');
    const railTrack = document.querySelector('.rail-track[role="list"]');
    if (!railTrack) return;

    railTrack.style.opacity = '0.35';
    railTrack.style.transition = 'opacity 0.2s ease-out';

    fetchApiJsonWithMeta(`/api/trending?kind=${isTv ? 'show' : 'movie'}`)
      .then(res => (res && res.data ? res.data : Promise.reject(new Error('No API data'))))
      .then(data => {
        railTrack.style.opacity = '1';
        const list = data?.lists?.[timeKey] || data?.lists?.week || [];
        if (list.length === 0) return;

        railTrack.innerHTML = list.map(item => `
          <div role="listitem">
            ${renderPosterCardHtml(item, { defaultIsTv: isTv })}
          </div>
        `).join('');

        initRailScroll();
      })
      .catch(() => {
        railTrack.style.opacity = '1';
      });
  }

  function initTitleSelect() {
    const cleanPath = normalizeRoutePath(window.location.pathname);
    const isTvDetail = cleanPath.startsWith('/tv/');
    const pathSlug = cleanPath.replace(/^\/tv\//, '').replace(/\/$/, '').split('/')[0];

    document.querySelectorAll('button.title-select, [role="combobox"].title-select, .title-select').forEach(el => {
      const triggerBtn = el.tagName === 'BUTTON' ? el : (el.querySelector('button') || el);
      if (triggerBtn.hasAttribute('data-dyn-season-select')) return;
      if (triggerBtn.__selectBound) return;
      triggerBtn.__selectBound = true;

      const btnText = (triggerBtn.querySelector('.title-select-text') || triggerBtn).textContent.trim();
      const parentRow = triggerBtn.closest('.title-row, .section, header');
      const isSeasonSelect = isTvDetail || btnText.startsWith('Season') || (parentRow && parentRow.textContent.includes('Episodes'));

      if (isSeasonSelect) {
        // Pre-warm exact season & episode counts from JSON-LD or Cinemeta in background
        if (pathSlug) {
          resolveShowSeasons(pathSlug).catch(() => {});
        }

        triggerBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (activeTriggerBtn === triggerBtn) {
            closeCurrentPopup();
            return;
          }

          let seasons = await resolveShowSeasons(pathSlug);
          if (!seasons) {
            const dlRows = document.querySelectorAll('.dl-file');
            const foundMap = new Map();
            dlRows.forEach(row => {
              const titleEl = row.querySelector('.dl-file-title');
              const metaEl = row.querySelector('.dl-file-meta');
              const m = titleEl?.textContent.match(/Season (\d+)/i);
              if (m) {
                const sn = parseInt(m[1], 10);
                const fileMatch = metaEl?.textContent.match(/(\d+)\s+files?/i);
                const count = fileMatch ? parseInt(fileMatch[1], 10) : null;
                foundMap.set(sn, count);
              }
            });

            if (foundMap.size > 0) {
              const maxSeason = Math.max(...foundMap.keys());
              seasons = [];
              for (let i = 1; i <= maxSeason; i++) {
                const c = foundMap.get(i);
                seasons.push({
                  n: i,
                  label: `Season ${i}`,
                  subtitle: c ? `${c} ${c === 1 ? 'episode' : 'episodes'}` : 'Episodes available'
                });
              }
            } else {
              seasons = [{ n: 1, label: 'Season 1', subtitle: 'Episodes available' }];
            }
          }

          const currentSeasonMatch = (triggerBtn.querySelector('.title-select-text') || triggerBtn).textContent.match(/Season (\d+)/i);
          const currentSeasonVal = currentSeasonMatch ? `Season ${currentSeasonMatch[1]}` : 'Season 1';

          openDropdownPopup(triggerBtn, seasons, currentSeasonVal, (selectedOpt) => {
            const labelSpan = triggerBtn.querySelector('.title-select-text') || triggerBtn;
            labelSpan.textContent = selectedOpt.label;
            loadSeasonEpisodes(pathSlug, selectedOpt.n);
          });
        };
      } else {
        const isGenre = GENRE_FILTER_OPTIONS.some(o => o.label.toLowerCase() === btnText.toLowerCase()) || /\b(Top|Greats)\b/i.test(parentRow?.textContent || '');
        const options = isGenre ? GENRE_FILTER_OPTIONS : TIME_FILTER_OPTIONS;

        triggerBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (activeTriggerBtn === triggerBtn) {
            closeCurrentPopup();
            return;
          }

          const currentVal = (triggerBtn.querySelector('.title-select-text') || triggerBtn).textContent.trim();
          openDropdownPopup(triggerBtn, options, currentVal, (selectedOpt) => {
            const labelSpan = triggerBtn.querySelector('.title-select-text') || triggerBtn;
            labelSpan.textContent = selectedOpt.label;
            updateShelfRail(triggerBtn, isGenre, selectedOpt);
          });
        };
      }
    });
  }

  function loadSeasonEpisodes(showSlug, seasonNum) {
    const railTrack = document.querySelector('.rail-track[role="list"]');
    if (!railTrack) return;

    function renderEpisodesList(episodes) {
      if (!episodes || episodes.length === 0) return;
      railTrack.innerHTML = episodes.map(ep => {
        const rawStill = ep.still && ep.still.src ? ep.still.src : (ep.still && /^https?:\/\//i.test(ep.still) ? ep.still : (ep.still ? `https://s.fli.cx/t/w500/${ep.still}` : ''));
        const stillUrl = safeImageUrl(rawStill);
        const ratingVal = ep.rating ? (typeof ep.rating === 'number' ? ep.rating.toFixed(1) : String(ep.rating)) : '';
        const epNum = Number(ep.n) || 1;
        const epTitle = ep.title || `Episode ${epNum}`;
        return `
          <div role="listitem" data-episode="${epNum}">
            <a class="card episode" data-rail-focus="true" aria-label="Episode ${epNum}: ${escapeAttr(epTitle)}" href="${escapeAttr(withBasePath(`/watch/${encodeURIComponent(showSlug)}/s${encodeURIComponent(seasonNum)}e${epNum}`))}">
              <span class="card-art card-still">
                <span class="card-pic">
                  ${stillUrl ? `<img data-fade="true" src="${escapeAttr(stillUrl)}" alt="${escapeAttr(epTitle)}" width="780" height="439" loading="lazy" decoding="async" draggable="false" />` : ''}
                </span>
              </span>
              <span class="episode-text">
                <span class="episode-meta">
                  <span>Episode ${epNum}${ep.runtime ? ` · ${escapeHtml(ep.runtime)}m` : ''}</span>
                  ${ratingVal ? `
                  <span class="episode-score">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
                      <path d="M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z"></path>
                    </svg>${escapeHtml(ratingVal)}<span class="sr-only"> out of 10</span>
                  </span>` : ''}
                </span>
                <span class="episode-title">${escapeHtml(epTitle)}</span>
                <span class="episode-story">${escapeHtml(ep.overview || '')}</span>
              </span>
            </a>
          </div>
        `;
      }).join('');
      railTrack.querySelectorAll('img[data-fade]').forEach(img => {
        if (img.complete && img.naturalWidth > 0) img.setAttribute('data-loaded', '');
        else img.addEventListener('load', () => img.setAttribute('data-loaded', ''), { once: true });
      });
      try { initRailScroll(); } catch (e) {}
    }

    railTrack.style.opacity = '0.5';
    fetchApiJsonWithMeta(`/api/tv/season?show=${encodeURIComponent(showSlug)}&n=${encodeURIComponent(seasonNum)}`)
      .then(res => (res && res.data ? res.data : Promise.reject(new Error('No API data'))))
      .then(data => {
        railTrack.style.opacity = '1';
        if (data && Array.isArray(data.episodes) && data.episodes.length > 0) {
          renderEpisodesList(data.episodes);
          return;
        }
        throw new Error('No episodes');
      })
      .catch(async () => {
        // Static GitHub Pages fallback: fetch episode list via Cinemeta Stremio CORS API
        try {
          const meta = await resolveTitleMeta(showSlug, 'show');
          const imdbId = meta?.imdbId || meta?.id || document.querySelector('[id^="rate-tt"]')?.id?.replace(/^rate-/, '');
          if (imdbId && /^tt\d+$/i.test(imdbId)) {
            const cmRes = await fetch(`https://v3-cinemeta.strem.io/meta/series/${encodeURIComponent(imdbId)}.json`);
            const cmData = cmRes.ok ? await cmRes.json().catch(() => null) : null;
            const videos = Array.isArray(cmData?.meta?.videos) ? cmData.meta.videos : [];
            const seasonEps = videos
              .filter(v => Number(v.season) === Number(seasonNum))
              .sort((a, b) => (Number(a.episode || a.number) || 0) - (Number(b.episode || b.number) || 0))
              .map(v => {
                const epNum = Number(v.episode || v.number) || 1;
                return {
                  n: epNum,
                  title: v.name || v.title || `Episode ${epNum}`,
                  overview: v.overview || v.description || '',
                  still: v.thumbnail || ''
                };
              });
            if (seasonEps.length > 0) {
              renderEpisodesList(seasonEps);
            } else {
              railTrack.innerHTML = `<div role="listitem" style="padding:1.25rem 0;color:rgba(255,255,255,0.62);font-size:0.95rem;">No aired episodes for Season ${escapeHtml(String(seasonNum))} yet.</div>`;
            }
          }
        } catch {}
        railTrack.style.opacity = '1';
      });
  }

  // --- 10b. Discover & Anime Page Filters + Surprise Me ---
  const DISCOVER_FILTER_OPTIONS = {
    source: [
      { value: 'all', label: 'All titles' },
      { value: 'library', label: 'In Kaira library' }
    ],
    sort: [
      { value: 'popular', label: 'Popular' },
      { value: 'rating', label: 'Highest rated' },
      { value: 'newest', label: 'Newest' },
      { value: 'oldest', label: 'Oldest' }
    ],
    animeSort: [
      { value: 'popular', label: 'Most watched' },
      { value: 'rating', label: 'Highest rated' },
      { value: 'newest', label: 'Newest' },
      { value: 'oldest', label: 'Oldest' }
    ],
    format: [
      { value: '', label: 'Any format' },
      { value: 'show', label: 'TV series' },
      { value: 'movie', label: 'Movie' }
    ],
    type: [
      { value: '', label: 'Any type' },
      { value: 'movie', label: 'Films' },
      { value: 'show', label: 'TV shows' }
    ],
    genre: [
      { value: '', label: 'Any genre' },
      { value: 'action', label: 'Action' },
      { value: 'adventure', label: 'Adventure' },
      { value: 'animation', label: 'Animation' },
      { value: 'comedy', label: 'Comedy' },
      { value: 'crime', label: 'Crime' },
      { value: 'documentary', label: 'Documentary' },
      { value: 'drama', label: 'Drama' },
      { value: 'family', label: 'Family' },
      { value: 'fantasy', label: 'Fantasy' },
      { value: 'horror', label: 'Horror' },
      { value: 'mystery', label: 'Mystery' },
      { value: 'romance', label: 'Romance' },
      { value: 'sci-fi', label: 'Sci-Fi' },
      { value: 'thriller', label: 'Thriller' }
    ],
    decade: [
      { value: '', label: 'Any decade' },
      { value: '2020s', label: '2020s' },
      { value: '2010s', label: '2010s' },
      { value: '2000s', label: '2000s' },
      { value: '1990s', label: '1990s' },
      { value: '1980s', label: '1980s' },
      { value: '1970s', label: '1970s' }
    ],
    rating: [
      { value: '', label: 'Any rating' },
      { value: '8', label: '8.0+' },
      { value: '7', label: '7.0+' },
      { value: '6', label: '6.0+' }
    ],
    length: [
      { value: '', label: 'Any length' },
      { value: 'short', label: 'Under 90m' },
      { value: 'medium', label: '90–140m' },
      { value: 'long', label: 'Over 140m' }
    ]
  };

  function initDiscoverPage() {
    const cleanPath = normalizeRoutePath(window.location.pathname);
    const isAnimePage = cleanPath === '/anime';
    if (cleanPath !== '/discover' && !isAnimePage) return;

    const grid = document.querySelector('ul.film-grid');
    const triggers = document.querySelectorAll('button.select-trigger');
    if (!grid || !triggers.length) return;

    // Snapshot initial DOM cards once so /anime AND static GitHub Pages /discover filter & sort instantaneously
    if (!grid.__kairaInitialCards) {
      grid.__kairaInitialCards = Array.from(grid.querySelectorAll(':scope > li')).map((li, idx) => {
        const link = li.querySelector('a.card-link');
        const href = link?.getAttribute('href') || '';
        const kind = link?.getAttribute('data-kind') || (href.includes('/tv/') ? 'show' : 'movie');
        const genre = (li.querySelector('.card-over-genre')?.textContent || '').trim().toLowerCase();
        const year = parseInt((li.querySelector('.card-over-year')?.textContent || '').trim(), 10) || 0;
        const rating = parseFloat((li.querySelector('.card-over-score')?.textContent || '').replace(/[^\d.]/g, '')) || 0;
        const slug = normalizeWatchSlug(href || link?.getAttribute('data-film') || '');
        return {
          idx,
          html: li.outerHTML,
          slug,
          kind,
          genre,
          year,
          rating
        };
      });
    }
    const initialCards = grid.__kairaInitialCards;

    const state = {
      source: 'all',
      sort: 'popular',
      format: '',
      type: '',
      genre: '',
      decade: '',
      rating: '',
      length: ''
    };
    let reqId = 0;

    function applyClientSideGridFilter() {
      let filtered = [...initialCards];
      if (state.source === 'library') {
        const wl = new Set(getWatchlist());
        filtered = filtered.filter(c => wl.has(c.slug));
      }
      const wantedKind = state.format || state.type;
      if (wantedKind) {
        filtered = filtered.filter(c => c.kind === wantedKind);
      }
      if (state.genre) {
        const g = state.genre.toLowerCase();
        filtered = filtered.filter(c => !c.genre || c.genre.includes(g) || (g === 'sci-fi' && c.genre.includes('sci')));
      }
      if (state.decade) {
        const startYear = parseInt(state.decade, 10);
        if (Number.isFinite(startYear)) {
          filtered = filtered.filter(c => c.year >= startYear && c.year < startYear + 10);
        }
      }
      if (state.rating) {
        const minR = parseFloat(state.rating);
        filtered = filtered.filter(c => !c.rating || c.rating >= minR);
      }
      if (state.sort === 'rating') {
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      } else if (state.sort === 'newest') {
        filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
      } else if (state.sort === 'oldest') {
        filtered.sort((a, b) => (a.year || 9999) - (b.year || 9999));
      } else {
        filtered.sort((a, b) => a.idx - b.idx);
      }

      if (filtered.length === 0) {
        grid.innerHTML = `
          <li style="grid-column:1 / -1;text-align:center;padding:4rem 1rem;color:rgba(255,255,255,0.65);">
            <p style="font-size:1.15rem;font-weight:600;color:#fff;">No titles match these filters</p>
            <p style="margin-top:0.4rem;font-size:0.9rem;">Try widening the format, genre, or rating filter.</p>
          </li>
        `;
      } else {
        grid.innerHTML = filtered.map(c => c.html).join('');
      }
      grid.setAttribute('aria-label', `${filtered.length} filtered titles`);
      const countEl = document.querySelector('p.catalogue-count span');
      if (countEl) {
        if (!countEl.dataset.originalHtml) countEl.dataset.originalHtml = countEl.innerHTML;
        const hasActiveFilter = Boolean(state.source !== 'all' || state.format || state.type || state.genre || state.decade || state.rating || state.length);
        if (hasActiveFilter) {
          const noun = isAnimePage ? 'anime' : 'titles';
          countEl.innerHTML = `<b>${filtered.length.toLocaleString()}</b> ${noun}`;
        } else {
          countEl.innerHTML = countEl.dataset.originalHtml;
        }
      }
      try { initWatchlist(); } catch {}
    }

    async function fetchDiscoverResults() {
      const currentReq = ++reqId;
      grid.style.transition = 'opacity 0.2s ease';
      grid.style.opacity = '0.45';

      // Anime page filters directly over the pre-rendered anime catalog cleanly on both local & GitHub Pages
      if (isAnimePage) {
        applyClientSideGridFilter();
        grid.style.opacity = '1';
        return;
      }

      const params = new URLSearchParams();
      if (state.type) params.set('kind', state.type);
      if (state.genre) params.set('genre', state.genre);
      if (state.sort && state.sort !== 'popular') params.set('sort', state.sort);
      if (state.decade) params.set('decade', state.decade);
      if (state.rating) params.set('minRating', state.rating);
      if (state.length) params.set('length', state.length);
      if (state.source === 'library') params.set('source', 'library');

      try {
        const apiRes = await fetchApiJsonWithMeta(`/api/browse?${params.toString()}`);
        if (!apiRes || !apiRes.data) throw new Error('No API data');
        const data = apiRes.data;
        if (currentReq !== reqId) return;

        let items = data?.films || data?.results || [];
        if (state.source === 'library') {
          const wl = new Set(getWatchlist());
          items = items.filter(it => wl.has(normalizeWatchSlug(it.slug || '')));
        }
        // Apply client-side refinement when upstream omits optional filter params
        if (state.rating) {
          const minR = parseFloat(state.rating);
          items = items.filter(it => !it.rating || Number(it.rating) >= minR);
        }
        if (state.decade) {
          const startYear = parseInt(state.decade, 10);
          if (Number.isFinite(startYear)) {
            items = items.filter(it => !it.year || (Number(it.year) >= startYear && Number(it.year) < startYear + 10));
          }
        }
        if (state.length) {
          items = items.filter(it => {
            const rt = Number(it.runtime);
            if (!rt) return true;
            if (state.length === 'short') return rt < 90;
            if (state.length === 'medium') return rt >= 90 && rt <= 140;
            if (state.length === 'long') return rt > 140;
            return true;
          });
        }
        if (state.sort === 'rating') {
          items = [...items].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
        } else if (state.sort === 'newest') {
          items = [...items].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
        } else if (state.sort === 'oldest') {
          items = [...items].sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999));
        }

        if (items.length === 0) {
          grid.innerHTML = `
            <li style="grid-column:1 / -1;text-align:center;padding:4rem 1rem;color:rgba(255,255,255,0.65);">
              <p style="font-size:1.15rem;font-weight:600;color:#fff;">No titles match these filters</p>
              <p style="margin-top:0.4rem;font-size:0.9rem;">Try widening the genre, decade, or rating filter.</p>
            </li>
          `;
        } else {
          grid.innerHTML = items
            .map(item => `<li>${renderPosterCardHtml(item, { defaultIsTv: state.type === 'show' })}</li>`)
            .join('');
        }
        grid.setAttribute('aria-label', `${items.length} filtered titles`);
        try { initWatchlist(); } catch {}
      } catch (err) {
        if (currentReq !== reqId) return;
        // Static GitHub Pages fallback: filter & sort initial DOM cards smoothly
        applyClientSideGridFilter();
      } finally {
        if (currentReq === reqId) {
          grid.style.opacity = '1';
        }
      }
    }

    // Hydrate initial filter state from URL query params (e.g. /discover?sort=rating&genre=drama)
    let hasInitialQueryFilters = false;
    try {
      const urlQ = new URLSearchParams(window.location.search);
      const queryMap = {
        sort: urlQ.get('sort') || '',
        genre: urlQ.get('genre') || '',
        type: urlQ.get('kind') || urlQ.get('type') || '',
        format: urlQ.get('format') || '',
        decade: urlQ.get('decade') || '',
        rating: urlQ.get('rating') || urlQ.get('minRating') || '',
        length: urlQ.get('length') || '',
        source: urlQ.get('source') || ''
      };
      for (const [k, v] of Object.entries(queryMap)) {
        if (v && Object.prototype.hasOwnProperty.call(state, k) && state[k] !== v) {
          state[k] = v;
          hasInitialQueryFilters = true;
        }
      }
    } catch {}

    triggers.forEach(btn => {
      const labelEl = btn.querySelector('.select-label');
      const valueEl = btn.querySelector('.select-value');
      const key = (labelEl?.textContent || '').trim().toLowerCase();
      const options = (isAnimePage && key === 'sort') ? DISCOVER_FILTER_OPTIONS.animeSort : DISCOVER_FILTER_OPTIONS[key];
      if (!options) return;

      if (state[key]) {
        const matched = options.find(o => o.value.toLowerCase() === String(state[key]).toLowerCase());
        if (matched && valueEl) {
          valueEl.textContent = matched.label;
          btn.setAttribute('aria-label', `${labelEl?.textContent || key}: ${matched.label}`);
        }
      }

      if (btn.__discoverBound) return;
      btn.__discoverBound = true;

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeTriggerBtn === btn) {
          closeCurrentPopup();
          return;
        }
        const currentVal = (valueEl?.textContent || '').trim();
        openDropdownPopup(btn, options, currentVal, (selectedOpt) => {
          state[key] = selectedOpt.value;
          if (valueEl) valueEl.textContent = selectedOpt.label;
          btn.setAttribute('aria-label', `${labelEl?.textContent || key}: ${selectedOpt.label}`);
          fetchDiscoverResults();
        });
      };
    });

    if (hasInitialQueryFilters) {
      fetchDiscoverResults();
    }

    // Wire "Surprise me" button
    document.querySelectorAll('main button').forEach(btn => {
      if (btn.__surpriseBound) return;
      if (!/surprise me/i.test(btn.textContent || '')) return;
      btn.__surpriseBound = true;
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const links = Array.from(grid.querySelectorAll('a.card-link[href]'));
        if (!links.length) return;
        const pick = links[Math.floor(Math.random() * links.length)];
        const href = pick.getAttribute('href');
        if (href) {
          stashCardMetaFromElement(pick, href);
          navigateTo(withBasePath(href));
        }
      };
    });
  }

  // --- 11. Full Categorized Search Functionality on /search ---
  let searchShortcutBound = false;

  function renderPersonCardHtml(person) {
    const name = person.name || 'Unknown';
    const initial = name.trim().charAt(0).toUpperCase() || '?';
    const roleParts = [];
    if (person.role) roleParts.push(person.role);
    if (person.films) roleParts.push(`${person.films} ${person.films === 1 ? 'film' : 'films'}`);
    const roleMeta = roleParts.join(' · ');
    const photoPath = typeof person.photo === 'string' && person.photo.startsWith('/') ? person.photo : '';
    const photoUrl = photoPath ? `https://s.fli.cx/t/w185${photoPath}` : safeImageUrl(person.photo);
    const fallbackPhotoUrl = photoPath ? `https://image.tmdb.org/t/p/w185${photoPath}` : '';
    const href = person.href && person.href.startsWith('/') ? person.href : `/search?q=${encodeURIComponent(name)}`;

    return `
      <a class="person" href="${escapeAttr(href)}">
        <span class="person-photo">
          <span class="person-initial" aria-hidden="true">${escapeHtml(initial)}</span>
          ${photoUrl ? `
          <span class="person-pic">
            <img data-fade="true" src="${escapeAttr(photoUrl)}" ${fallbackPhotoUrl ? `data-fallback-src="${escapeAttr(fallbackPhotoUrl)}"` : ''} alt="" loading="lazy" decoding="async" draggable="false" />
          </span>` : ''}
        </span>
        <span class="person-name">${escapeHtml(name)}</span>
        ${roleMeta ? `<span class="person-role">${escapeHtml(roleMeta)}</span>` : ''}
      </a>
    `;
  }

  function renderSearchGroupCardHtml(group) {
    const name = group.name || '';
    const metaParts = [];
    if (group.kind) metaParts.push(group.kind);
    if (group.films) metaParts.push(`${group.films} ${group.films === 1 ? 'film' : 'films'}`);
    const href = group.href && group.href.startsWith('/') ? group.href : `/search?q=${encodeURIComponent(name)}`;

    return `
      <a class="search-group" href="${escapeAttr(href)}">
        <span class="search-group-name">${escapeHtml(name)}</span>
        ${metaParts.length ? `<span class="search-group-meta">${escapeHtml(metaParts.join(' · '))}</span>` : ''}
      </a>
    `;
  }

  function initSearchPage() {
    // Guard global "/" shortcut once per window session
    if (!searchShortcutBound) {
      searchShortcutBound = true;
      document.addEventListener('keydown', (e) => {
        if (settingsState.keyboardEnabled === false) return;
        const activeTag = document.activeElement?.tagName || '';
        if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) && !document.activeElement?.isContentEditable) {
          e.preventDefault();
          const liveInput = document.getElementById('search-page-input');
          if (normalizeRoutePath(window.location.pathname).startsWith('/search') && liveInput) {
            liveInput.focus();
            liveInput.select();
          } else {
            navigateTo(withBasePath('/search'));
          }
        }
      });
    }

    const isSearchPage = normalizeRoutePath(window.location.pathname).startsWith('/search');
    const searchInput = document.getElementById('search-page-input') || document.querySelector('main input[type="search"]');
    if (!isSearchPage || !searchInput || searchInput.__kairaSearchBound) return;
    searchInput.__kairaSearchBound = true;

    const searchForm = searchInput.closest('form.search-field') || searchInput.parentElement;
    const searchTop = searchInput.closest('.search-top') || searchForm.parentElement;
    const searchBrowse = searchTop?.querySelector('.search-browse');
    const searchStart = document.querySelector('.search-start');
    const pageEl = document.querySelector('.page') || document.querySelector('main') || document.body;

    // Ensure light pillar engine script is loaded & running on /search (even after SPA navigation from /)
    try {
      if (typeof window.initFlicxLightPillar === 'function') {
        window.initFlicxLightPillar();
      } else if (!document.querySelector('script[src*="flicx-pillar-engine.js"]')) {
        const s = document.createElement('script');
        s.src = withBasePath('/flicx-pillar-engine.js');
        s.async = true;
        s.onload = () => {
          if (normalizeRoutePath(window.location.pathname).startsWith('/search') && typeof window.initFlicxLightPillar === 'function') {
            window.initFlicxLightPillar();
          }
        };
        document.body.appendChild(s);
      }
    } catch (e) {}

    // Prevent full page reload when pressing Enter in search form
    if (searchForm && searchForm.tagName === 'FORM') {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        clearTimeout(searchTimer);
        executeSearch(searchInput.value);
      });
    }

    // Clear button inside search field
    let clearBtn = searchForm.querySelector('.search-field-clear');
    if (!clearBtn) {
      clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'search-field-clear';
      clearBtn.setAttribute('aria-label', 'Clear search');
      clearBtn.style.display = 'none';
      clearBtn.innerHTML = svg('close');
      searchForm.appendChild(clearBtn);
    }

    // Segmented filter tabs container inside .search-top (replaces .search-browse while searching)
    let tabsWrap = searchTop?.querySelector('.search-tabs');
    if (!tabsWrap && searchTop) {
      tabsWrap = document.createElement('div');
      tabsWrap.className = 'search-tabs';
      tabsWrap.style.display = 'none';
      searchTop.appendChild(tabsWrap);
    }

    // Categorized results container
    let resultsContainer = document.querySelector('.search-results');
    if (!resultsContainer) {
      resultsContainer = document.createElement('div');
      resultsContainer.className = 'search-results';
      resultsContainer.style.display = 'none';
      if (searchStart && searchStart.parentNode) {
        searchStart.parentNode.insertBefore(resultsContainer, searchStart.nextSibling);
      } else {
        pageEl.appendChild(resultsContainer);
      }
    }

    let searchTimer = null;
    let searchReqId = 0;
    let activeTab = 'all';
    let lastPayload = null;

    function setActiveTab(tabKey) {
      activeTab = tabKey;
      renderSearchPayload();
    }

    function renderTabs(films, shows, people) {
      if (!tabsWrap) return;
      const tabs = [{ key: 'all', label: 'All', count: null }];
      if (films.length > 0) tabs.push({ key: 'films', label: 'Films', count: films.length });
      if (shows.length > 0) tabs.push({ key: 'shows', label: 'TV shows', count: shows.length });
      if (people.length > 0) tabs.push({ key: 'people', label: 'People', count: people.length });

      if (!tabs.some(t => t.key === activeTab)) activeTab = 'all';

      tabsWrap.innerHTML = `
        <div class="segmented" role="radiogroup" aria-label="Filter search results">
          ${tabs.map(t => {
            const checked = activeTab === t.key;
            return `
              <button type="button" role="radio" class="segmented-item" data-search-tab="${t.key}" aria-checked="${checked ? 'true' : 'false'}">
                ${checked ? '<span class="segmented-active" aria-hidden="true"></span>' : ''}
                <span class="segmented-label">${escapeHtml(t.label)}</span>
                ${t.count != null ? `<span class="segmented-count">${t.count}</span>` : ''}
              </button>
            `;
          }).join('')}
        </div>
      `;
      tabsWrap.style.display = 'block';

      tabsWrap.querySelectorAll('[data-search-tab]').forEach(btn => {
        btn.onclick = () => {
          setActiveTab(btn.getAttribute('data-search-tab'));
        };
      });
    }

    function renderSearchPayload() {
      if (!lastPayload) return;
      const { query, films, shows, people, groups } = lastPayload;
      const total = films.length + shows.length + people.length + groups.length;

      if (total === 0) {
        if (tabsWrap) tabsWrap.style.display = 'none';
        resultsContainer.innerHTML = `
          <div class="shell gutter search-none" style="text-align:center;padding:5rem 1rem;">
            <h3 class="search-none-title" style="font-size:1.35rem;font-weight:700;color:#fff;">No results found for "${escapeHtml(query)}"</h3>
            <p class="search-none-text" style="color:rgba(255,255,255,0.58);margin-top:0.5rem;font-size:0.95rem;">Try checking the spelling or searching for another title, person, or studio.</p>
          </div>
        `;
        return;
      }

      renderTabs(films, shows, people);

      const sectionsHtml = [];
      const showFilms = activeTab === 'all' || activeTab === 'films';
      const showShows = activeTab === 'all' || activeTab === 'shows';
      const showPeople = activeTab === 'all' || activeTab === 'people';
      const showGroups = activeTab === 'all';

      if (showFilms && films.length > 0) {
        const displayFilms = activeTab === 'all' ? films.slice(0, 7) : films;
        sectionsHtml.push(`
          <section class="section search-section" aria-label="Films">
            <header class="shell gutter search-section-head">
              <h2 class="section-title">Films</h2>
              ${activeTab === 'all' && films.length > 7
                ? `<button type="button" class="search-section-all" data-switch-tab="films">All ${films.length} films</button>`
                : ''}
            </header>
            <div class="shell gutter">
              <ul class="film-grid search-film-grid" role="list" aria-label="Films matching ${escapeAttr(query)}">
                ${displayFilms.map(item => `<li>${renderPosterCardHtml(item, { defaultIsTv: false })}</li>`).join('')}
              </ul>
            </div>
          </section>
        `);
      }

      if (showShows && shows.length > 0) {
        const displayShows = activeTab === 'all' ? shows.slice(0, 7) : shows;
        sectionsHtml.push(`
          <section class="section search-section" aria-label="TV shows">
            <header class="shell gutter search-section-head">
              <h2 class="section-title">TV shows</h2>
              ${activeTab === 'all' && shows.length > 7
                ? `<button type="button" class="search-section-all" data-switch-tab="shows">All ${shows.length} TV shows</button>`
                : ''}
            </header>
            <div class="shell gutter">
              <ul class="film-grid search-film-grid" role="list" aria-label="TV shows matching ${escapeAttr(query)}">
                ${displayShows.map(item => `<li>${renderPosterCardHtml(item, { defaultIsTv: true })}</li>`).join('')}
              </ul>
            </div>
          </section>
        `);
      }

      if (showPeople && people.length > 0) {
        const displayPeople = activeTab === 'all' ? people.slice(0, 10) : people;
        sectionsHtml.push(`
          <section class="section search-section" aria-label="People">
            <header class="shell gutter search-section-head">
              <h2 class="section-title">People</h2>
              ${activeTab === 'all' && people.length > 10
                ? `<button type="button" class="search-section-all" data-switch-tab="people">All ${people.length} people</button>`
                : ''}
            </header>
            <div class="shell gutter">
              <div class="search-people" role="list" aria-label="People matching ${escapeAttr(query)}">
                ${displayPeople.map(p => renderPersonCardHtml(p)).join('')}
              </div>
            </div>
          </section>
        `);
      }

      if (showGroups && groups.length > 0) {
        sectionsHtml.push(`
          <section class="section search-section" aria-label="Series and studios">
            <header class="shell gutter search-section-head">
              <h2 class="section-title">Series and studios</h2>
            </header>
            <div class="shell gutter">
              <div class="search-groups">
                ${groups.map(g => renderSearchGroupCardHtml(g)).join('')}
              </div>
            </div>
          </section>
        `);
      }

      resultsContainer.innerHTML = sectionsHtml.join('');

      resultsContainer.querySelectorAll('[data-switch-tab]').forEach(btn => {
        btn.onclick = () => {
          setActiveTab(btn.getAttribute('data-switch-tab'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        };
      });
    }

    function executeSearch(rawQuery) {
      const query = (rawQuery || '').trim();

      // Keep URL query synchronized
      try {
        const nextUrl = withBasePath(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
        if (window.location.pathname + window.location.search !== nextUrl) {
          window.history.replaceState({ path: nextUrl }, document.title, nextUrl);
          currentRenderedPath = nextUrl;
        }
      } catch {}

      if (!query) {
        searchReqId++;
        lastPayload = null;
        activeTab = 'all';
        clearBtn.style.display = 'none';
        resultsContainer.style.display = 'none';
        if (tabsWrap) tabsWrap.style.display = 'none';
        if (searchBrowse) searchBrowse.style.display = '';
        if (searchStart) searchStart.style.display = 'block';
        return;
      }

      const reqId = ++searchReqId;
      activeTab = 'all';
      clearBtn.style.display = 'grid';
      if (searchBrowse) searchBrowse.style.display = 'none';
      if (searchStart) searchStart.style.display = 'none';
      resultsContainer.style.display = 'block';
      resultsContainer.classList.add('search-results-stale');

      if (!lastPayload) {
        resultsContainer.innerHTML = `
          <div class="shell gutter" style="text-align:center;padding:4rem 0;color:rgba(255,255,255,0.62);">
            <div class="search-wait-spinner" style="display:inline-block;width:1.85rem;height:1.85rem;border:2.5px solid rgba(255,255,255,0.2);border-top-color:var(--color-flare, #f59e0b);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
            <p style="margin-top:0.85rem;font-size:0.92rem;">Searching for "${escapeHtml(query)}"...</p>
          </div>
        `;
      }

      fetchApiJsonWithMeta(`/api/search?q=${encodeURIComponent(query)}&full=1`)
        .then(res => (res && res.data ? res.data : Promise.reject(new Error('No API data'))))
        .then(data => {
          if (reqId !== searchReqId) return;
          resultsContainer.classList.remove('search-results-stale');

          let films = Array.isArray(data.films) ? data.films : [];
          let shows = Array.isArray(data.shows) ? data.shows : [];
          if (!films.length && !shows.length && Array.isArray(data.results)) {
            for (const item of data.results) {
              if (item.kind === 'show') shows.push(item);
              else films.push(item);
            }
          }
          const people = Array.isArray(data.people) ? data.people : [];
          const groups = Array.isArray(data.groups) ? data.groups : [];

          lastPayload = { query, films, shows, people, groups };
          renderSearchPayload();
        })
        .catch(async () => {
          // Static GitHub Pages fallback: live CORS Cinemeta Stremio movie & series search
          try {
            const [movieRes, seriesRes] = await Promise.all([
              fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(query)}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null),
              fetch(`https://v3-cinemeta.strem.io/catalog/series/top/search=${encodeURIComponent(query)}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null)
            ]);
            if (reqId !== searchReqId) return;
            const mapMeta = (m, kind) => {
              const id = m.imdb_id || m.id || '';
              const year = String(m.releaseInfo || m.year || '').match(/\d{4}/)?.[0] || '';
              return {
                id,
                slug: makeSlugFromTitleYear(m.name, year) || id,
                title: m.name || 'Untitled',
                year,
                kind,
                poster: m.poster || '',
                rating: m.imdbRating ? Number(m.imdbRating) : undefined,
                genres: Array.isArray(m.genres) ? m.genres : []
              };
            };
            const films = (Array.isArray(movieRes?.metas) ? movieRes.metas : []).slice(0, 24).map(m => mapMeta(m, 'movie'));
            const shows = (Array.isArray(seriesRes?.metas) ? seriesRes.metas : []).slice(0, 24).map(m => mapMeta(m, 'show'));
            resultsContainer.classList.remove('search-results-stale');
            lastPayload = { query, films, shows, people: [], groups: [] };
            renderSearchPayload();
            return;
          } catch {}

          if (reqId !== searchReqId) return;
          resultsContainer.classList.remove('search-results-stale');
          if (tabsWrap) tabsWrap.style.display = 'none';
          resultsContainer.innerHTML = `
            <div class="shell gutter search-none" style="text-align:center;padding:5rem 1rem;">
              <h3 class="search-none-title" style="font-size:1.35rem;font-weight:700;color:#fff;">Search is unavailable</h3>
              <p class="search-none-text" style="color:rgba(255,255,255,0.55);margin-top:0.5rem;">Could not load search results. Please try again.</p>
            </div>
          `;
        });
    }

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        executeSearch(e.target.value);
      }, 180);
    });

    clearBtn.onclick = () => {
      searchInput.value = '';
      executeSearch('');
      searchInput.focus();
    };

    const params = new URLSearchParams(window.location.search);
    if (params.has('q') && params.get('q').trim()) {
      searchInput.value = params.get('q');
      executeSearch(params.get('q'));
    }
  }

  // --- 12. Liquid Glass Styles & Animation Injection ---
  function applyLiquidChromeAttributes() {
    try {
      // Never put data-liquid on the outer fixed .tab-bar wrapper — only on its inner chrome pill
      document.querySelectorAll('nav.tab-bar[data-liquid]').forEach(el => {
        el.removeAttribute('data-liquid');
      });
      const selectors = [
        '.site-header [data-chrome]',
        '.top-nav',
        '.top-pill',
        '.header-tools',
        '.tab-bar [data-chrome]'
      ];
      document.querySelectorAll(selectors.join(', ')).forEach(el => {
        if (!el.hasAttribute('data-liquid')) {
          el.setAttribute('data-liquid', '');
        }
      });
    } catch (e) {
      console.warn('Error applying data-liquid attribute', e);
    }
  }

  function injectLiquidGlassStyles() {
    applyLiquidChromeAttributes();
    if (document.getElementById('flicx-liquid-glass-styles')) return;
    const style = document.createElement('style');
    style.id = 'flicx-liquid-glass-styles';
    style.textContent = `
      /* Ensure absolute nav container centering */
      nav[aria-label="Primary"].absolute,
      .site-header nav.absolute {
        position: absolute !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        translate: none !important;
      }

      /* Hero Switcher Progress Bar & Dots */
      .hero-switch-bars {
        align-items: center !important;
        height: 100% !important;
        display: flex !important;
      }
      .hero-switch-bar {
        align-items: center !important;
        height: 100% !important;
        padding-inline: 0.25rem !important;
        display: flex !important;
        background: transparent !important;
        border: none !important;
        cursor: pointer !important;
      }
      .hero-switch-bar > span {
        width: 0.5rem !important;
        height: 0.3125rem !important;
        transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease !important;
        background: rgba(255, 255, 255, 0.32) !important;
        border-radius: 999px !important;
        display: block !important;
        overflow: clip !important;
        position: relative !important;
      }
      .hero-switch-bar[aria-current="true"] > span {
        width: 2.25rem !important;
      }
      .hero-switch-bar:not([aria-current="true"]):hover > span {
        background: rgba(255, 255, 255, 0.62) !important;
      }
      .hero-switch-fill {
        border-radius: inherit !important;
        background: #ffffff !important;
        transform-origin: 0 50% !important;
        height: 100% !important;
        width: 100% !important;
        display: block !important;
      }
      .hero-clock {
        animation: hero-clock var(--hero-duration, 7s) linear both !important;
        animation-play-state: var(--hero-play, running) !important;
      }
      @keyframes hero-clock {
        0% { transform: scaleX(0); }
        100% { transform: scaleX(1); }
      }

      /* Hero Title Logo Fallback Typography */
      .hero-title-fallback {
        margin: 0;
        font-size: clamp(2rem, 4.2vw, 3.6rem);
        font-weight: 800;
        letter-spacing: -0.025em;
        line-height: 1.05;
        color: #ffffff;
        text-shadow: 0 4px 24px rgba(0, 0, 0, 0.65);
      }

      /* Capsule Buttons: Keep Play button dark ink on bright white pill, dark buttons crisp white */
      .capsule-btn.capsule-btn-text:not(.capsule-btn-lit) {
        padding-inline: 0.875rem 1.078rem !important;
        font-size: 0.9375rem !important;
        font-weight: 600 !important;
        color: #ffffff !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 0.5rem !important;
        white-space: nowrap !important;
      }
      .capsule-btn.capsule-btn-lit,
      .capsule-btn.capsule-btn-lit span,
      .capsule-btn.capsule-btn-lit.capsule-btn-text,
      .capsule-btn.capsule-btn-play.capsule-btn-lit,
      .capsule-btn.capsule-btn-play.capsule-btn-lit span {
        color: #0b0d13 !important;
      }
      .capsule-btn.capsule-btn-lit,
      .capsule-btn.capsule-btn-lit.capsule-btn-text,
      .capsule-btn.capsule-btn-play.capsule-btn-lit {
        background: #f5f5f7 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 0.45rem !important;
      }
      .capsule-btn.capsule-btn-lit:hover,
      .capsule-btn.capsule-btn-play.capsule-btn-lit:hover {
        background: #ffffff !important;
        color: #0b0d13 !important;
      }
      .capsule-btn.capsule-btn-lit svg,
      .capsule-btn.capsule-btn-play.capsule-btn-lit svg {
        color: #0b0d13 !important;
        fill: currentColor !important;
      }

      /* Defensive Poster Card + Button Sizing (never overflows card) */
      .card-art > .cover-add {
        width: clamp(28px, 16cqi, 36px) !important;
        height: clamp(28px, 16cqi, 36px) !important;
      }
      .cover-add > svg {
        width: 47% !important;
        height: 47% !important;
      }

      /* Graceful Fallback Card when poster image fails or is missing */
      .card-art:has(img[data-failed]) {
        background: #1a1b20 !important;
      }
      .card-art:has(img[data-failed]) .card-pic {
        opacity: 0 !important;
      }
      .card-art:has(img[data-failed]) .card-fallback {
        display: grid !important;
        place-items: center !important;
        color: rgba(248, 247, 244, 0.78) !important;
        font-size: 0.875rem !important;
        font-weight: 600 !important;
        padding: 0.85rem !important;
        text-align: center !important;
        line-height: 1.3 !important;
      }

      /* Search Page Categorized View (matches reference screenshot) */
      .search-field {
        position: relative;
      }
      .search-field-clear {
        position: absolute;
        right: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 9999px;
        border: none;
        background: rgba(255, 255, 255, 0.14);
        color: rgba(255, 255, 255, 0.85);
        place-items: center;
        cursor: pointer;
        font-size: 0.85rem;
        transition: background-color 0.16s ease, color 0.16s ease;
        z-index: 3;
      }
      .search-field-clear:hover {
        background: rgba(255, 255, 255, 0.25);
        color: #ffffff;
      }
      .search-tabs {
        margin-top: 1rem !important;
        position: relative;
        z-index: 2;
      }
      .search-tabs .segmented {
        display: inline-flex !important;
        align-items: center !important;
        gap: 0.2rem !important;
        padding: 0.25rem !important;
        border-radius: 999px !important;
        background: rgba(255, 255, 255, 0.08) !important;
        -webkit-backdrop-filter: blur(22px) saturate(1.5) !important;
        backdrop-filter: blur(22px) saturate(1.5) !important;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12) !important;
      }
      .search-tabs .segmented-item {
        position: relative !important;
        height: 2.15rem !important;
        padding-inline: 0.9rem !important;
        border: none !important;
        background: transparent !important;
        box-shadow: none !important;
        color: rgba(255, 255, 255, 0.72) !important;
        font-size: 0.84rem !important;
        font-weight: 500 !important;
        border-radius: 999px !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 0.42rem !important;
        cursor: pointer !important;
        transition: color 0.18s ease, background-color 0.18s ease !important;
      }
      .search-tabs .segmented-item:hover {
        color: #ffffff !important;
      }
      .search-tabs .segmented-item[aria-checked="true"] {
        color: #ffffff !important;
        font-weight: 600 !important;
      }
      .search-tabs .segmented-active {
        position: absolute !important;
        inset: 0 !important;
        border-radius: 999px !important;
        background: rgba(255, 255, 255, 0.18) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22) !important;
        z-index: 0 !important;
      }
      .search-tabs .segmented-label,
      .search-tabs .segmented-count {
        position: relative;
        z-index: 1;
      }
      .search-tabs .segmented-count {
        color: rgba(255, 255, 255, 0.5) !important;
        font-size: 0.76rem !important;
        font-weight: 500 !important;
      }
      .search-tabs .segmented-item[aria-checked="true"] .segmented-count {
        color: rgba(255, 255, 255, 0.72) !important;
      }

      .search-results {
        position: relative !important;
        z-index: 1 !important;
        padding-bottom: 4.5rem !important;
      }
      .search-section {
        margin-top: 2rem !important;
      }
      .search-section:first-child {
        margin-top: 1.5rem !important;
      }
      .search-section-head {
        display: flex !important;
        align-items: baseline !important;
        justify-content: space-between !important;
        gap: 1rem !important;
        margin-bottom: 0.9rem !important;
      }
      .search-section-head .section-title {
        font-size: 1.15rem !important;
        font-weight: 700 !important;
        color: #ffffff !important;
        margin: 0 !important;
        letter-spacing: -0.01em !important;
      }
      .search-section-all {
        background: transparent !important;
        border: none !important;
        color: rgba(255, 255, 255, 0.65) !important;
        font-size: 0.84rem !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        padding: 0.2rem 0.4rem !important;
        border-radius: 0.5rem !important;
        transition: color 0.18s ease !important;
      }
      .search-section-all:hover {
        color: #ffffff !important;
      }

      .search-film-grid.film-grid {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 1.15rem 0.85rem !important;
        list-style: none !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      @media (min-width: 560px) {
        .search-film-grid.film-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
      }
      @media (min-width: 820px) {
        .search-film-grid.film-grid { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; }
      }
      @media (min-width: 1180px) {
        .search-film-grid.film-grid { grid-template-columns: repeat(7, minmax(0, 1fr)) !important; }
      }

      .search-people {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 1.5rem 0.95rem !important;
      }
      @media (min-width: 640px) {
        .search-people { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; }
      }
      @media (min-width: 960px) {
        .search-people { grid-template-columns: repeat(7, minmax(0, 1fr)) !important; }
      }
      @media (min-width: 1240px) {
        .search-people { grid-template-columns: repeat(10, minmax(0, 1fr)) !important; }
      }
      .person-photo {
        background: #1c1d22 !important;
        overflow: hidden !important;
      }
      .person-pic {
        z-index: 2 !important;
      }
      .person-pic:has(img[data-failed]) {
        display: none !important;
      }
      .person-initial {
        z-index: 1 !important;
        color: rgba(255, 255, 255, 0.52) !important;
        font-size: 1.45rem !important;
        font-weight: 500 !important;
      }
      .person-name {
        color: #ffffff !important;
        font-size: 0.8rem !important;
        font-weight: 600 !important;
        margin-top: 0.55rem !important;
      }
      .person:hover .person-name {
        color: var(--color-flare, #f59e0b) !important;
      }
      .person-role {
        color: rgba(255, 255, 255, 0.52) !important;
        font-size: 0.72rem !important;
      }

      .search-groups {
        display: grid !important;
        grid-template-columns: repeat(auto-fill, minmax(14.5rem, 1fr)) !important;
        gap: 0.75rem !important;
      }
      .search-group {
        background: rgba(255, 255, 255, 0.06) !important;
        -webkit-backdrop-filter: blur(18px) !important;
        backdrop-filter: blur(18px) !important;
        border-radius: 0.9rem !important;
        padding: 0.9rem 1.05rem !important;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1) !important;
        text-decoration: none !important;
        color: #ffffff !important;
      }
      .search-group:hover {
        background: rgba(255, 255, 255, 0.12) !important;
      }

      /* Rating star active state & Kaira Toast */
      .rate-star-active {
        color: var(--color-flare, #f59e0b) !important;
        opacity: 1 !important;
      }
      .kaira-toast {
        position: fixed;
        bottom: 1.75rem;
        left: 50%;
        transform: translateX(-50%) translateY(16px);
        background: rgba(22, 24, 32, 0.92);
        -webkit-backdrop-filter: blur(20px) saturate(1.6);
        backdrop-filter: blur(20px) saturate(1.6);
        color: #ffffff;
        padding: 0.65rem 1.15rem;
        border-radius: 999px;
        font-size: 0.875rem;
        font-weight: 500;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12), 0 16px 36px -8px rgba(0, 0, 0, 0.75);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 100000;
      }
      .kaira-toast.kaira-toast-visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* Rail Arrow Smooth Transitions */
      .rail-arrow {
        transition: opacity 0.2s ease, transform 0.2s ease !important;
        cursor: pointer !important;
      }
      .rail-arrow:hover:not([disabled]) {
        transform: scale(1.08) !important;
      }
      .rail-arrow[disabled] {
        opacity: 0 !important;
        pointer-events: none !important;
      }

      /* Logo Hover-Only Spring Animation */
      #Rectangle_22048,
      #Union,
      #Rectangle_22049 {
        animation-play-state: paused !important;
        animation-iteration-count: 1 !important;
      }
      .flicx-logo-link:hover #Rectangle_22048,
      .flicx-logo-link:hover #Union,
      .flicx-logo-link:hover #Rectangle_22049,
      .flicx-logo-link.is-animating #Rectangle_22048,
      .flicx-logo-link.is-animating #Union,
      .flicx-logo-link.is-animating #Rectangle_22049 {
        animation-play-state: running !important;
      }

      /* Liquid Glass Header & Navbar via data-liquid (excluding outer fixed .tab-bar wrapper) */
      [data-liquid]:not(.tab-bar),
      .site-header [data-chrome][data-liquid],
      .site-header [data-chrome],
      .top-nav.top-pill,
      .top-pill[data-liquid],
      .header-tools[data-liquid],
      .header-tools.glass,
      .tab-bar [data-chrome][data-liquid],
      .tab-bar [data-chrome] {
        background: color-mix(in oklab, #141721 44%, transparent) !important;
        -webkit-backdrop-filter: blur(calc(24px * var(--blur-scale, 1))) saturate(1.85) brightness(0.9) !important;
        backdrop-filter: blur(calc(24px * var(--blur-scale, 1))) saturate(1.85) brightness(0.9) !important;
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.12),
          0 18px 45px -12px rgba(0, 0, 0, 0.65),
          inset 0 1px 1px 0 rgba(255, 255, 255, 0.32),
          inset 0 -1px 1px 0 rgba(0, 0, 0, 0.25) !important;
        border-radius: 9999px !important;
        position: relative !important;
        overflow: hidden !important;
      }
      /* Keep mobile & tablet bottom navigation dock genuinely fixed at viewport bottom */
      nav.tab-bar {
        position: fixed !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        z-index: 50 !important;
        background: transparent !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
        overflow: visible !important;
        pointer-events: none !important;
      }
      nav.tab-bar::before,
      nav.tab-bar::after {
        display: none !important;
        content: none !important;
      }
      nav.tab-bar [data-chrome] {
        pointer-events: auto !important;
        width: 100% !important;
        max-width: min(440px, calc(100vw - 24px)) !important;
        margin-inline: auto !important;
      }
      nav.tab-bar a {
        color: rgba(255, 255, 255, 0.58) !important;
        transition: color 0.2s ease, transform 0.2s ease !important;
      }
      nav.tab-bar a[aria-current="page"] {
        color: #ffffff !important;
      }
      nav.tab-bar .kaira-tab-pill {
        position: absolute !important;
        inset: 0 !important;
        border-radius: calc(1.375rem * var(--corner-scale, 1)) !important;
        background: rgba(255, 255, 255, 0.14) !important;
        pointer-events: none !important;
      }
      /* Hide navigation dock, header, and footer while playing a movie/show */
      body.kaira-watching nav.tab-bar,
      body.kaira-watching .site-header,
      body.kaira-watching footer {
        display: none !important;
      }
      [data-liquid]:not(.tab-bar):before,
      .site-header [data-chrome][data-liquid]:before,
      .top-pill[data-liquid]:before,
      .header-tools[data-liquid]:before,
      .tab-bar [data-chrome][data-liquid]:before {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        border-radius: inherit !important;
        background: linear-gradient(
          135deg,
          rgba(255, 255, 255, 0.22) 0%,
          rgba(255, 255, 255, 0.05) 35%,
          rgba(255, 255, 255, 0) 55%,
          rgba(255, 255, 255, 0.08) 100%
        ) !important;
        pointer-events: none !important;
        z-index: 1 !important;
      }
      [data-liquid]:not(.tab-bar):after,
      .site-header [data-chrome][data-liquid]:after,
      .site-header [data-chrome]:after,
      .top-nav.top-pill:after,
      .top-pill[data-liquid]:after,
      .header-tools[data-liquid]:after,
      .header-tools.glass:after,
      .tab-bar [data-chrome][data-liquid]:after,
      .tab-bar [data-chrome]:after {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        border-radius: inherit !important;
        pointer-events: none !important;
        box-shadow:
          inset 0 0 0 0.5px rgba(255, 255, 255, 0.18),
          inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.38) !important;
        z-index: 1 !important;
      }
      .top-pill[data-liquid] > *,
      .header-tools[data-liquid] > *,
      [data-liquid]:not(.tab-bar) > * {
        position: relative !important;
        z-index: 2 !important;
      }
      .header-tool {
        transition: background-color 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
        border-radius: 9999px !important;
      }
      .header-tool:hover {
        background: rgba(255, 255, 255, 0.14) !important;
        transform: scale(1.05) !important;
      }
      .top-tab {
        transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
        border-radius: 9999px !important;
      }
      .top-tab:hover {
        background: rgba(255, 255, 255, 0.1) !important;
        color: #ffffff !important;
        transform: scale(1.02) !important;
      }

      /* <title-select> & Dropdown Popup Animations */
      .title-select-caret svg,
      .select-caret svg {
        transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .select-popup {
        background: rgba(26, 26, 30, 0.94) !important;
        -webkit-backdrop-filter: blur(28px) saturate(1.8) !important;
        backdrop-filter: blur(28px) saturate(1.8) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 1.25rem !important;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 24px 48px -12px rgba(0, 0, 0, 0.75) !important;
        padding: 0.45rem !important;
        min-width: 15rem !important;
        opacity: 0;
        transform: scale(0.95) translateY(-8px);
        transform-origin: top left;
        transition: opacity 0.19s cubic-bezier(0.4, 0, 1, 1), transform 0.2s cubic-bezier(0.4, 0, 1, 1);
        pointer-events: none;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .select-popup.select-popup-open {
        opacity: 1 !important;
        transform: scale(1) translateY(0) !important;
        pointer-events: auto !important;
        transition: opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .select-option {
        border: none;
        background: transparent;
        border-radius: 0.75rem;
        padding: 0.65rem 0.95rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        width: 100%;
        text-align: left;
        transition: background-color 0.14s ease, color 0.14s ease;
        color: #ffffff;
      }
      .select-option:hover {
        background: rgba(255, 255, 255, 0.08);
      }
      .select-option.select-option-active {
        background: rgba(255, 255, 255, 0.13);
      }
      .select-option-text {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .select-option-title {
        font-weight: 700;
        font-size: 0.95rem;
        color: #ffffff;
        line-height: 1.2;
      }
      .select-option-subtitle {
        font-size: 0.8rem;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.55);
        line-height: 1.2;
      }
      .select-check {
        color: #ffffff;
        flex-shrink: 0;
        margin-left: 1rem;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* View Transitions & Page Transitions */
      ::view-transition { pointer-events: none; }
      ::view-transition-old(.page-fade) { animation: .2s ease-in both vt-fade-out; }
      ::view-transition-new(.page-fade) { animation: .24s ease-out both vt-fade-in; }
      @keyframes vt-hold { 0%, to { opacity: 1; } }
      @keyframes vt-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
      @keyframes vt-fade-out { 0% { opacity: 1; } 100% { opacity: 0; } }

      html:active-view-transition .site-header { view-transition-name: site-header; }
      html:active-view-transition .tab-bar { view-transition-name: tab-bar; }
      ::view-transition-group(site-header) { z-index: 100; animation: none; }
      ::view-transition-group(tab-bar) { z-index: 100; animation: none; }
      ::view-transition-old(site-header), ::view-transition-old(tab-bar) { display: none; }
      ::view-transition-new(site-header), ::view-transition-new(tab-bar) { animation: none; }

      html:active-view-transition .site-header [data-chrome=nav] { view-transition-name: chrome-nav; }
      html:active-view-transition .site-header [data-chrome=tools] { view-transition-name: chrome-tools; }
      html:active-view-transition .tab-bar [data-chrome=tabs] { view-transition-name: chrome-tabs; }

      ::view-transition-group(chrome-nav),
      ::view-transition-group(chrome-tools),
      ::view-transition-group(chrome-tabs) {
        z-index: 101;
        border-radius: calc(999px * var(--corner-scale, 1));
        -webkit-backdrop-filter: var(--frost-chrome);
        backdrop-filter: var(--frost-chrome);
        animation: none;
      }
      ::view-transition-old(chrome-nav), ::view-transition-old(chrome-tools), ::view-transition-old(chrome-tabs) { display: none; }
      ::view-transition-new(chrome-nav), ::view-transition-new(chrome-tools), ::view-transition-new(chrome-tabs) { animation: none; }

      html[data-pending]:after {
        content: "";
        z-index: 200;
        background: var(--color-fg, #ffffff);
        transform-origin: 0;
        pointer-events: none;
        width: 100%;
        height: 2px;
        animation: 3s cubic-bezier(.1, .7, .2, 1) both pending-run;
        position: fixed;
        top: 0;
        left: 0;
      }
      @keyframes pending-run {
        0% { transform: scaleX(0); }
        to { transform: scaleX(.94); }
      }

      /* Hero Transitions */
      .hero-slide {
        position: absolute;
        inset: 0;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.4s ease-out;
        will-change: opacity, transform;
      }
      .hero-slide[data-state=active] {
        opacity: 1;
        visibility: visible;
        z-index: 2;
      }
      .hero-slide[data-state=leaving] {
        opacity: 1;
        visibility: visible;
        z-index: 1;
      }
      .hero-slide[data-state=active][data-animate] {
        animation: .9s both hero-cross;
      }
      @keyframes hero-cross {
        0% { opacity: 0; }
        100% { opacity: 1; }
      }
      .hero[data-paused] { --hero-play: paused; }

      @keyframes set-fade {
        0% { opacity: 0; transform: translateY(-4px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .set-body, .set-pick-list, .popover-panel {
        animation: .16s ease-out both set-fade;
      }
      .set-pick-caret {
        transition: rotate .2s;
      }
      .set-pick[data-open] .set-pick-caret {
        rotate: 180deg;
      }

      main.page-transitioning-out, .watch-root.page-transitioning-out {
        animation: 0.18s cubic-bezier(0.4, 0, 1, 1) both vt-fade-out !important;
      }
      main.page-transitioning-in, .watch-root.page-transitioning-in {
        animation: 0.24s cubic-bezier(0.22, 1, 0.36, 1) both vt-fade-in !important;
      }

      #flicx-nav-progress {
        display: none !important;
      }

      /* Apple TV / tvOS Style Video Player & Upstream CSS Isolation */
      .atv-player video::cue {
        background: rgba(12, 12, 16, 0.72);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Plus Jakarta Sans", system-ui, sans-serif;
        font-size: 1.05em;
        font-weight: 500;
        text-shadow: 0 2px 6px rgba(0, 0, 0, 0.85);
      }
      .fx-player .fx-ui {
        transition: opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1) !important;
      }
      .fx-player .fx-ui .fx-top {
        transition: opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1), transform 0.38s cubic-bezier(0.22, 1, 0.36, 1) !important;
      }
      .fx-player .fx-ui .fx-bottom {
        transition: opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1), transform 0.4s cubic-bezier(0.22, 1, 0.36, 1) !important;
      }
      .fx-player .fx-ui[data-chrome] .fx-top,
      .fx-player .fx-ui[data-chrome] .fx-bottom {
        opacity: 1 !important;
        transform: translate3d(0, 0, 0) !important;
        pointer-events: auto !important;
      }
      .fx-player .fx-ui[data-chrome] .fx-top > *,
      .fx-player .fx-ui[data-chrome] .fx-bottom > * {
        pointer-events: auto !important;
      }
      .fx-player .fx-ui:not([data-chrome]) .fx-top {
        opacity: 0 !important;
        transform: translate3d(0, -10px, 0) !important;
        pointer-events: none !important;
      }
      .fx-player .fx-ui:not([data-chrome]) .fx-bottom {
        opacity: 0 !important;
        transform: translate3d(0, 14px, 0) !important;
        pointer-events: none !important;
      }
      .atv-top {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: calc(1.35rem + env(safe-area-inset-top, 0px)) calc(3rem + env(safe-area-inset-right, 0px)) 1.5rem calc(3rem + env(safe-area-inset-left, 0px)) !important;
        background: linear-gradient(to bottom, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0.22) 60%, transparent 100%) !important;
        position: relative !important;
        top: auto !important;
        left: auto !important;
        right: auto !important;
      }
      .atv-top-circle {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(24, 24, 28, 0.48);
        -webkit-backdrop-filter: blur(22px) saturate(1.6);
        backdrop-filter: blur(22px) saturate(1.6);
        color: rgba(255, 255, 255, 0.94);
        display: grid;
        place-items: center;
        text-decoration: none;
        cursor: pointer;
        transition: background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.18s ease;
      }
      .atv-top-circle:hover {
        background: rgba(255, 255, 255, 0.92);
        color: #111114;
        transform: scale(1.06);
      }
      .atv-top-circle:active {
        transform: scale(0.94);
      }
      .atv-server-btn {
        display: inline-flex !important;
        align-items: center !important;
        gap: 0.4rem !important;
        height: 40px !important;
        padding: 0 0.95rem !important;
        border-radius: 999px !important;
        border: 1px solid rgba(255, 255, 255, 0.14) !important;
        background: rgba(24, 24, 28, 0.48) !important;
        -webkit-backdrop-filter: blur(22px) saturate(1.6) !important;
        backdrop-filter: blur(22px) saturate(1.6) !important;
        color: rgba(255, 255, 255, 0.94) !important;
        font-size: 0.85rem !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.18s ease, transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .atv-server-btn:active {
        transform: scale(0.96);
      }
      .atv-server-btn > .fx-server-name,
      .atv-server-btn > span {
        display: inline !important;
      }
      .atv-server-btn:hover {
        background: rgba(255, 255, 255, 0.18) !important;
      }
      .atv-server-sep {
        opacity: 0.48;
      }
      .atv-server-qual {
        opacity: 0.8;
        font-size: 0.78rem;
        font-weight: 600;
      }
      .atv-status-pill {
        position: absolute;
        top: 1.75rem;
        left: 50%;
        display: inline-flex;
        align-items: center;
        transform: translate3d(-50%, -8px, 0) scale(0.94);
        opacity: 0;
        visibility: hidden;
        padding: 0.5rem 1.05rem;
        border-radius: 999px;
        background: rgba(226, 226, 230, 0.88);
        -webkit-backdrop-filter: blur(28px) saturate(1.8);
        backdrop-filter: blur(28px) saturate(1.8);
        color: #111114;
        font-size: 0.82rem;
        font-weight: 600;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
        z-index: 25;
        pointer-events: none;
        white-space: nowrap;
        transition: opacity 0.2s cubic-bezier(0.4, 0, 1, 1), transform 0.22s cubic-bezier(0.4, 0, 1, 1), visibility 0s linear 0.22s;
      }
      .atv-status-pill.atv-visible {
        opacity: 1;
        visibility: visible;
        transform: translate3d(-50%, 0, 0) scale(1);
        transition: opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s linear 0s;
      }
      .atv-bottom {
        position: relative !important;
        bottom: auto !important;
        left: auto !important;
        right: auto !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 0.75rem !important;
        padding: 3.5rem calc(3rem + env(safe-area-inset-right, 0px)) calc(1.75rem + env(safe-area-inset-bottom, 0px)) calc(3rem + env(safe-area-inset-left, 0px)) !important;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.54) 55%, rgba(0, 0, 0, 0.16) 82%, transparent 100%) !important;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Plus Jakarta Sans", system-ui, sans-serif;
      }
      .atv-header-row {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1.5rem;
        width: 100%;
      }
      .atv-title-block {
        min-width: 0;
        flex: 1;
      }
      .atv-kicker {
        font-size: 0.84rem;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.74);
        margin-bottom: 0.2rem;
        letter-spacing: 0.01em;
      }
      .atv-title {
        margin: 0;
        font-size: clamp(1.7rem, 2.75vw, 2.45rem);
        font-weight: 700;
        line-height: 1.08;
        letter-spacing: -0.025em;
        color: #ffffff;
        text-shadow: 0 2px 16px rgba(0, 0, 0, 0.55);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .atv-actions-wrap {
        position: relative;
        flex: none;
      }
      .atv-actions {
        display: flex;
        align-items: center;
        gap: 0.65rem;
      }
      .atv-icon-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: rgba(255, 255, 255, 0.92);
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: background-color 0.22s cubic-bezier(0.22, 1, 0.36, 1), color 0.18s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s ease;
      }
      .atv-icon-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        color: #ffffff;
        transform: scale(1.06);
      }
      .atv-icon-btn:active {
        transform: scale(0.93);
      }
      .atv-icon-btn.atv-icon-active {
        background: #f2f2f5 !important;
        color: #141418 !important;
        transform: scale(1.07);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
      }
      .atv-icon-btn.atv-icon-connected {
        color: #38bdf8;
      }
      .atv-icon-btn:focus-visible,
      .atv-tab-btn:focus-visible,
      .atv-transport-btn:focus-visible,
      .atv-pop-item:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }

      /* Apple TV Frosted Translucent Popovers (Matches tvOS Subtitles Glass Card) */
      .atv-glass-popover {
        position: absolute !important;
        display: flex !important;
        width: min(260px, calc(100vw - 24px)) !important;
        max-height: min(332px, calc(100dvh - 190px)) !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch;
        padding: 10px 8px !important;
        border-radius: 16px !important;
        background: rgba(216, 214, 208, 0.62) !important;
        -webkit-backdrop-filter: blur(42px) saturate(1.85) !important;
        backdrop-filter: blur(42px) saturate(1.85) !important;
        border: 1px solid rgba(255, 255, 255, 0.3) !important;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55) !important;
        color: #16161a !important;
        flex-direction: column;
        gap: 2px;
        z-index: 40 !important;
        scrollbar-width: thin;
        scrollbar-color: rgba(20, 20, 24, 0.25) transparent;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translate3d(0, 10px, 0) scale(0.95);
        transform-origin: bottom right;
        transition: opacity 0.19s cubic-bezier(0.4, 0, 1, 1), transform 0.21s cubic-bezier(0.4, 0, 1, 1), visibility 0s linear 0.21s;
        will-change: opacity, transform;
      }
      .atv-glass-popover.atv-open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translate3d(0, 0, 0) scale(1);
        transition: opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s linear 0s;
      }
      .atv-popover {
        bottom: calc(100% + 14px);
        right: 0;
        left: auto;
        top: auto;
      }
      #atv-popover-cast {
        max-height: min(440px, calc(100dvh - 130px)) !important;
      }
      .atv-pop-item-danger {
        color: #b91c1c !important;
        font-weight: 600 !important;
      }
      .atv-pop-item-danger:hover {
        background: rgba(185, 28, 28, 0.14) !important;
        color: #991b1b !important;
      }
      .atv-server-popover {
        top: calc(100% + 10px) !important;
        bottom: auto !important;
        right: 0 !important;
        left: auto !important;
        transform-origin: top right;
        transform: translate3d(0, -8px, 0) scale(0.95);
      }
      .atv-server-popover.atv-open {
        transform: translate3d(0, 0, 0) scale(1);
      }
      .atv-pop-heading {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(24, 24, 28, 0.56);
        padding: 4px 12px 6px;
        user-select: none;
      }
      .atv-pop-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .atv-pop-item {
        width: 100%;
        min-height: 36px;
        padding: 8px 12px;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: rgba(18, 18, 22, 0.86);
        font-family: inherit;
        font-size: 13.5px;
        font-weight: 500;
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
        transition: background-color 0.14s ease, transform 0.14s ease, box-shadow 0.14s ease, color 0.14s ease;
      }
      .atv-pop-item:hover {
        background: rgba(255, 255, 255, 0.36);
        color: #0b0b0e;
      }
      .atv-pop-item[aria-checked="true"] {
        background: rgba(255, 255, 255, 0.96) !important;
        color: #0b0b0e !important;
        font-weight: 600 !important;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
        transform: scale(1.015);
      }
      .atv-pop-item-label {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
      }
      .atv-pop-meta {
        font-size: 11px;
        font-weight: 600;
        color: rgba(20, 20, 24, 0.54);
      }
      .atv-pop-check {
        display: inline-flex;
        align-items: center;
        color: #111114;
        flex: none;
      }
      .atv-pop-divider {
        height: 1px;
        background: rgba(20, 20, 24, 0.14);
        margin: 6px 10px;
      }
      .atv-pop-empty {
        padding: 10px 12px;
        font-size: 13px;
        color: rgba(20, 20, 24, 0.64);
      }
      .atv-audio-section {
        padding: 4px 10px 6px;
      }
      .atv-audio-vol-row {
        display: flex;
        align-items: center;
        gap: 0.55rem;
      }
      .atv-pop-mini-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.42);
        color: #111114;
        display: grid;
        place-items: center;
        cursor: pointer;
        flex: none;
      }
      .atv-pop-mini-btn:hover {
        background: rgba(255, 255, 255, 0.78);
      }
      .atv-vol-slider {
        flex: 1;
        height: 4px;
        accent-color: #141418;
        cursor: pointer;
      }
      .atv-vol-pct {
        font-size: 12px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: rgba(18, 18, 22, 0.76);
        min-width: 34px;
        text-align: right;
      }
      .atv-cast-status {
        padding: 2px 12px 8px;
        font-size: 12px;
        line-height: 1.38;
        color: rgba(18, 18, 22, 0.74);
      }

      /* Apple TV Scrubber Bar & Floating Timestamps */
      .atv-scrubber-section {
        width: 100%;
        display: flex;
        flex-direction: column;
      }
      .atv-scrub-wrap {
        position: relative;
        width: 100%;
        height: 22px;
        display: flex;
        align-items: center;
        cursor: pointer;
      }
      .atv-scrub-track {
        position: relative;
        width: 100%;
        height: 7px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.28);
        overflow: visible;
        transition: height 0.2s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s ease;
      }
      .atv-scrub-wrap:hover .atv-scrub-track,
      .atv-scrub-wrap.atv-scrubbing .atv-scrub-track {
        height: 10px;
        background: rgba(255, 255, 255, 0.34);
      }
      .atv-scrub-buffered {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.4);
        border-radius: 999px;
        pointer-events: none;
        transition: width 0.25s ease;
      }
      .atv-scrub-played {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        background: #ffffff;
        border-radius: 999px;
        pointer-events: none;
      }
      .atv-scrub-thumb {
        position: absolute;
        top: 50%;
        width: 3px;
        height: 16px;
        background: #ffffff;
        border-radius: 2px;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 8px rgba(0, 0, 0, 0.55);
        pointer-events: none;
        transition: height 0.18s cubic-bezier(0.22, 1, 0.36, 1), width 0.18s ease;
      }
      .atv-scrub-wrap:hover .atv-scrub-thumb,
      .atv-scrub-wrap.atv-scrubbing .atv-scrub-thumb {
        width: 4px;
        height: 20px;
      }
      .atv-time-row {
        position: relative;
        width: 100%;
        height: 22px;
        margin-top: 6px;
        font-size: 13px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .atv-time-elapsed {
        position: absolute;
        top: 0;
        left: 0;
        color: rgba(255, 255, 255, 0.86);
        white-space: nowrap;
        text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
        pointer-events: none;
      }
      .atv-time-remaining {
        position: absolute;
        top: 0;
        right: 0;
        border: none;
        background: transparent;
        padding: 0;
        font: inherit;
        color: rgba(255, 255, 255, 0.78);
        cursor: pointer;
        text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
      }
      .atv-time-remaining:hover {
        color: #ffffff;
      }

      /* Row 3: Apple TV Info / Chapters Tabs & Subtle Transport */
      .atv-footer-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-top: 2px;
      }
      .atv-tabs {
        display: flex;
        align-items: center;
        gap: 1.75rem;
      }
      .atv-tab-btn {
        border: none;
        background: transparent;
        padding: 4px 0;
        font-family: inherit;
        font-size: 1rem;
        font-weight: 650;
        color: rgba(255, 255, 255, 0.78);
        cursor: pointer;
        position: relative;
        transition: color 0.16s ease;
        text-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
      }
      .atv-tab-btn:hover,
      .atv-tab-btn.atv-tab-active {
        color: #ffffff;
      }
      .atv-tab-btn.atv-tab-active::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: -2px;
        height: 2.5px;
        border-radius: 999px;
        background: #ffffff;
      }
      .atv-transport {
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }
      .atv-transport-btn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: rgba(255, 255, 255, 0.8);
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease, transform 0.14s ease;
      }
      .atv-transport-btn:hover {
        background: rgba(255, 255, 255, 0.16);
        color: #ffffff;
        transform: scale(1.06);
      }
      .atv-transport-btn:active {
        transform: scale(0.92);
      }

      /* Inline Transport Volume Control (Always visible on desktop, mute-only on narrow mobile) */
      .atv-inline-vol {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        margin-left: 0.15rem;
        margin-right: 0.25rem;
      }
      .atv-inline-vol-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 82px;
        height: 4px;
        border-radius: 999px;
        background: linear-gradient(
          to right,
          #ffffff 0%,
          #ffffff var(--vol-pct, 100%),
          rgba(255, 255, 255, 0.28) var(--vol-pct, 100%),
          rgba(255, 255, 255, 0.28) 100%
        );
        outline: none;
        cursor: pointer;
        transition: height 0.15s ease;
      }
      .atv-inline-vol-slider:hover {
        height: 5px;
      }
      .atv-inline-vol-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.55);
        cursor: pointer;
        transition: transform 0.14s ease;
      }
      .atv-inline-vol-slider:hover::-webkit-slider-thumb,
      .atv-inline-vol-slider:active::-webkit-slider-thumb {
        transform: scale(1.22);
      }
      .atv-inline-vol-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border: none;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.55);
        cursor: pointer;
        transition: transform 0.14s ease;
      }
      .atv-inline-vol-slider:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 4px;
      }

      /* Subtitle Popover Tools (OpenSubtitles Search + Local .srt/.vtt Picker) */
      .atv-sub-tools {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 4px 6px 2px;
      }
      .atv-sub-search-row {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .atv-sub-search-input {
        flex: 1;
        min-width: 0;
        height: 32px;
        padding: 0 10px;
        border-radius: 8px;
        border: 1px solid rgba(18, 18, 22, 0.18);
        background: rgba(255, 255, 255, 0.72);
        color: #111114;
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 500;
        outline: none;
      }
      .atv-sub-search-input::placeholder {
        color: rgba(18, 18, 22, 0.52);
      }
      .atv-sub-search-input:focus {
        border-color: rgba(18, 18, 22, 0.52);
        background: rgba(255, 255, 255, 0.94);
      }
      .atv-sub-tool-btn {
        height: 32px;
        padding: 0 10px;
        border-radius: 8px;
        border: none;
        background: #141418;
        color: #ffffff;
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        flex: none;
        transition: opacity 0.15s ease, transform 0.14s ease;
      }
      .atv-sub-tool-btn:hover {
        opacity: 0.88;
      }
      .atv-sub-tool-btn:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .atv-sub-file-btn {
        width: 100%;
        min-height: 34px;
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px dashed rgba(18, 18, 22, 0.28);
        background: rgba(255, 255, 255, 0.34);
        color: #111114;
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 600;
        text-align: center;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }
      .atv-sub-file-btn:hover {
        background: rgba(255, 255, 255, 0.68);
      }

      /* Press-and-Hold 2x Speed Pill */
      .atv-speed-boost-pill {
        position: absolute;
        top: calc(1.75rem + env(safe-area-inset-top, 0px));
        left: 50%;
        transform: translate3d(-50%, -8px, 0) scale(0.94);
        opacity: 0;
        visibility: hidden;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.45rem 0.95rem;
        border-radius: 999px;
        background: rgba(18, 18, 22, 0.78);
        border: 1px solid rgba(255, 255, 255, 0.18);
        -webkit-backdrop-filter: blur(22px) saturate(1.6);
        backdrop-filter: blur(22px) saturate(1.6);
        color: #ffffff;
        font-size: 0.82rem;
        font-weight: 650;
        letter-spacing: 0.01em;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.48);
        z-index: 26;
        pointer-events: none;
        white-space: nowrap;
        transition: opacity 0.18s cubic-bezier(0.4, 0, 1, 1), transform 0.2s cubic-bezier(0.4, 0, 1, 1), visibility 0s linear 0.2s;
      }
      .atv-speed-boost-pill.atv-visible {
        opacity: 1;
        visibility: visible;
        transform: translate3d(-50%, 0, 0) scale(1);
        transition: opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s linear 0s;
      }

      /* Stacked Touch Double-Tap Skip Ripple Zones */
      .atv-seek-ripple {
        position: absolute;
        top: -8%;
        height: 116%;
        width: 40%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.13);
        -webkit-backdrop-filter: blur(6px);
        backdrop-filter: blur(6px);
        pointer-events: none;
        z-index: 9;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.22s ease, visibility 0.22s ease;
      }
      .atv-seek-ripple-left {
        left: 0;
        border-radius: 0 50% 50% 0;
      }
      .atv-seek-ripple-right {
        right: 0;
        border-radius: 50% 0 0 50%;
      }
      .atv-seek-ripple.atv-ripple-active {
        opacity: 1;
        visibility: visible;
        animation: atvRipplePulse 0.42s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .atv-seek-ripple-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.35rem;
        color: #ffffff;
        text-shadow: 0 2px 12px rgba(0, 0, 0, 0.72);
      }
      .atv-seek-chevrons {
        display: inline-flex;
        align-items: center;
        gap: 1px;
      }
      .atv-seek-chevrons svg {
        opacity: 0.35;
      }
      .atv-seek-ripple.atv-ripple-active .atv-seek-chevrons-right svg:nth-child(1) { animation: atvChevFade 0.55s ease 0s infinite; }
      .atv-seek-ripple.atv-ripple-active .atv-seek-chevrons-right svg:nth-child(2) { animation: atvChevFade 0.55s ease 0.11s infinite; }
      .atv-seek-ripple.atv-ripple-active .atv-seek-chevrons-right svg:nth-child(3) { animation: atvChevFade 0.55s ease 0.22s infinite; }
      .atv-seek-ripple.atv-ripple-active .atv-seek-chevrons-left svg:nth-child(3) { animation: atvChevFade 0.55s ease 0s infinite; }
      .atv-seek-ripple.atv-ripple-active .atv-seek-chevrons-left svg:nth-child(2) { animation: atvChevFade 0.55s ease 0.11s infinite; }
      .atv-seek-ripple.atv-ripple-active .atv-seek-chevrons-left svg:nth-child(1) { animation: atvChevFade 0.55s ease 0.22s infinite; }
      .atv-seek-label {
        font-size: 0.95rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }
      @keyframes atvRipplePulse {
        0% { transform: scale(0.92); opacity: 0.45; }
        50% { transform: scale(1); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes atvChevFade {
        0%, 100% { opacity: 0.28; }
        45% { opacity: 1; }
      }

      .atv-skip-intro-btn {
        position: absolute;
        right: calc(2.5rem + env(safe-area-inset-right, 0px));
        bottom: calc(2.5rem + env(safe-area-inset-bottom, 0px));
        display: inline-flex;
        align-items: center;
        gap: 0.42rem;
        height: 40px;
        padding: 0 1rem;
        border-radius: 999px;
        background: rgba(24, 24, 28, 0.48);
        -webkit-backdrop-filter: blur(22px) saturate(1.6);
        backdrop-filter: blur(22px) saturate(1.6);
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: rgba(255, 255, 255, 0.94);
        font-family: inherit;
        font-size: 0.85rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        z-index: 19;
        cursor: pointer;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translate3d(0, 10px, 0) scale(0.96);
        transition: bottom 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s cubic-bezier(0.4, 0, 1, 1), transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.18s ease, visibility 0s linear 0.22s;
      }
      .atv-skip-intro-btn.atv-visible {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translate3d(0, 0, 0) scale(1);
        transition: bottom 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.18s ease, visibility 0s linear 0s;
      }
      .fx-player.atv-chrome-visible .atv-skip-intro-btn {
        bottom: calc(14.25rem + env(safe-area-inset-bottom, 0px));
      }
      .atv-skip-intro-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        color: #ffffff;
      }
      .atv-skip-intro-btn:active {
        transform: scale(0.96);
      }
      .atv-skip-intro-btn:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }
      .fx-player.atv-mode-embed .atv-skip-intro-btn {
        display: none !important;
      }

      /* TV & Anime Up Next Episode Card (Apple TV Glass Preview) */
      .atv-upnext-card {
        position: absolute;
        right: calc(2.5rem + env(safe-area-inset-right, 0px));
        bottom: calc(2.25rem + env(safe-area-inset-bottom, 0px));
        width: min(328px, calc(100vw - 2rem));
        padding: 0;
        background: transparent;
        border: 0;
        box-shadow: none;
        color: #ffffff;
        z-index: 18;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translate3d(0, 14px, 0) scale(0.96);
        transition: bottom 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s cubic-bezier(0.4, 0, 1, 1), transform 0.22s cubic-bezier(0.4, 0, 1, 1), visibility 0s linear 0.22s;
      }
      .atv-upnext-card.atv-visible {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translate3d(0, 0, 0) scale(1);
        transition: bottom 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s linear 0s;
      }
      .fx-player.atv-chrome-visible .atv-upnext-card {
        bottom: calc(14.75rem + env(safe-area-inset-bottom, 0px));
      }
      .atv-upnext-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0 0.15rem 0.5rem;
      }
      .atv-upnext-kicker {
        font-size: 0.92rem;
        font-weight: 650;
        letter-spacing: -0.01em;
        color: rgba(255, 255, 255, 0.96);
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.85);
        font-variant-numeric: tabular-nums;
      }
      .atv-upnext-hide-btn {
        border: 0;
        background: transparent;
        color: rgba(255, 255, 255, 0.68);
        font-family: inherit;
        font-size: 0.88rem;
        font-weight: 550;
        padding: 0.15rem 0.45rem;
        border-radius: 999px;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.85);
        cursor: pointer;
        transition: color 0.16s ease, background-color 0.16s ease;
      }
      .atv-upnext-hide-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.14);
      }
      .atv-upnext-hide-btn:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }
      .atv-upnext-preview {
        position: relative;
        display: block;
        width: 100%;
        aspect-ratio: 16 / 9;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 14px;
        overflow: hidden;
        background: linear-gradient(135deg, rgba(44, 44, 54, 0.9), rgba(18, 18, 24, 0.95));
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.68);
        color: #ffffff;
        text-align: left;
        cursor: pointer;
        transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s ease;
      }
      .atv-upnext-preview:hover {
        border-color: rgba(255, 255, 255, 0.34);
      }
      .atv-upnext-preview:hover .atv-upnext-play-circle {
        transform: translate(-50%, -50%) scale(1.08);
        background: rgba(28, 28, 34, 0.72);
      }
      .atv-upnext-preview:active {
        transform: scale(0.985);
      }
      .atv-upnext-preview:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }
      .atv-upnext-thumb {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .atv-upnext-scrim {
        position: absolute;
        inset: 0;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.84) 0%, rgba(0, 0, 0, 0.22) 48%, rgba(0, 0, 0, 0.08) 100%);
        pointer-events: none;
      }
      .atv-upnext-play-circle {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 58px;
        height: 58px;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        background: rgba(18, 18, 24, 0.54);
        -webkit-backdrop-filter: blur(14px);
        backdrop-filter: blur(14px);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s ease;
        pointer-events: none;
      }
      .atv-upnext-ring-svg {
        position: absolute;
        inset: -1px;
        width: 60px;
        height: 60px;
        transform: rotate(-90deg);
      }
      .atv-upnext-ring-track {
        stroke: rgba(255, 255, 255, 0.24);
      }
      .atv-upnext-ring-fill {
        stroke: #ffffff;
        stroke-linecap: round;
        transition: stroke-dashoffset 0.9s linear;
      }
      .atv-upnext-play-icon {
        position: relative;
        left: 1px;
        color: #ffffff;
        filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45));
      }
      .atv-upnext-overlay-bottom {
        position: absolute;
        left: 0.72rem;
        right: 0.72rem;
        bottom: 0.62rem;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 0.55rem;
        pointer-events: none;
      }
      .atv-upnext-meta {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.08rem;
      }
      .atv-upnext-title {
        font-size: 0.95rem;
        font-weight: 700;
        color: #ffffff;
        line-height: 1.15;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.85);
      }
      .atv-upnext-ep-title {
        font-size: 0.75rem;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.8);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 1px 6px rgba(0, 0, 0, 0.85);
      }
      .atv-upnext-badges {
        display: inline-flex;
        align-items: center;
        gap: 0.28rem;
        flex-shrink: 0;
      }
      .atv-upnext-badge {
        padding: 0.12rem 0.36rem;
        border-radius: 5px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(16, 16, 22, 0.38);
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
        color: rgba(255, 255, 255, 0.68);
        font-size: 0.66rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        line-height: 1.2;
      }

      /* Expandable Info & Chapters Frosted Panels (Smooth Spring Reveal) */
      .atv-glass-panel {
        border-radius: 18px;
        background: rgba(26, 26, 32, 0.72);
        -webkit-backdrop-filter: blur(36px) saturate(1.7);
        backdrop-filter: blur(36px) saturate(1.7);
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 22px 56px rgba(0, 0, 0, 0.55);
        padding: 1.15rem 1.35rem;
        margin-bottom: 0.5rem;
        color: #ffffff;
      }
      .atv-drawer {
        display: block;
        max-height: 0;
        opacity: 0;
        visibility: hidden;
        padding-top: 0;
        padding-bottom: 0;
        margin-bottom: 0;
        border-color: transparent;
        box-shadow: none;
        overflow: hidden;
        pointer-events: none;
        transform: translate3d(0, 12px, 0) scale(0.985);
        transition: max-height 0.26s cubic-bezier(0.4, 0, 1, 1), opacity 0.2s cubic-bezier(0.4, 0, 1, 1), transform 0.24s cubic-bezier(0.4, 0, 1, 1), padding 0.24s cubic-bezier(0.4, 0, 1, 1), margin 0.24s cubic-bezier(0.4, 0, 1, 1), border-color 0.2s ease, box-shadow 0.2s ease, visibility 0s linear 0.26s;
      }
      .atv-drawer.atv-open {
        max-height: 260px;
        opacity: 1;
        visibility: visible;
        padding-top: 1.15rem;
        padding-bottom: 1.15rem;
        margin-bottom: 0.5rem;
        border-color: rgba(255, 255, 255, 0.16);
        box-shadow: 0 22px 56px rgba(0, 0, 0, 0.55);
        pointer-events: auto;
        transform: translate3d(0, 0, 0) scale(1);
        transition: max-height 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1), transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s cubic-bezier(0.22, 1, 0.36, 1), margin 0.3s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.24s ease, box-shadow 0.24s ease, visibility 0s linear 0s;
      }
      .atv-info-grid {
        display: flex;
        align-items: flex-start;
        gap: 1.15rem;
      }
      .atv-info-poster {
        width: 68px;
        height: 102px;
        border-radius: 10px;
        object-fit: cover;
        flex: none;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
      }
      .atv-info-body {
        min-width: 0;
        flex: 1;
      }
      .atv-info-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.65rem;
        margin-bottom: 0.45rem;
      }
      .atv-info-heading {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 700;
        color: #ffffff;
      }
      .atv-info-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        column-gap: 0.45rem;
        row-gap: 0.2rem;
        font-size: 0.84rem;
        color: rgba(255, 255, 255, 0.72);
      }
      .atv-info-synopsis {
        margin: 0;
        font-size: 0.9rem;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.86);
        max-width: 68ch;
      }
      .atv-chapters-strip {
        display: flex;
        align-items: stretch;
        gap: 0.65rem;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 4px;
      }
      .atv-chapter-card {
        flex: 0 0 156px;
        padding: 0.75rem 0.9rem;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        text-align: left;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        transition: background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.18s ease;
      }
      .atv-chapter-card:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: translateY(-2px);
      }
      .atv-chapter-card:active {
        transform: scale(0.97);
      }
      .atv-chapter-card.atv-chapter-active {
        background: rgba(255, 255, 255, 0.94);
        color: #111114;
        border-color: transparent;
      }
      .atv-chapter-num {
        font-size: 11px;
        font-weight: 600;
        opacity: 0.65;
      }
      .atv-chapter-name {
        font-size: 14px;
        font-weight: 650;
      }
      .atv-chapter-time {
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        opacity: 0.72;
        margin-top: auto;
      }

      .fx-player .kaira-center-play {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.84);
        opacity: 0;
        visibility: hidden;
        width: 4.75rem;
        height: 4.75rem;
        padding: 0;
        margin: 0;
        border-radius: 50%;
        border: none;
        outline: none;
        background: rgba(212, 212, 218, 0.34);
        -webkit-backdrop-filter: blur(28px) saturate(1.7);
        backdrop-filter: blur(28px) saturate(1.7);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 0;
        cursor: pointer;
        pointer-events: none;
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55);
        transition: transform 0.22s cubic-bezier(0.4, 0, 1, 1), opacity 0.2s ease, background-color 0.18s ease, color 0.18s ease, visibility 0s linear 0.22s;
        z-index: 6;
      }
      .fx-player .kaira-center-play.atv-visible {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translate(-50%, -50%) scale(1);
        transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease, background-color 0.18s ease, color 0.18s ease, visibility 0s linear 0s;
      }
      .fx-player .kaira-center-play.atv-visible:hover {
        transform: translate(-50%, -50%) scale(1.08);
        background: rgba(255, 255, 255, 0.92);
        color: #111114;
      }
      .fx-player .kaira-center-play.atv-visible:active {
        transform: translate(-50%, -50%) scale(0.95);
      }

      /* Apple TV Custom Subtitle Cue Overlay (VTT & SRT) */
      .atv-subtitle-cue {
        position: absolute;
        left: 50%;
        bottom: calc(2.75rem + env(safe-area-inset-bottom, 0px));
        transform: translate3d(-50%, 0, 0);
        will-change: transform, opacity;
        z-index: 20;
        max-width: min(86vw, 48rem);
        padding: 0.42rem 0.9rem;
        border-radius: 10px;
        background: rgba(10, 10, 14, 0.84);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
        font-size: clamp(1rem, 2.2vw, 1.55rem);
        font-weight: 600;
        line-height: 1.38;
        text-align: center;
        white-space: pre-line;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transition: bottom 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease, visibility 0.16s ease;
      }
      .atv-subtitle-cue.atv-cue-visible {
        opacity: 1;
        visibility: visible;
      }
      .fx-player.atv-chrome-visible .atv-subtitle-cue {
        bottom: calc(11.5rem + env(safe-area-inset-bottom, 0px));
      }
      @media (max-width: 600px) {
        .fx-player.atv-chrome-visible .atv-subtitle-cue {
          bottom: calc(13.5rem + env(safe-area-inset-bottom, 0px));
        }
      }

      /* Embed Fallback Mode (GitHub Pages universal playback): keep top Back/Server/Cast/Fullscreen bar interactive while passing clicks through to embed player */
      .atv-top-cast-btn {
        display: none;
      }
      .fx-player.atv-mode-embed .atv-top-cast-btn {
        display: inline-flex;
      }
      .atv-cast-banner {
        position: absolute;
        inset: 0;
        z-index: 6;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 2rem;
        background: radial-gradient(circle at center, rgba(24, 24, 32, 0.88) 0%, rgba(5, 5, 8, 0.96) 100%);
        color: #ffffff;
        text-align: center;
      }
      .atv-cast-banner.atv-cast-active {
        display: flex;
      }
      .atv-cast-banner-icon {
        width: 4rem;
        height: 4rem;
        border-radius: 50%;
        background: rgba(10, 132, 255, 0.18);
        border: 1px solid rgba(10, 132, 255, 0.45);
        color: #64b5ff;
        display: grid;
        place-items: center;
      }
      .atv-cast-banner-label {
        font-size: 0.85rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64b5ff;
        font-weight: 600;
      }
      .atv-cast-banner-title {
        font-size: clamp(1.25rem, 2.8vw, 1.85rem);
        font-weight: 700;
      }
      .atv-cast-banner-actions {
        display: flex;
        gap: 0.75rem;
        margin-top: 0.5rem;
      }
      .atv-cast-banner-btn {
        padding: 0.6rem 1.2rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: rgba(255, 255, 255, 0.14);
        color: #ffffff;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.18s ease, transform 0.15s ease;
      }
      .atv-cast-banner-btn:hover {
        background: rgba(255, 255, 255, 0.24);
      }
      .atv-cast-banner-stop {
        border-color: rgba(255, 105, 97, 0.45);
        background: rgba(255, 69, 58, 0.2);
        color: #ff9a94;
      }
      .atv-cast-banner-stop:hover {
        background: rgba(255, 69, 58, 0.34);
      }
      .fx-player.atv-casting-active #fx-center-play,
      .fx-player.atv-casting-active .kaira-center-play,
      .fx-player.atv-casting-active .fx-buffering,
      .fx-player.atv-casting-active .atv-subtitle-cue {
        display: none !important;
      }
      .fx-player.atv-mode-embed .fx-bottom,
      .fx-player.atv-mode-embed .kaira-center-play,
      .fx-player.atv-mode-embed .atv-subtitle-cue,
      .fx-player.atv-mode-embed .atv-seek-ripple,
      .fx-player.atv-mode-embed .atv-speed-boost-pill,
      .fx-player.atv-mode-embed .atv-upnext-card {
        display: none !important;
      }
      .fx-player.atv-mode-embed .fx-ui {
        pointer-events: none !important;
        opacity: 1 !important;
      }
      .fx-player.atv-mode-embed .fx-top {
        background: linear-gradient(180deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0) 100%) !important;
        padding-bottom: 1.75rem !important;
      }

      /* Smooth Open & Close Modal Transitions (Settings & Trailer Modals) */
      #flicx-settings-backdrop.set-backdrop {
        background: rgba(0, 0, 0, 0.45);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s cubic-bezier(0.4, 0, 1, 1);
      }
      #flicx-settings-backdrop.set-backdrop.set-open {
        opacity: 1;
        pointer-events: auto;
        transition: opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1);
      }
      #flicx-settings-dialog.set-dialog {
        opacity: 0;
        transform: translate3d(0, 12px, 0) scale(0.96);
        pointer-events: none;
        transition: opacity 0.2s cubic-bezier(0.4, 0, 1, 1), transform 0.22s cubic-bezier(0.4, 0, 1, 1) !important;
        will-change: opacity, transform;
      }
      #flicx-settings-dialog.set-dialog.set-open {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
        pointer-events: auto;
        transition: opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }

      .kaira-trailer-modal {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.85);
        -webkit-backdrop-filter: blur(16px);
        backdrop-filter: blur(16px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s cubic-bezier(0.4, 0, 1, 1);
      }
      .kaira-trailer-modal.kaira-modal-open {
        opacity: 1;
        pointer-events: auto;
        transition: opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .kaira-trailer-box {
        position: relative;
        width: 100%;
        max-width: 960px;
        aspect-ratio: 16 / 9;
        background: #000;
        border-radius: 1rem;
        overflow: hidden;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1);
        opacity: 0;
        transform: translate3d(0, 14px, 0) scale(0.94);
        transition: opacity 0.2s cubic-bezier(0.4, 0, 1, 1), transform 0.22s cubic-bezier(0.4, 0, 1, 1);
        will-change: opacity, transform;
      }
      .kaira-trailer-modal.kaira-modal-open .kaira-trailer-box {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
        transition: opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .kaira-trailer-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        z-index: 10;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(0, 0, 0, 0.65);
        color: #ffffff;
        cursor: pointer;
        display: grid;
        place-items: center;
        font-size: 1.5rem;
        line-height: 1;
        transition: background-color 0.18s ease, transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .kaira-trailer-close:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: scale(1.06);
      }
      .kaira-trailer-close:active {
        transform: scale(0.94);
      }
      .kaira-trailer-iframe {
        width: 100%;
        height: 100%;
        border: none;
      }

      /* Responsive Notifications Popover (Never clips off-screen on mobile) */
      #flicx-notes-popover.notes-popup {
        box-sizing: border-box !important;
        max-width: calc(100vw - 24px) !important;
        opacity: 0;
        pointer-events: none;
        transform: translate3d(0, -8px, 0) scale(0.96);
        transform-origin: top right;
        transition: opacity 0.19s cubic-bezier(0.4, 0, 1, 1), transform 0.2s cubic-bezier(0.4, 0, 1, 1);
        will-change: opacity, transform;
      }
      #flicx-notes-popover.notes-popup.notes-open {
        opacity: 1;
        pointer-events: auto;
        transform: translate3d(0, 0, 0) scale(1);
        transition: opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1), transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #flicx-notes-popover .notes-panel {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      /* Mobile & Tablet Responsive Layout (App-Wide + Apple TV Player) */
      @media (max-width: 1023px) {
        main {
          padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
        }
        .tab-bar a {
          min-height: 44px;
          min-width: 44px;
        }
        .search-tabs,
        .search-tabs .segmented {
          max-width: 100%;
          overflow-x: auto;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .search-tabs .segmented::-webkit-scrollbar {
          display: none;
        }
        .set-dialog {
          padding: 12px !important;
        }
        #flicx-settings-dialog.set-dialog {
          transform: translate3d(0, 28px, 0) scale(0.985);
        }
        #flicx-settings-dialog.set-dialog.set-open {
          transform: translate3d(0, 0, 0) scale(1);
        }
        .set-window {
          width: min(560px, calc(100vw - 24px)) !important;
          max-height: calc(100dvh - 32px) !important;
        }
        .set-close,
        .set-back {
          min-width: 44px;
          min-height: 44px;
        }
        .atv-top {
          padding: calc(1rem + env(safe-area-inset-top, 0px)) calc(1.75rem + env(safe-area-inset-right, 0px)) 1rem calc(1.75rem + env(safe-area-inset-left, 0px)) !important;
        }
        .atv-bottom {
          padding: 2.5rem calc(1.75rem + env(safe-area-inset-right, 0px)) calc(1.5rem + env(safe-area-inset-bottom, 0px)) calc(1.75rem + env(safe-area-inset-left, 0px)) !important;
        }
        .atv-top-circle,
        .atv-icon-btn,
        .atv-transport-btn {
          width: 44px;
          height: 44px;
        }
        .atv-tab-btn {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
        }
        .atv-pop-item {
          min-height: 42px;
        }
        .atv-scrub-wrap {
          height: 30px;
          touch-action: none;
        }
      }

      /* Narrow Portrait Mobile (360px - 600px) */
      @media (max-width: 600px) {
        .atv-top {
          padding: calc(0.85rem + env(safe-area-inset-top, 0px)) calc(1rem + env(safe-area-inset-right, 0px)) 0.75rem calc(1rem + env(safe-area-inset-left, 0px)) !important;
        }
        .atv-bottom {
          padding: 1.75rem calc(1rem + env(safe-area-inset-right, 0px)) calc(1.15rem + env(safe-area-inset-bottom, 0px)) calc(1rem + env(safe-area-inset-left, 0px)) !important;
          gap: 0.55rem !important;
        }
        .atv-header-row {
          position: relative;
          flex-direction: column;
          align-items: stretch;
          gap: 0.5rem;
        }
        .atv-title {
          font-size: 1.45rem;
          white-space: normal;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .atv-actions-wrap {
          position: static;
          align-self: flex-end;
        }
        .atv-popover {
          bottom: calc(100% + 12px);
          right: 0;
        }
        .atv-actions {
          gap: 0.35rem;
        }
        .atv-tabs {
          gap: 1.1rem;
        }
        .atv-transport {
          gap: 0.1rem;
        }
        .atv-inline-vol {
          margin-left: 0;
          margin-right: 0;
        }
        .atv-inline-vol-slider {
          display: none;
        }
        .atv-upnext-card {
          right: calc(1rem + env(safe-area-inset-right, 0px));
          width: calc(100vw - 2rem);
        }
        .fx-player.atv-chrome-visible .atv-upnext-card {
          bottom: calc(16.25rem + env(safe-area-inset-bottom, 0px));
        }
        .atv-glass-panel.atv-open {
          padding: 0.9rem 1rem;
        }
        .atv-info-grid {
          gap: 0.85rem;
        }
        .atv-info-poster {
          width: 56px;
          height: 84px;
        }
        .atv-info-synopsis {
          font-size: 0.84rem;
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .search-people {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        }
      }

      /* Landscape Phone & Short Viewport (e.g. 844x390, 667x375) */
      @media (max-height: 520px) {
        .atv-top {
          padding: calc(0.55rem + env(safe-area-inset-top, 0px)) calc(1.5rem + env(safe-area-inset-right, 0px)) 0.5rem calc(1.5rem + env(safe-area-inset-left, 0px)) !important;
        }
        .atv-bottom {
          padding: 1.15rem calc(1.5rem + env(safe-area-inset-right, 0px)) calc(0.65rem + env(safe-area-inset-bottom, 0px)) calc(1.5rem + env(safe-area-inset-left, 0px)) !important;
          gap: 0.35rem !important;
        }
        .atv-header-row {
          flex-direction: row !important;
          align-items: flex-end !important;
          gap: 1rem !important;
        }
        .atv-title {
          font-size: 1.3rem !important;
          white-space: nowrap !important;
        }
        .atv-actions-wrap {
          position: relative !important;
          align-self: auto !important;
        }
        .atv-icon-btn,
        .atv-top-circle,
        .atv-transport-btn {
          width: 40px !important;
          height: 40px !important;
        }
        .atv-tab-btn {
          min-height: 36px !important;
          font-size: 0.92rem !important;
        }
        .atv-glass-popover {
          max-height: min(172px, calc(100dvh - 200px)) !important;
          padding: 8px 6px !important;
        }
        .atv-popover {
          bottom: calc(100% + 8px) !important;
        }
        .atv-server-popover {
          max-height: min(210px, calc(100dvh - 96px)) !important;
        }
        .atv-drawer.atv-open {
          max-height: calc(100dvh - 150px);
          overflow-y: auto;
          padding: 0.75rem 1rem;
          margin-bottom: 0.25rem;
        }
        .atv-info-poster {
          width: 48px;
          height: 72px;
        }
        .atv-pop-item {
          min-height: 34px !important;
          padding: 6px 10px !important;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .atv-seek-ripple.atv-ripple-active,
        .atv-seek-ripple.atv-ripple-active .atv-seek-chevrons svg {
          animation: none !important;
        }
        .atv-speed-boost-pill,
        .atv-upnext-card,
        .atv-seek-ripple {
          transition: opacity 0.12s ease !important;
        }
      }

      /* Continue Watching Rail, Cards, Detail CTA & Player Resume Pill */
      .continue-outline {
        display: none !important;
      }
      .kaira-cw-section .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      .kaira-cw-clear-all {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.56);
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        padding: 0.35rem 0.65rem;
        border-radius: 999px;
        transition: color 0.18s ease, background-color 0.18s ease;
      }
      .kaira-cw-clear-all:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
      }
      .kaira-cw-card .kaira-cw-overlay {
        position: absolute;
        inset-inline: 0;
        bottom: 0;
        z-index: 3;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 2.25rem 0.7rem 0.65rem;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.72) 52%, rgba(0, 0, 0, 0.92) 100%);
        pointer-events: none;
      }
      .kaira-cw-title {
        color: #ffffff;
        font-size: 0.84rem;
        font-weight: 600;
        line-height: 1.25;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
      }
      .kaira-cw-meta {
        color: rgba(255, 255, 255, 0.76);
        font-size: 0.72rem;
        font-weight: 500;
        letter-spacing: 0.01em;
      }
      .kaira-cw-track {
        display: block;
        width: 100%;
        height: 3.5px;
        margin-top: 0.2rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.24);
        overflow: hidden;
      }
      .kaira-cw-fill {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--color-flare, #f59e0b);
        box-shadow: 0 0 8px rgba(245, 158, 11, 0.55);
      }
      .kaira-cw-track-embed .kaira-cw-fill {
        background: rgba(255, 255, 255, 0.58);
        box-shadow: none;
      }
      .kaira-cw-play-badge {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -56%) scale(0.92);
        z-index: 3;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(18, 18, 22, 0.72);
        border: 1px solid rgba(255, 255, 255, 0.28);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        color: #ffffff;
        display: grid;
        place-items: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .kaira-cw-card:hover .kaira-cw-play-badge,
      .kaira-cw-card:focus-within .kaira-cw-play-badge {
        opacity: 1;
        transform: translate(-50%, -56%) scale(1);
      }
      .kaira-cw-remove {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        z-index: 5;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.26);
        background: rgba(14, 14, 18, 0.72);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: rgba(255, 255, 255, 0.9);
        display: grid;
        place-items: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.18s ease, background-color 0.18s ease, transform 0.15s ease;
      }
      .kaira-cw-card:hover .kaira-cw-remove,
      .kaira-cw-card:focus-within .kaira-cw-remove,
      .kaira-cw-remove:focus-visible {
        opacity: 1;
      }
      @media (hover: none) {
        .kaira-cw-remove {
          opacity: 0.9;
        }
      }
      .kaira-cw-remove:hover {
        background: rgba(220, 38, 38, 0.85);
        border-color: rgba(255, 255, 255, 0.45);
        color: #ffffff;
        transform: scale(1.06);
      }
      .capsule-btn-play.kaira-btn-continue {
        position: relative;
        overflow: hidden;
      }
      .capsule-btn-play.kaira-btn-continue::after {
        content: "";
        position: absolute;
        left: 0;
        bottom: 0;
        height: 3px;
        width: var(--cw-pct, 0%);
        background: var(--color-flare, #f59e0b);
        pointer-events: none;
      }
      .kaira-continue-meta {
        font-size: 0.8em;
        opacity: 0.78;
        font-weight: 500;
        margin-left: 0.15rem;
      }
      .atv-resume-pill {
        position: absolute;
        top: calc(4.8rem + env(safe-area-inset-top, 0px));
        left: 50%;
        transform: translate(-50%, -8px);
        z-index: 25;
        display: inline-flex;
        align-items: center;
        gap: 0.65rem;
        padding: 0.45rem 0.55rem 0.45rem 0.95rem;
        border-radius: 999px;
        background: rgba(22, 22, 28, 0.78);
        border: 1px solid rgba(255, 255, 255, 0.22);
        backdrop-filter: blur(22px) saturate(1.6);
        -webkit-backdrop-filter: blur(22px) saturate(1.6);
        color: #ffffff;
        font-size: 0.84rem;
        font-weight: 500;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.2s cubic-bezier(0.4, 0, 1, 1), transform 0.22s cubic-bezier(0.4, 0, 1, 1), visibility 0s linear 0.22s;
      }
      .atv-resume-pill.atv-visible {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translate(-50%, 0);
        transition: opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1), transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s linear 0s;
      }
      .atv-resume-restart-btn {
        border: none;
        border-radius: 999px;
        padding: 0.32rem 0.72rem;
        background: rgba(255, 255, 255, 0.18);
        color: #ffffff;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.16s ease;
      }
      .atv-resume-restart-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      /* Smooth Continue Watching Card & Section Close Transitions */
      .kaira-cw-section {
        transition: opacity 0.22s cubic-bezier(0.4, 0, 1, 1), transform 0.24s cubic-bezier(0.4, 0, 1, 1);
      }
      .kaira-cw-section.kaira-cw-section-closing {
        opacity: 0;
        transform: translate3d(0, -10px, 0);
        pointer-events: none;
      }
      .kaira-cw-section [role="listitem"] {
        transition: opacity 0.2s cubic-bezier(0.4, 0, 1, 1), transform 0.22s cubic-bezier(0.4, 0, 1, 1);
      }
      .kaira-cw-section [role="listitem"].kaira-cw-removing {
        opacity: 0;
        transform: scale(0.86);
        pointer-events: none;
      }

      html[data-motion="reduce"] .fx-player .fx-ui,
      html[data-motion="reduce"] .fx-player .fx-ui .fx-top,
      html[data-motion="reduce"] .fx-player .fx-ui .fx-bottom,
      html[data-motion="reduce"] .atv-glass-popover,
      html[data-motion="reduce"] .atv-drawer,
      html[data-motion="reduce"] .atv-status-pill,
      html[data-motion="reduce"] .atv-resume-pill,
      html[data-motion="reduce"] .atv-upnext-card,
      html[data-motion="reduce"] .atv-speed-boost-pill,
      html[data-motion="reduce"] .fx-player .kaira-center-play,
      html[data-motion="reduce"] #flicx-notes-popover.notes-popup,
      html[data-motion="reduce"] #flicx-settings-dialog.set-dialog,
      html[data-motion="reduce"] #flicx-settings-backdrop.set-backdrop,
      html[data-motion="reduce"] .kaira-trailer-modal,
      html[data-motion="reduce"] .kaira-trailer-box,
      html[data-motion="reduce"] .select-popup,
      html[data-motion="reduce"] .kaira-cw-section,
      html[data-motion="reduce"] .kaira-cw-section [role="listitem"] {
        transition-duration: 0.01ms !important;
        transition-delay: 0s !important;
      }

      @media (prefers-reduced-motion: reduce) {
        .fx-player .fx-ui,
        .fx-player .fx-ui .fx-top,
        .fx-player .fx-ui .fx-bottom,
        .atv-glass-popover,
        .atv-drawer,
        .atv-status-pill,
        .atv-resume-pill,
        .atv-upnext-card,
        .atv-speed-boost-pill,
        .fx-player .kaira-center-play,
        #flicx-notes-popover.notes-popup,
        #flicx-settings-dialog.set-dialog,
        #flicx-settings-backdrop.set-backdrop,
        .kaira-trailer-modal,
        .kaira-trailer-box,
        .select-popup,
        .kaira-cw-section,
        .kaira-cw-section [role="listitem"] {
          transition-duration: 0.01ms !important;
          transition-delay: 0s !important;
        }
      }

      /* Dynamic detail page fallback styling (for uncached/rewritten /movie/* & /tv/* routes) */
      .kaira-dyn-detail .kaira-dyn-title {
        font-size: clamp(2.1rem, 4.6vw, 4rem);
        line-height: 1.04;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: #fff;
        text-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
        margin: 0;
      }
      .kaira-dyn-detail .kaira-dyn-logo {
        display: block;
        max-height: clamp(3.5rem, 12vh, 6.75rem);
        max-width: min(76vw, 27rem);
        width: auto;
        height: auto;
        object-fit: contain;
        object-position: left bottom;
        filter: drop-shadow(0 8px 28px rgba(0, 0, 0, 0.6));
      }
      @media (max-width: 767px) {
        .kaira-dyn-detail .kaira-dyn-logo {
          margin-inline: auto;
          object-position: center bottom;
        }
      }
      .kaira-dyn-detail .kaira-dyn-backdrop {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center 22%;
        transition: opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .kaira-dyn-detail .kaira-dyn-poster-blur {
        filter: blur(22px) saturate(1.15) brightness(0.68);
        transform: scale(1.12);
      }
      .kaira-dyn-cast-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.625rem;
      }
      .kaira-dyn-cast-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.95rem;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: rgba(255, 255, 255, 0.92);
        font-size: 0.9rem;
        font-weight: 500;
        text-decoration: none;
        transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
      }
      .kaira-dyn-cast-chip:hover {
        background: rgba(255, 255, 255, 0.14);
        border-color: rgba(255, 255, 255, 0.24);
        transform: translateY(-1px);
      }
    `;
    document.head.appendChild(style);
  }

  // --- 13. Ultra-Smooth Page Transitions & Client-Side Navigation ---
  const pageCache = new Map();
  const clickedCardMetaMap = new Map();
  let isNavigating = false;
  let currentRenderedPath = window.location.pathname + window.location.search;
  let dynHydrateSeq = 0;

  function parseDetailRoute(rawPath) {
    const norm = normalizeRoutePath(rawPath);
    const m = norm.match(/^\/(movie|tv)\/([^/?#]+)$/);
    if (!m) return null;
    let slug = m[2];
    try { slug = decodeURIComponent(slug); } catch {}
    slug = slug.replace(/^\/+|\/+$/g, '');
    if (!slug) return null;
    return { folder: m[1], kind: m[1] === 'tv' ? 'show' : 'movie', slug };
  }

  function isValidDetailHtmlString(html) {
    if (!html || typeof html !== 'string') return false;
    if (html.includes('id="__next_error__"')) return false;
    if (html.includes('hero-switch')) return false;
    return /<article[\s>]/i.test(html);
  }

  function isValidDetailDoc(doc) {
    if (!doc) return false;
    if (doc.getElementById('__next_error__')) return false;
    if (doc.querySelector('main .hero-switch, main .hero-switch-bars')) return false;
    return Boolean(doc.querySelector('main article'));
  }

  function formatSlugToTitle(slug) {
    const clean = String(slug || '').replace(/-\d{4}$/, '');
    if (!clean) return 'Untitled';
    const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs']);
    return clean
      .split('-')
      .filter(Boolean)
      .map((w, i) => (i > 0 && smallWords.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
  }

  function stashCardMetaFromElement(el, rawHref) {
    const dyn = parseDynamicRoute(rawHref);
    if (!dyn || (dyn.type !== 'detail' && dyn.type !== 'anime') || !el) return;
    const card = el.closest('.card, .card-over, .card-action, .hero-copy, .hero, article') || el;
    const title =
      card.querySelector('.card-over-title')?.textContent?.trim() ||
      card.querySelector('.card-fallback')?.textContent?.trim() ||
      card.querySelector('h1, h2, h3')?.textContent?.trim() ||
      el.getAttribute('aria-label')?.replace(/\s*\(\d{4}\).*$/, '').trim() ||
      (dyn.type === 'anime' ? `Anime #${dyn.id}` : formatSlugToTitle(dyn.slug));
    const year =
      card.querySelector('.card-over-year')?.textContent?.trim() ||
      (dyn.slug.match(/-(\d{4})$/)?.[1] || '');
    const rating =
      card.querySelector('.card-over-score')?.textContent?.trim()?.replace(/[^\d.]/g, '') || '';
    const genre =
      card.querySelector('.card-over-genre')?.textContent?.trim() || '';
    const imgEl = card.querySelector('.card-pic img, img[src*="/a/poster/"], img');
    const posterSrc = imgEl?.getAttribute('src') || '';
    const imdbId =
      posterSrc.match(/\/(tt\d+)\//)?.[1] ||
      card.querySelector('[data-title-id]')?.getAttribute('data-title-id') ||
      '';
    const tone = card.style?.getPropertyValue('--tone')?.trim() || '#1c1d22';

    clickedCardMetaMap.set(dyn.slug, {
      slug: dyn.slug,
      kind: dyn.type === 'anime' ? 'anime' : dyn.kind,
      title,
      year,
      rating,
      genres: genre ? [genre] : [],
      poster: posterSrc,
      imdbId,
      tone
    });
    if (clickedCardMetaMap.size > 40) {
      const oldest = clickedCardMetaMap.keys().next().value;
      clickedCardMetaMap.delete(oldest);
    }
  }

  function buildRatingStarSvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="size-[1.625rem]"><path d="M239.18,97.26A16.38,16.38,0,0,0,224.92,86l-59-4.76L143.14,26.15a16.36,16.36,0,0,0-30.27,0L90.11,81.23,31.08,86a16.46,16.46,0,0,0-9.37,28.86l45,38.83L53,211.75a16.38,16.38,0,0,0,24.5,17.82L128,198.49l50.53,31.08A16.4,16.4,0,0,0,203,211.75l-13.76-58.07,45-38.83A16.43,16.43,0,0,0,239.18,97.26Zm-15.34,5.47-48.7,42a8,8,0,0,0-2.56,7.91l14.88,62.8a.37.37,0,0,1-.17.48c-.18.14-.23.11-.38,0l-54.72-33.65a8,8,0,0,0-8.38,0L69.09,215.94c-.15.09-.19.12-.38,0a.37.37,0,0,1-.17-.48l14.88-62.8a8,8,0,0,0-2.56-7.91l-48.7-42c-.12-.1-.23-.19-.13-.5s.18-.27.33-.29l63.92-5.16A8,8,0,0,0,103,91.86l24.62-59.61c.08-.17.11-.25.35-.25s.27.08.35.25L153,91.86a8,8,0,0,0,6.75,4.92l63.92,5.16c.15,0,.24,0,.33.29S224,102.63,223.84,102.73Z"></path></svg>';
  }

  function renderDynFactsItemsHtml(meta) {
    const items = [];
    if (meta.rating) {
      items.push(`<li class="fact text-fg"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="fact-icon mt-[0.058em] text-star"><path d="M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z"></path></svg><span>${escapeHtml(meta.rating)}</span><span class="sr-only">out of 10</span></li>`);
    }
    if (meta.year) {
      items.push(`<li class="fact"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="fact-icon"><path d="M208,28H188V24a12,12,0,0,0-24,0v4H92V24a12,12,0,0,0-24,0v4H48A20,20,0,0,0,28,48V208a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V48A20,20,0,0,0,208,28ZM68,52a12,12,0,0,0,24,0h72a12,12,0,0,0,24,0h16V76H52V52ZM52,204V100H204V204Z"></path></svg>${escapeHtml(meta.year)}</li>`);
    }
    if (meta.runtime) {
      items.push(`<li class="fact"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="fact-icon"><path d="M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm0,192a84,84,0,1,1,84-84A84.09,84.09,0,0,1,128,212Zm68-84a12,12,0,0,1-12,12H128a12,12,0,0,1-12-12V72a12,12,0,0,1,24,0v44h44A12,12,0,0,1,196,128Z"></path></svg>${escapeHtml(meta.runtime)}</li>`);
    }
    const genres = Array.isArray(meta.genres) ? meta.genres.filter(Boolean).slice(0, 3) : [];
    if (genres.length) {
      const genreLinks = genres.map((g, i) => {
        const gSlug = String(g).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return `<span class="flex items-center gap-2">${i > 0 ? '<span aria-hidden="true" class="size-[3px] rounded-full bg-fg-faint"></span>' : ''}<a class="fact-link" href="${withBasePath(`/genres/${encodeURIComponent(gSlug)}`)}">${escapeHtml(g)}</a></span>`;
      }).join('');
      items.push(`<li class="fact"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="fact-icon mt-[0.016em]"><path d="M246.15,133.18,146.83,33.86A19.85,19.85,0,0,0,132.69,28H40A12,12,0,0,0,28,40v92.69a19.85,19.85,0,0,0,5.86,14.14l99.32,99.32a20,20,0,0,0,28.28,0l84.69-84.69A20,20,0,0,0,246.15,133.18Zm-98.83,93.17L52,131V52h79l95.32,95.32ZM104,88A16,16,0,1,1,88,72,16,16,0,0,1,104,88Z"></path></svg><span class="flex items-center gap-2">${genreLinks}</span></li>`);
    }
    return items.join('');
  }

  function buildDynamicDetailDocument(slug, kind, hint) {
    const isShow = kind === 'show' || kind === 'tv';
    const title = hint?.title || formatSlugToTitle(slug);
    const year = hint?.year || (slug.match(/-(\d{4})$/)?.[1] || '');
    const rating = hint?.rating || '';
    const genres = Array.isArray(hint?.genres) ? hint.genres : [];
    const tone = hint?.tone || '#1a1b20';
    const imdbId = hint?.imdbId || '';
    const initialBackdrop = hint?.still || (imdbId ? `https://images.metahub.space/background/medium/${imdbId}/img` : '') || hint?.poster || '';
    const isPosterFallback = !hint?.still && !imdbId && Boolean(hint?.poster);
    const watchHref = withBasePath(isShow ? `/watch/${encodeURIComponent(slug)}/s1e1` : `/watch/${encodeURIComponent(slug)}`);
    const rateId = imdbId ? `rate-${imdbId}` : `rate-${slug}`;
    const numRating = parseFloat(rating);
    const circumference = 392.699;
    const dashOffset = Number.isFinite(numRating) && numRating > 0 ? Math.max(0, circumference * (1 - Math.min(10, numRating) / 10)) : circumference;

    const factsHtml = renderDynFactsItemsHtml({ rating, year, genres, runtime: '' });
    const starSvg = buildRatingStarSvg();
    const starLabels = ['1 of 5: Not for me', '2 of 5: Weak', '3 of 5: Good', '4 of 5: Great', '5 of 5: A favourite'];
    const starsHtml = starLabels.map(lbl => `<button type="button" role="radio" aria-checked="false" aria-label="${lbl}">${starSvg}</button>`).join('');

    const html = `<!DOCTYPE html><html lang="en"><head><title>${escapeHtml(title)}${year ? ` (${escapeHtml(year)})` : ''} · Kaira</title></head><body><main id="main" tabindex="-1" class="outline-none"><div class="page" vt-update="none"><article class="kaira-dyn-detail" data-dyn-slug="${escapeHtml(slug)}" data-dyn-kind="${isShow ? 'show' : 'movie'}" style="--accent:oklch(0.84 0.09 62)">
      <section class="hero" data-ambient-hero="true">
        <div class="hero-stage grain" data-ambient-stage="true">
          <div class="hero-media absolute inset-0" data-ambient-art="true" aria-hidden="true">
            <div class="hero-slide" data-state="active" style="background:${escapeHtml(tone)}">
              ${initialBackdrop ? `<img class="kaira-dyn-backdrop${isPosterFallback ? ' kaira-dyn-poster-blur' : ''}" data-dyn-backdrop src="${escapeHtml(initialBackdrop)}" alt="" decoding="async" draggable="false" referrerpolicy="no-referrer"/>` : ''}
            </div>
          </div>
          <div class="hero-scrim" aria-hidden="true"></div>
          <div class="shell gutter absolute inset-x-0 bottom-0 z-[5] flex items-end justify-between gap-10 pb-6 md:pb-[clamp(2.5rem,7.5vh,5.5rem)]">
            <div class="hero-copy w-full min-w-0 md:max-w-[min(40rem,58%)]">
              <div class="flex flex-col items-center text-center md:items-start md:text-left">
                <div class="w-full" data-dyn-title-wrap>
                  <h1 class="kaira-dyn-title">${escapeHtml(title)}</h1>
                </div>
                <ul class="facts mt-5 justify-center md:mt-6 md:justify-start" data-dyn-facts>${factsHtml}</ul>
                <p class="hero-overview" data-dyn-overview>Loading details for ${escapeHtml(title)}…</p>
              </div>
              <div data-film-actions="" class="hero-actions">
                <div role="group" aria-label="${escapeHtml(title)}: play, and the trailer" class="capsule">
                  <span aria-hidden="true" data-glass-fill="" class="glass-fill"><span class="glass-standin"></span></span>
                  <a data-warm="" class="capsule-btn capsule-btn-text capsule-btn-play capsule-btn-lit" href="${watchHref}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M4.66 4.62v14.76c0 1.02 1.1 1.66 1.98 1.14l12.06-7.38a1.33 1.33 0 0 0 0-2.28L6.64 3.48C5.76 2.96 4.66 3.6 4.66 4.62Z"></path></svg><span>${isShow ? 'Play S1 E1' : 'Play'}</span></a>
                  <button type="button" class="capsule-btn capsule-btn-text" data-dyn-trailer-btn data-trailer-slug="${escapeHtml(slug)}" data-trailer-title="${escapeHtml(title)}" data-trailer-kind="${isShow ? 'show' : 'movie'}"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="mt-[0.172em] ml-[0.094rem]"><path d="M216,100H132.92l78.14-20.63a12,12,0,0,0,8.52-14.75l-8.16-30a19.94,19.94,0,0,0-24.3-13.95L34.79,60.87a19.74,19.74,0,0,0-12.14,9.27,19.48,19.48,0,0,0-1.95,15L28,112v88a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V112A12,12,0,0,0,216,100ZM124.89,61.91l18.29,10.56-25.95,6.85L98.94,68.76Zm64.45-17,3.91,14.35-17.13,4.52L157.83,53.21ZM66,77.46,84.29,88l-35.4,9.35L45,83ZM204,196H52V124H204Z"></path></svg><span class="max-[20.5rem]:sr-only">Trailer</span></button>
                </div>
                <div role="group" aria-label="${escapeHtml(title)}: the library, and share" class="capsule">
                  <span aria-hidden="true" data-glass-fill="" class="glass-fill"><span class="glass-standin"></span></span>
                  <button type="button" data-watchlist-button="" data-dyn-watchlist-btn data-title-slug="${escapeHtml(slug)}" data-title-kind="${isShow ? 'show' : 'movie'}" data-title="${escapeHtml(title)}" data-title-year="${escapeHtml(year)}" data-title-rating="${escapeHtml(rating)}" data-title-id="${escapeHtml(imdbId)}" data-title-genre="${escapeHtml(genres[0] || '')}" aria-pressed="false" aria-label="Add to library: ${escapeHtml(title)}" title="Add to library" class="capsule-btn"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256"><path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z"></path></svg></button>
                  <button type="button" class="capsule-btn" aria-label="Share ${escapeHtml(title)}" title="Share"><span class="capsule-icon relative grid place-items-center"><span class="absolute inset-0 grid place-items-center"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="size-5"><path d="M220,112v96a20,20,0,0,1-20,20H56a20,20,0,0,1-20-20V112A20,20,0,0,1,56,92H76a12,12,0,0,1,0,24H60v88H196V116H180a12,12,0,0,1,0-24h20A20,20,0,0,1,220,112ZM96.49,72.49,116,53v83a12,12,0,0,0,24,0V53l19.51,19.52a12,12,0,1,0,17-17l-40-40a12,12,0,0,0-17,0l-40,40a12,12,0,1,0,17,17Z"></path></svg></span></span></button>
                </div>
              </div>
              <div aria-hidden="true" class="mt-5 h-6 lg:hidden"></div>
            </div>
          </div>
        </div>
      </section>
      <section class="section" data-dyn-episodes-section hidden>
        <header class="shell gutter relative z-[1] mb-4 flex justify-between md:mb-5 items-baseline gap-6">
          <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="section-title min-w-0 max-w-full text-section font-semibold">
              <span class="title-row">Episodes<button type="button" tabindex="0" role="combobox" aria-expanded="false" aria-haspopup="listbox" class="title-select" data-dyn-season-select hidden><span class="title-select-text">Season 1</span><span aria-hidden="true" class="title-select-caret"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256"><path d="M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z"></path></svg></span></button></span>
            </h2>
          </div>
        </header>
        <div class="shell">
          <div class="contents">
            <div class="rail">
              <div role="list" aria-label="${escapeHtml(title)}, Season 1" class="rail-track [--cols:1.25] sm:[--cols:2.2] md:[--cols:2.6] lg:[--cols:3] xl:[--cols:4]" data-dyn-ep-grid></div>
              <button type="button" class="rail-arrow" data-dir="prev" tabindex="-1" aria-hidden="true" disabled=""><span><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="size-4"><path d="M168.49,199.51a12,12,0,0,1-17,17l-80-80a12,12,0,0,1,0-17l80-80a12,12,0,0,1,17,17L97,128Z"></path></svg></span></button>
              <button type="button" class="rail-arrow" data-dir="next" tabindex="-1" aria-hidden="true"><span><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="size-4"><path d="M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z"></path></svg></span></button>
            </div>
          </div>
        </div>
      </section>
      <section class="section" aria-label="Details and credits">
        <div class="shell gutter">
          <div class="movie-credits">
            <div class="flex flex-wrap items-center gap-x-10 gap-y-6 lg:flex-col lg:items-start lg:gap-8">
              <div class="flex items-center gap-5 lg:flex-col lg:items-start lg:gap-4" data-dyn-dial-wrap${rating ? '' : ' hidden'}>
                <div class="rating-dial relative grid shrink-0 place-items-center">
                  <svg viewBox="0 0 132 132" class="absolute inset-0 size-full -rotate-90 overflow-visible" aria-hidden="true">
                    <circle cx="66" cy="66" r="62.5" fill="none" stroke="oklch(1 0 0 / 0.1)" stroke-width="7"></circle>
                    <circle data-dyn-dial-arc cx="66" cy="66" r="62.5" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"></circle>
                  </svg>
                  <div class="text-center">
                    <p class="rating-dial-figure wdth-87 leading-none font-bold" data-dyn-dial-val aria-hidden="true">${escapeHtml(rating || '—')}</p>
                    <p class="rating-dial-label eyebrow text-fg-subtle" aria-hidden="true">out of 10</p>
                  </div>
                </div>
                <p class="text-[0.8125rem] leading-snug text-fg-subtle">IMDb rating</p>
              </div>
              <div class="rate">
                <p class="eyebrow text-fg-faint" id="${escapeHtml(rateId)}">Your rating</p>
                <div class="rate-stars" role="radiogroup" aria-labelledby="${escapeHtml(rateId)}">${starsHtml}</div>
              </div>
            </div>
            <dl class="movie-facts" data-dyn-facts-dl>
              <div class="movie-story">
                <dt class="eyebrow text-fg-faint">Storyline</dt>
                <dd class="mt-2.5 max-w-[46rem]"><p class="text-[1.0625rem] leading-[1.6] text-fg-muted" data-dyn-story>Loading synopsis…</p></dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
      <section class="section" data-dyn-cast-section hidden>
        <div class="shell gutter">
          <header class="relative z-[1] mb-4 flex justify-between md:mb-5 items-baseline gap-6">
            <h2 class="section-title min-w-0 max-w-full text-section font-semibold">Cast</h2>
          </header>
          <div class="kaira-dyn-cast-grid" data-dyn-cast-grid></div>
        </div>
      </section>
    </article></div></main></body></html>`;

    return new DOMParser().parseFromString(html, 'text/html');
  }

  async function hydrateDynamicDetailPage(slug, kind, hint) {
    const seq = ++dynHydrateSeq;
    const isShowHint = kind === 'show' || kind === 'tv';

    let meta = null;
    try {
      meta = await resolveTitleMeta(slug, isShowHint ? 'show' : 'movie');
    } catch {}

    // Enrich with full Cinemeta /meta endpoint (gives full background, logo, cast, director, runtime, awards & TV episodes)
    const resolvedImdbId = meta?.imdbId || meta?.id || hint?.imdbId || '';
    const resolvedIsShow = meta?.kind === 'show' || isShowHint;
    if (resolvedImdbId && /^tt\d+$/i.test(resolvedImdbId)) {
      try {
        const cmType = resolvedIsShow ? 'series' : 'movie';
        const cmRes = await fetch(`https://v3-cinemeta.strem.io/meta/${cmType}/${encodeURIComponent(resolvedImdbId)}.json`);
        if (cmRes.ok) {
          const cmData = await cmRes.json().catch(() => null);
          const m = cmData?.meta;
          if (m) {
            meta = {
              ...(meta || {}),
              slug,
              id: m.imdb_id || resolvedImdbId,
              imdbId: m.imdb_id || resolvedImdbId,
              title: m.name || meta?.title || hint?.title || formatSlugToTitle(slug),
              year: String(m.releaseInfo || m.year || meta?.year || hint?.year || '').slice(0, 4),
              kind: cmType === 'series' ? 'show' : 'movie',
              poster: m.poster || meta?.poster || hint?.poster || '',
              still: m.background || meta?.still || `https://images.metahub.space/background/medium/${resolvedImdbId}/img`,
              logo: m.logo || meta?.logo || '',
              runtime: m.runtime || meta?.runtime || '',
              description: m.description || meta?.description || '',
              rating: m.imdbRating ? String(m.imdbRating) : (meta?.rating || hint?.rating || ''),
              genres: Array.isArray(m.genres) && m.genres.length ? m.genres : (meta?.genres || hint?.genres || []),
              cast: Array.isArray(m.cast) ? m.cast : (meta?.cast || []),
              director: Array.isArray(m.director) ? m.director : (meta?.director || []),
              writer: Array.isArray(m.writer) ? m.writer : (meta?.writer || []),
              awards: m.awards || meta?.awards || '',
              country: m.country || meta?.country || '',
              videos: Array.isArray(m.videos) ? m.videos : (meta?.videos || []),
              trailerId: (Array.isArray(m.trailers) && m.trailers[0]?.source) || meta?.trailerId || null
            };
          }
        }
      } catch {}
    }

    if (seq !== dynHydrateSeq) return;
    const article = document.querySelector(`article.kaira-dyn-detail[data-dyn-slug="${CSS.escape(slug)}"]`);
    if (!article) return;

    const finalTitle = meta?.title || hint?.title || formatSlugToTitle(slug);
    const finalYear = meta?.year || hint?.year || (slug.match(/-(\d{4})$/)?.[1] || '');
    const finalRating = meta?.rating || hint?.rating || '';
    const finalGenres = Array.isArray(meta?.genres) && meta.genres.length ? meta.genres : (hint?.genres || []);
    const finalRuntime = meta?.runtime || '';
    const finalDesc = meta?.description || `Watch ${finalTitle}${finalYear ? ` (${finalYear})` : ''} on Kaira.`;
    const finalImdb = meta?.imdbId || meta?.id || hint?.imdbId || '';
    const finalKind = meta?.kind === 'show' || isShowHint ? 'show' : 'movie';

    document.title = `${finalTitle}${finalYear ? ` (${finalYear})` : ''} · Kaira`;

    // 1. Hero backdrop
    const backdropUrl = meta?.still || (finalImdb ? `https://images.metahub.space/background/medium/${finalImdb}/img` : '') || meta?.poster || hint?.poster || '';
    const slideEl = article.querySelector('.hero-slide');
    if (slideEl && backdropUrl) {
      const existingImg = slideEl.querySelector('img[data-dyn-backdrop]');
      if (!existingImg || existingImg.getAttribute('src') !== backdropUrl) {
        const img = document.createElement('img');
        img.className = 'kaira-dyn-backdrop' + (!meta?.still && !finalImdb ? ' kaira-dyn-poster-blur' : '');
        img.setAttribute('data-dyn-backdrop', '');
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        img.referrerPolicy = 'no-referrer';
        img.style.opacity = '0';
        img.onload = () => {
          img.style.opacity = '1';
        };
        img.onerror = () => {
          if (meta?.poster && img.src !== meta.poster) {
            img.src = meta.poster;
            img.classList.add('kaira-dyn-poster-blur');
          } else {
            img.style.opacity = '1';
          }
        };
        img.src = backdropUrl;
        slideEl.innerHTML = '';
        slideEl.appendChild(img);
        if (img.complete && img.naturalWidth > 0) img.style.opacity = '1';
      }
    }

    // 2. Title or clean logo treatment (keep h1 visible until logo actually loads)
    const titleWrap = article.querySelector('[data-dyn-title-wrap]');
    if (titleWrap) {
      titleWrap.innerHTML = `<h1 class="kaira-dyn-title">${escapeHtml(finalTitle)}</h1>`;
      if (meta?.logo) {
        const logoImg = document.createElement('img');
        logoImg.className = 'kaira-dyn-logo';
        logoImg.alt = finalTitle;
        logoImg.decoding = 'async';
        logoImg.draggable = false;
        logoImg.referrerPolicy = 'no-referrer';
        logoImg.style.display = 'none';
        logoImg.onload = () => {
          if (logoImg.naturalWidth > 20 && logoImg.naturalHeight > 10) {
            const h1 = titleWrap.querySelector('h1');
            if (h1) h1.className = 'sr-only';
            logoImg.style.display = 'block';
          }
        };
        logoImg.onerror = () => {
          logoImg.remove();
        };
        logoImg.src = meta.logo;
        titleWrap.appendChild(logoImg);
      }
    }

    // 3. Facts, synopsis, actions
    const factsUl = article.querySelector('[data-dyn-facts]');
    if (factsUl) {
      factsUl.innerHTML = renderDynFactsItemsHtml({ rating: finalRating, year: finalYear, runtime: finalRuntime, genres: finalGenres });
    }
    const overviewEl = article.querySelector('[data-dyn-overview]');
    if (overviewEl) overviewEl.textContent = finalDesc;

    const trailerBtn = article.querySelector('[data-dyn-trailer-btn]');
    if (trailerBtn) {
      trailerBtn.setAttribute('data-trailer-title', finalTitle);
      trailerBtn.setAttribute('data-trailer-kind', finalKind);
      if (meta?.trailerId) trailerBtn.setAttribute('data-trailer-id', meta.trailerId);
    }

    const wlBtn = article.querySelector('[data-dyn-watchlist-btn]');
    if (wlBtn) {
      wlBtn.setAttribute('data-title', finalTitle);
      wlBtn.setAttribute('data-title-kind', finalKind);
      if (finalYear) wlBtn.setAttribute('data-title-year', finalYear);
      if (finalRating) wlBtn.setAttribute('data-title-rating', finalRating);
      if (finalImdb) wlBtn.setAttribute('data-title-id', finalImdb);
      if (finalGenres[0]) wlBtn.setAttribute('data-title-genre', finalGenres[0]);
      wlBtn.setAttribute('aria-label', `Add to library: ${finalTitle}`);
    }

    // 4. IMDb rating dial
    const dialWrap = article.querySelector('[data-dyn-dial-wrap]');
    const numRating = parseFloat(finalRating);
    if (dialWrap && Number.isFinite(numRating) && numRating > 0) {
      dialWrap.hidden = false;
      const valEl = dialWrap.querySelector('[data-dyn-dial-val]');
      const arcEl = dialWrap.querySelector('[data-dyn-dial-arc]');
      if (valEl) valEl.textContent = finalRating;
      if (arcEl) {
        const circumference = 392.699;
        arcEl.setAttribute('stroke-dashoffset', String(Math.max(0, circumference * (1 - Math.min(10, numRating) / 10))));
      }
    }

    // 5. Storyline & Credits DL
    const dlEl = article.querySelector('[data-dyn-facts-dl]');
    if (dlEl) {
      const blocks = [
        `<div class="movie-story"><dt class="eyebrow text-fg-faint">Storyline</dt><dd class="mt-2.5 max-w-[46rem]"><p class="text-[1.0625rem] leading-[1.6] text-fg-muted">${escapeHtml(finalDesc)}</p></dd></div>`
      ];
      if (Array.isArray(meta?.director) && meta.director.length) {
        const dirLinks = meta.director.map(n => `<span><a class="fact-link inline-block max-w-full" href="${withBasePath(`/search?q=${encodeURIComponent(n)}`)}">${escapeHtml(n)}</a></span>`).join(', ');
        blocks.push(`<div><dt class="eyebrow text-fg-faint">Directed by</dt><dd class="fact-lead-names mt-2.5 font-serif text-[1.5rem] leading-[1.2] italic">${dirLinks}</dd></div>`);
      }
      if (Array.isArray(meta?.writer) && meta.writer.length) {
        const wrLinks = meta.writer.slice(0, 4).map(n => `<span><a class="fact-link inline-block max-w-full" href="${withBasePath(`/search?q=${encodeURIComponent(n)}`)}">${escapeHtml(n)}</a></span>`).join(', ');
        blocks.push(`<div><dt class="eyebrow text-fg-faint">Written by</dt><dd class="mt-2.5 text-[1.0625rem] leading-[1.45] fact-names">${wrLinks}</dd></div>`);
      }
      if (finalYear) {
        blocks.push(`<div><dt class="eyebrow text-fg-faint">Released</dt><dd class="mt-2.5 text-[1.0625rem] leading-[1.45] text-fg-muted">${escapeHtml(finalYear)}</dd></div>`);
      }
      if (finalRuntime) {
        blocks.push(`<div><dt class="eyebrow text-fg-faint">Running time</dt><dd class="mt-2.5 text-[1.0625rem] leading-[1.45] text-fg-muted">${escapeHtml(finalRuntime)}</dd></div>`);
      }
      if (finalGenres.length) {
        const gLinks = finalGenres.map(g => {
          const gSlug = String(g).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          return `<span><a class="fact-link inline-block max-w-full" href="${withBasePath(`/genres/${encodeURIComponent(gSlug)}`)}">${escapeHtml(g)}</a></span>`;
        }).join(', ');
        blocks.push(`<div><dt class="eyebrow text-fg-faint">Genres</dt><dd class="mt-2.5 text-[1.0625rem] leading-[1.45] text-fg-muted">${gLinks}</dd></div>`);
      }
      if (meta?.country) {
        blocks.push(`<div><dt class="eyebrow text-fg-faint">Countries</dt><dd class="mt-2.5 text-[1.0625rem] leading-[1.45] text-fg-muted">${escapeHtml(meta.country)}</dd></div>`);
      }
      if (meta?.awards) {
        blocks.push(`<div><dt class="eyebrow text-fg-faint">Awards</dt><dd class="mt-2.5 text-[1.0625rem] leading-[1.45] text-fg-muted">${escapeHtml(meta.awards)}</dd></div>`);
      }
      dlEl.innerHTML = blocks.join('');
    }

    // 6. Cast section
    const castSection = article.querySelector('[data-dyn-cast-section]');
    const castGrid = article.querySelector('[data-dyn-cast-grid]');
    if (castSection && castGrid && Array.isArray(meta?.cast) && meta.cast.length) {
      castSection.hidden = false;
      castGrid.innerHTML = meta.cast.slice(0, 14).map(name => (
        `<a class="kaira-dyn-cast-chip" href="${withBasePath(`/search?q=${encodeURIComponent(name)}`)}">${escapeHtml(name)}</a>`
      )).join('');
    }

    // 7. TV Show Seasons & Episodes (native Kaira horizontal rail + Season dropdown)
    const epSection = article.querySelector('[data-dyn-episodes-section]');
    const seasonSelectBtn = article.querySelector('[data-dyn-season-select]');
    const epGrid = article.querySelector('[data-dyn-ep-grid]');
    if (finalKind === 'show' && epSection && epGrid && Array.isArray(meta?.videos) && meta.videos.length) {
      const seasonsMap = new Map();
      const defaultEpRuntime = finalRuntime ? String(finalRuntime).replace(/min/i, 'm').replace(/\s+/g, '') : '';
      for (const v of meta.videos) {
        const sNum = Number(v.season);
        const eNum = Number(v.episode || v.number);
        if (!Number.isFinite(sNum) || sNum <= 0 || !Number.isFinite(eNum) || eNum <= 0) continue;
        if (!seasonsMap.has(sNum)) seasonsMap.set(sNum, []);
        const rawRt = v.runtime || defaultEpRuntime;
        const rtLabel = rawRt ? (/^\d+$/.test(String(rawRt)) ? `${rawRt}m` : String(rawRt)) : '';
        const epScore = v.rating || v.imdbRating ? Number(v.rating || v.imdbRating).toFixed(1) : '';
        seasonsMap.get(sNum).push({
          season: sNum,
          episode: eNum,
          title: v.name || v.title || `Episode ${eNum}`,
          overview: v.overview || v.description || '',
          thumbnail: v.thumbnail || backdropUrl || '',
          runtime: rtLabel,
          rating: epScore && epScore !== 'NaN' && Number(epScore) > 0 ? epScore : ''
        });
      }
      const seasonNums = Array.from(seasonsMap.keys()).sort((a, b) => a - b);
      if (seasonNums.length > 0) {
        epSection.hidden = false;
        const renderSeason = (activeSeason) => {
          const eps = (seasonsMap.get(activeSeason) || []).slice().sort((a, b) => a.episode - b.episode);
          if (seasonSelectBtn) {
            const labelSpan = seasonSelectBtn.querySelector('.title-select-text') || seasonSelectBtn;
            labelSpan.textContent = `Season ${activeSeason}`;
          }
          epGrid.setAttribute('aria-label', `${finalTitle}, Season ${activeSeason}`);
          epGrid.innerHTML = eps.map(ep => `
            <div role="listitem" data-episode="${ep.episode}">
              <a class="card episode" data-rail-focus="true" aria-label="Episode ${ep.episode}: ${escapeAttr(ep.title)}" href="${withBasePath(`/watch/${encodeURIComponent(slug)}/s${ep.season}e${ep.episode}`)}">
                <span class="card-art card-still">
                  <span class="card-pic">
                    ${ep.thumbnail ? `<img data-fade="true" src="${escapeHtml(ep.thumbnail)}" alt="" width="780" height="439" loading="lazy" decoding="async" draggable="false" referrerpolicy="no-referrer"/>` : ''}
                  </span>
                </span>
                <span class="episode-text">
                  <span class="episode-meta">
                    <span>Episode ${ep.episode}${ep.runtime ? ` · ${escapeHtml(ep.runtime)}` : ''}</span>
                    ${ep.rating ? `<span class="episode-score"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"><path d="M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z"></path></svg>${escapeHtml(ep.rating)}<span class="sr-only"> out of 10</span></span>` : ''}
                  </span>
                  <span class="episode-title">${escapeHtml(ep.title)}</span>
                  ${ep.overview ? `<span class="episode-story">${escapeHtml(ep.overview)}</span>` : ''}
                </span>
              </a>
            </div>
          `).join('');
          epGrid.querySelectorAll('img[data-fade]').forEach(img => {
            if (img.complete && img.naturalWidth > 0) img.setAttribute('data-loaded', '');
            else img.addEventListener('load', () => img.setAttribute('data-loaded', ''), { once: true });
          });
          epGrid.scrollLeft = 0;
          try { initRailScroll(); } catch {}
        };

        if (seasonSelectBtn) {
          const seasonOptions = seasonNums.map(sNum => {
            const count = (seasonsMap.get(sNum) || []).length;
            return {
              n: sNum,
              label: `Season ${sNum}`,
              subtitle: `${count} ${count === 1 ? 'episode' : 'episodes'}`
            };
          });
          seasonSelectBtn.hidden = false;
          seasonSelectBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (activeTriggerBtn === seasonSelectBtn) {
              closeCurrentPopup();
              return;
            }
            const curLabel = (seasonSelectBtn.querySelector('.title-select-text') || seasonSelectBtn).textContent.trim();
            openDropdownPopup(seasonSelectBtn, seasonOptions, curLabel, (selectedOpt) => {
              renderSeason(selectedOpt.n);
            });
          };
        }
        renderSeason(seasonNums[0]);
      }
    }

    try { syncDetailContinueWatchingButton(); } catch {}
    try { initWatchlist(); } catch {}
    try { initDetailPageControls(); } catch {}
    try { initRailScroll(); } catch {}
  }

  function canonicalizeAliasRoute(rawPath) {
    const [pathOnly, searchPart] = String(rawPath || '/').split('?');
    const norm = normalizeRoutePath(pathOnly);
    if (norm === '/top-rated') return withBasePath('/discover?sort=rating');
    if (norm === '/new') return withBasePath('/just-added');
    return searchPart ? `${pathOnly}?${searchPart}` : pathOnly;
  }

  function parseDynamicRoute(rawPath) {
    const norm = normalizeRoutePath(rawPath);
    const detail = parseDetailRoute(norm);
    if (detail) return { type: 'detail', ...detail };

    const animeMatch = norm.match(/^\/anime\/(\d+)$/);
    if (animeMatch) return { type: 'anime', id: animeMatch[1], slug: `anime-${animeMatch[1]}` };

    const genreMatch = norm.match(/^\/genres\/([^/?#]+)$/);
    if (genreMatch) {
      let raw = genreMatch[1];
      try { raw = decodeURIComponent(raw); } catch {}
      raw = raw.trim();
      if (raw) return { type: 'genre', slug: raw };
    }

    const colMatch = norm.match(/^\/collection\/([^/?#]+)$/);
    if (colMatch) {
      let raw = colMatch[1];
      try { raw = decodeURIComponent(raw); } catch {}
      raw = raw.trim();
      if (raw) return { type: 'collection', slug: raw };
    }

    const studioMatch = norm.match(/^\/studio\/([^/?#]+)$/);
    if (studioMatch) {
      let raw = studioMatch[1];
      try { raw = decodeURIComponent(raw); } catch {}
      raw = raw.trim();
      if (raw) return { type: 'studio', slug: raw };
    }

    return null;
  }

  function isValidRouteHtmlString(html, rawPath) {
    if (!html || typeof html !== 'string') return false;
    if (html.includes('id="__next_error__"')) return false;
    const norm = normalizeRoutePath(rawPath);
    if (norm.startsWith('/watch/')) return true;
    const dyn = parseDynamicRoute(norm);
    if (dyn && dyn.type === 'detail') return isValidDetailHtmlString(html);
    if (!/<main[\s>]/i.test(html)) return false;
    const allowsHeroSwitch = norm === '/' || norm === '/index.html' || norm === '/movies' || norm === '/tv';
    if (!allowsHeroSwitch && html.includes('hero-switch')) return false;
    return true;
  }

  function isValidRouteDoc(doc, rawPath) {
    if (!doc) return false;
    if (doc.getElementById('__next_error__')) return false;
    const norm = normalizeRoutePath(rawPath);
    if (norm.startsWith('/watch/')) return true;
    const dyn = parseDynamicRoute(norm);
    if (dyn && dyn.type === 'detail') return isValidDetailDoc(doc);
    if (!doc.querySelector('main')) return false;
    const allowsHeroSwitch = norm === '/' || norm === '/index.html' || norm === '/movies' || norm === '/tv';
    if (!allowsHeroSwitch && doc.querySelector('main .hero-switch, main .hero-switch-bars')) return false;
    if (dyn && dyn.type === 'anime') {
      return Boolean(doc.querySelector('main article') || doc.querySelector('a[href*="/watch/anime/"]'));
    }
    return true;
  }

  function formatLabelFromSlug(rawSlug, stripSuffix) {
    let s = String(rawSlug || '').trim();
    if (stripSuffix) s = s.replace(new RegExp(`-${stripSuffix}$`, 'i'), '');
    if (s.toLowerCase() === 'sci-fi') return 'Sci-Fi';
    if (s.toLowerCase() === 'sci-fi & fantasy' || s.toLowerCase() === 'sci-fi-fantasy') return 'Sci-Fi & Fantasy';
    if (s.toLowerCase() === 'action & adventure' || s.toLowerCase() === 'action-adventure') return 'Action & Adventure';
    return s
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map(w => w === '&' ? '&' : w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function buildDynamicAnimeDocument(animeId, hint) {
    const title = hint?.title || `Anime #${animeId}`;
    const year = hint?.year || '';
    const rating = hint?.rating || '';
    const backdrop = hint?.poster || '';
    const watchHref = withBasePath(`/watch/anime/${encodeURIComponent(animeId)}/1`);
    const html = `<!DOCTYPE html><html lang="en"><head><title>${escapeHtml(title)} · Kaira</title></head><body><main id="main" tabindex="-1" class="outline-none"><div class="page" vt-update="none"><article class="kaira-dyn-detail" data-dyn-anime-id="${escapeHtml(animeId)}" style="--accent:oklch(0.84 0.11 32)">
      <section class="hero" data-ambient-hero="true">
        <div class="hero-stage grain" data-ambient-stage="true">
          <div class="hero-media absolute inset-0" data-ambient-art="true" aria-hidden="true">
            <div class="hero-slide" data-state="active" style="background:#16171d">
              ${backdrop ? `<img class="kaira-dyn-backdrop kaira-dyn-poster-blur" data-dyn-backdrop src="${escapeHtml(backdrop)}" alt="" decoding="async" draggable="false" referrerpolicy="no-referrer"/>` : ''}
            </div>
          </div>
          <div class="hero-scrim" aria-hidden="true"></div>
          <div class="shell gutter absolute inset-x-0 bottom-0 z-[5] flex items-end justify-between gap-10 pb-6 md:pb-[clamp(2.5rem,7.5vh,5.5rem)]">
            <div class="hero-copy w-full min-w-0 md:max-w-[min(40rem,58%)]">
              <div class="flex flex-col items-center text-center md:items-start md:text-left">
                <div class="w-full" data-dyn-title-wrap><h1 class="kaira-dyn-title">${escapeHtml(title)}</h1></div>
                <ul class="facts mt-5 justify-center md:mt-6 md:justify-start" data-dyn-facts>${renderDynFactsItemsHtml({ rating, year, genres: [], runtime: '' })}</ul>
                <p class="hero-overview" data-dyn-overview>Loading anime details…</p>
              </div>
              <div data-film-actions="" class="hero-actions">
                <div role="group" aria-label="${escapeHtml(title)}: play, and the trailer" class="capsule">
                  <span aria-hidden="true" data-glass-fill="" class="glass-fill"><span class="glass-standin"></span></span>
                  <a data-warm="" class="capsule-btn capsule-btn-text capsule-btn-play capsule-btn-lit" href="${watchHref}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M4.66 4.62v14.76c0 1.02 1.1 1.66 1.98 1.14l12.06-7.38a1.33 1.33 0 0 0 0-2.28L6.64 3.48C5.76 2.96 4.66 3.6 4.66 4.62Z"></path></svg><span>Play Ep 1</span></a>
                  <button type="button" class="capsule-btn capsule-btn-text" data-dyn-trailer-btn data-trailer-slug="anime-${escapeHtml(animeId)}" data-trailer-title="${escapeHtml(title)}" data-trailer-kind="show" hidden><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="mt-[0.172em] ml-[0.094rem]"><path d="M216,100H132.92l78.14-20.63a12,12,0,0,0,8.52-14.75l-8.16-30a19.94,19.94,0,0,0-24.3-13.95L34.79,60.87a19.74,19.74,0,0,0-12.14,9.27,19.48,19.48,0,0,0-1.95,15L28,112v88a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V112A12,12,0,0,0,216,100Z"></path></svg><span>Trailer</span></button>
                </div>
                <div role="group" aria-label="${escapeHtml(title)}: share" class="capsule">
                  <span aria-hidden="true" data-glass-fill="" class="glass-fill"><span class="glass-standin"></span></span>
                  <button type="button" class="capsule-btn" aria-label="Share ${escapeHtml(title)}" title="Share"><span class="capsule-icon relative grid place-items-center"><span class="absolute inset-0 grid place-items-center"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="size-5"><path d="M220,112v96a20,20,0,0,1-20,20H56a20,20,0,0,1-20-20V112A20,20,0,0,1,56,92H76a12,12,0,0,1,0,24H60v88H196V116H180a12,12,0,0,1,0-24h20A20,20,0,0,1,220,112ZM96.49,72.49,116,53v83a12,12,0,0,0,24,0V53l19.51,19.52a12,12,0,1,0,17-17l-40-40a12,12,0,0,0-17,0l-40,40a12,12,0,1,0,17,17Z"></path></svg></span></span></button>
                </div>
              </div>
              <div aria-hidden="true" class="mt-5 h-6 lg:hidden"></div>
            </div>
          </div>
        </div>
      </section>
      <section class="section" data-dyn-episodes-section hidden>
        <header class="shell gutter relative z-[1] mb-4 flex justify-between md:mb-5 items-baseline gap-6">
          <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 class="section-title min-w-0 max-w-full text-section font-semibold">Episodes</h2>
          </div>
        </header>
        <div class="shell">
          <div class="contents">
            <div class="rail">
              <div role="list" aria-label="${escapeHtml(title)} episodes" class="rail-track [--cols:1.25] sm:[--cols:2.2] md:[--cols:2.6] lg:[--cols:3] xl:[--cols:4]" data-dyn-ep-grid></div>
              <button type="button" class="rail-arrow" data-dir="prev" tabindex="-1" aria-hidden="true" disabled=""><span><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="size-4"><path d="M168.49,199.51a12,12,0,0,1-17,17l-80-80a12,12,0,0,1,0-17l80-80a12,12,0,0,1,17,17L97,128Z"></path></svg></span></button>
              <button type="button" class="rail-arrow" data-dir="next" tabindex="-1" aria-hidden="true"><span><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="size-4"><path d="M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z"></path></svg></span></button>
            </div>
          </div>
        </div>
      </section>
    </article></div></main></body></html>`;
    return new DOMParser().parseFromString(html, 'text/html');
  }

  async function hydrateDynamicAnimePage(animeId, hint) {
    const seq = ++dynHydrateSeq;
    let info = null;

    // 1. Primary: AniList GraphQL by MyAnimeList ID (fast, CORS-friendly, widescreen banners)
    const numericId = Number(animeId);
    if (Number.isFinite(numericId) && numericId > 0) {
      try {
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          signal: ctrl?.signal,
          body: JSON.stringify({
            query: 'query($id:Int){Media(idMal:$id,type:ANIME){title{english romaji}description(asHtml:false)seasonYear averageScore episodes duration genres bannerImage coverImage{extraLarge large}trailer{id site}}}',
            variables: { id: numericId }
          })
        });
        if (timer) clearTimeout(timer);
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const m = json?.data?.Media;
          if (m) {
            const cleanDesc = String(m.description || '')
              .replace(/<br\s*\/?>/gi, ' ')
              .replace(/<[^>]+>/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            info = {
              title: m.title?.english || m.title?.romaji || '',
              year: m.seasonYear ? String(m.seasonYear) : '',
              rating: m.averageScore ? (Number(m.averageScore) / 10).toFixed(1) : '',
              genres: Array.isArray(m.genres) ? m.genres.filter(Boolean) : [],
              runtime: m.duration ? `${m.duration} min` : '',
              synopsis: cleanDesc,
              banner: m.bannerImage || '',
              cover: m.coverImage?.extraLarge || m.coverImage?.large || '',
              trailerId: m.trailer?.site === 'youtube' ? (m.trailer.id || '') : '',
              episodes: Number(m.episodes) || 0
            };
          }
        }
      } catch {}
    }

    // 2. Secondary fallback: Jikan API
    if (!info) {
      try {
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 4500) : null;
        const res = await fetch(`https://api.jikan.moe/v4/anime/${encodeURIComponent(animeId)}`, { signal: ctrl?.signal });
        if (timer) clearTimeout(timer);
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const d = json?.data;
          if (d) {
            info = {
              title: d.title_english || d.title || '',
              year: d.year ? String(d.year) : (d.aired?.prop?.from?.year ? String(d.aired.prop.from.year) : ''),
              rating: d.score ? Number(d.score).toFixed(1) : '',
              genres: Array.isArray(d.genres) ? d.genres.map(g => g.name).filter(Boolean) : [],
              runtime: d.duration ? String(d.duration).replace(/ per ep.*/i, '') : '',
              synopsis: d.synopsis || '',
              banner: '',
              cover: d.images?.webp?.large_image_url || d.images?.jpg?.large_image_url || '',
              trailerId: d.trailer?.youtube_id || '',
              episodes: Number(d.episodes) || 0
            };
          }
        }
      } catch {}
    }

    if (seq !== dynHydrateSeq) return;
    const article = document.querySelector(`article.kaira-dyn-detail[data-dyn-anime-id="${CSS.escape(animeId)}"]`);
    if (!article) return;

    const title = info?.title || hint?.title || `Anime #${animeId}`;
    const year = info?.year || hint?.year || '';
    const rating = info?.rating || hint?.rating || '';
    const genres = Array.isArray(info?.genres) && info.genres.length ? info.genres : (hint?.genres || []);
    const runtime = info?.runtime || '';
    const desc = info?.synopsis || `Stream ${title} episodes on Kaira.`;
    const heroImg = info?.banner || info?.cover || hint?.poster || '';
    const isBlurredCover = !info?.banner && Boolean(heroImg);
    const thumbImg = info?.banner || info?.cover || hint?.poster || '';
    const trailerId = info?.trailerId || '';
    const epCount = Math.min(Math.max(Number(info?.episodes) || 12, 1), 60);

    document.title = `${title}${year ? ` (${year})` : ''} · Kaira`;
    const titleWrap = article.querySelector('[data-dyn-title-wrap]');
    if (titleWrap) titleWrap.innerHTML = `<h1 class="kaira-dyn-title">${escapeHtml(title)}</h1>`;
    const factsUl = article.querySelector('[data-dyn-facts]');
    if (factsUl) factsUl.innerHTML = renderDynFactsItemsHtml({ rating, year, runtime, genres });
    const ov = article.querySelector('[data-dyn-overview]');
    if (ov) ov.textContent = desc;

    const slideEl = article.querySelector('.hero-slide');
    if (slideEl && heroImg) {
      const img = document.createElement('img');
      img.className = `kaira-dyn-backdrop${isBlurredCover ? ' kaira-dyn-poster-blur' : ''}`;
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.referrerPolicy = 'no-referrer';
      img.style.opacity = '0';
      img.onload = () => { img.style.opacity = '1'; };
      img.onerror = () => { img.style.opacity = '1'; };
      img.src = heroImg;
      slideEl.innerHTML = '';
      slideEl.appendChild(img);
      if (img.complete && img.naturalWidth > 0) img.style.opacity = '1';
    }
    const trailerBtn = article.querySelector('[data-dyn-trailer-btn]');
    if (trailerBtn && trailerId) {
      trailerBtn.hidden = false;
      trailerBtn.setAttribute('data-trailer-id', trailerId);
      trailerBtn.setAttribute('data-trailer-title', title);
    }

    const epSection = article.querySelector('[data-dyn-episodes-section]');
    const epGrid = article.querySelector('[data-dyn-ep-grid]');
    if (epSection && epGrid) {
      epSection.hidden = false;
      const epRuntime = runtime ? String(runtime).replace(/min/i, 'm').replace(/\s+/g, '') : '';
      const cards = [];
      for (let ep = 1; ep <= epCount; ep++) {
        cards.push(`
          <div role="listitem" data-episode="${ep}">
            <a class="card episode" data-rail-focus="true" aria-label="Episode ${ep}: ${escapeAttr(title)}" href="${withBasePath(`/watch/anime/${encodeURIComponent(animeId)}/${ep}`)}">
              <span class="card-art card-still">
                <span class="card-pic">
                  ${thumbImg ? `<img data-fade="true" src="${escapeHtml(thumbImg)}" alt="" width="780" height="439" loading="lazy" decoding="async" draggable="false" referrerpolicy="no-referrer"/>` : ''}
                </span>
              </span>
              <span class="episode-text">
                <span class="episode-meta">
                  <span>Episode ${ep}${epRuntime ? ` · ${escapeHtml(epRuntime)}` : ''}</span>
                </span>
                <span class="episode-title">${escapeHtml(title)} · Episode ${ep}</span>
              </span>
            </a>
          </div>
        `);
      }
      epGrid.innerHTML = cards.join('');
      epGrid.querySelectorAll('img[data-fade]').forEach(img => {
        if (img.complete && img.naturalWidth > 0) img.setAttribute('data-loaded', '');
        else img.addEventListener('load', () => img.setAttribute('data-loaded', ''), { once: true });
      });
      epGrid.scrollLeft = 0;
      try { initRailScroll(); } catch {}
    }
  }

  function buildDynamicCatalogDocument(route) {
    const isGenre = route.type === 'genre';
    const isCollection = route.type === 'collection';
    const heading = isGenre
      ? formatLabelFromSlug(route.slug, '')
      : isCollection
        ? `${formatLabelFromSlug(route.slug, 'collection')} Collection`
        : formatLabelFromSlug(route.slug, '');
    const eyebrow = isGenre ? 'Genre' : isCollection ? 'Collection' : 'Studio';
    const html = `<!DOCTYPE html><html lang="en"><head><title>${escapeHtml(heading)} · Kaira</title></head><body><main id="main" tabindex="-1" class="outline-none"><div class="page" vt-update="none">
      <section class="section" style="padding-top:clamp(6.5rem,11vh,8.5rem);" data-dyn-catalog-type="${escapeHtml(route.type)}" data-dyn-catalog-slug="${escapeHtml(route.slug)}">
        <div class="shell gutter">
          <p class="eyebrow text-fg-faint">${escapeHtml(eyebrow)}</p>
          <h1 class="mt-2 text-display font-bold tracking-tight text-fg" style="font-size:clamp(2rem,4vw,3.25rem);line-height:1.08;">${escapeHtml(heading)}</h1>
          <p class="mt-3 text-fg-muted" data-dyn-catalog-status>Loading titles…</p>
          <ul class="film-grid mt-8" data-dyn-catalog-grid aria-label="${escapeHtml(heading)} titles"></ul>
        </div>
      </section>
    </div></main></body></html>`;
    return new DOMParser().parseFromString(html, 'text/html');
  }

  async function hydrateDynamicCatalogPage(route) {
    const seq = ++dynHydrateSeq;
    let items = [];

    if (route.type === 'genre') {
      const label = formatLabelFromSlug(route.slug, '');
      const primaryGenre = label.split('&')[0].trim();
      const apiSlug = primaryGenre.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      try {
        const apiRes = await fetchApiJsonWithMeta(`/api/browse?genre=${encodeURIComponent(apiSlug)}&kind=movie`);
        const data = apiRes && apiRes.data;
        if (data) {
          items = data?.films || data?.results || [];
        }
      } catch {}
      if (!items.length) {
        try {
          const [mRes, sRes] = await Promise.all([
            fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/genre=${encodeURIComponent(primaryGenre)}.json`).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(`https://v3-cinemeta.strem.io/catalog/series/top/genre=${encodeURIComponent(primaryGenre)}.json`).then(r => r.ok ? r.json() : null).catch(() => null)
          ]);
          const combined = [
            ...((mRes?.metas || []).slice(0, 18).map(m => ({ ...m, _kind: 'movie' }))),
            ...((sRes?.metas || []).slice(0, 10).map(m => ({ ...m, _kind: 'show' })))
          ];
          items = combined.map(m => ({
            id: m.imdb_id || m.id,
            slug: makeSlugFromTitleYear(m.name, m.releaseInfo || m.year),
            title: m.name,
            year: String(m.releaseInfo || m.year || '').slice(0, 4),
            kind: m._kind,
            poster: m.poster || '',
            rating: m.imdbRating ? Number(m.imdbRating) : undefined,
            genres: Array.isArray(m.genres) && m.genres.length ? m.genres : [primaryGenre]
          }));
        } catch {}
      }
    } else {
      const query = formatLabelFromSlug(route.slug, route.type === 'collection' ? 'collection' : '');
      try {
        const apiRes = await fetchApiJsonWithMeta(`/api/search?q=${encodeURIComponent(query)}`);
        const data = apiRes && apiRes.data;
        if (data) {
          items = data?.results || data?.films || [];
        }
      } catch {}
      if (!items.length) {
        try {
          const [mRes, sRes] = await Promise.all([
            fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(query)}.json`).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(`https://v3-cinemeta.strem.io/catalog/series/top/search=${encodeURIComponent(query)}.json`).then(r => r.ok ? r.json() : null).catch(() => null)
          ]);
          const combined = [
            ...((mRes?.metas || []).slice(0, 18).map(m => ({ ...m, _kind: 'movie' }))),
            ...((sRes?.metas || []).slice(0, 8).map(m => ({ ...m, _kind: 'show' })))
          ];
          items = combined.map(m => ({
            id: m.imdb_id || m.id,
            slug: makeSlugFromTitleYear(m.name, m.releaseInfo || m.year),
            title: m.name,
            year: String(m.releaseInfo || m.year || '').slice(0, 4),
            kind: m._kind,
            poster: m.poster || '',
            rating: m.imdbRating ? Number(m.imdbRating) : undefined,
            genres: Array.isArray(m.genres) ? m.genres : []
          }));
        } catch {}
      }
    }

    if (seq !== dynHydrateSeq) return;
    const section = document.querySelector(`[data-dyn-catalog-type="${CSS.escape(route.type)}"][data-dyn-catalog-slug="${CSS.escape(route.slug)}"]`);
    if (!section) return;
    const grid = section.querySelector('[data-dyn-catalog-grid]');
    const status = section.querySelector('[data-dyn-catalog-status]');

    if (!items.length) {
      if (status) status.textContent = 'No titles matched directly — try searching our full catalog.';
      if (grid) {
        grid.innerHTML = `<li style="grid-column:1 / -1;padding:2rem 0;"><a class="btn btn-primary" href="${withBasePath(`/search?q=${encodeURIComponent(formatLabelFromSlug(route.slug, 'collection'))}`)}">Search catalog</a></li>`;
      }
      return;
    }

    if (status) status.textContent = `${items.length} titles available`;
    if (grid) {
      grid.innerHTML = items.map(it => `<li>${renderPosterCardHtml(it, { defaultIsTv: it.kind === 'show' })}</li>`).join('');
    }
    try { initWatchlist(); } catch {}
  }

  function buildFallbackDocumentForDynamicRoute(dynRoute) {
    if (!dynRoute) return null;
    if (dynRoute.type === 'detail') {
      const hint = clickedCardMetaMap.get(dynRoute.slug) || null;
      return {
        doc: buildDynamicDetailDocument(dynRoute.slug, dynRoute.kind, hint),
        hydrate: () => hydrateDynamicDetailPage(dynRoute.slug, dynRoute.kind, hint)
      };
    }
    if (dynRoute.type === 'anime') {
      const hint = clickedCardMetaMap.get(dynRoute.slug) || null;
      return {
        doc: buildDynamicAnimeDocument(dynRoute.id, hint),
        hydrate: () => hydrateDynamicAnimePage(dynRoute.id, hint)
      };
    }
    return {
      doc: buildDynamicCatalogDocument(dynRoute),
      hydrate: () => hydrateDynamicCatalogPage(dynRoute)
    };
  }

  async function fetchPageHtml(path) {
    if (pageCache.has(path)) {
      return pageCache.get(path);
    }
    const res = await fetch(path, {
      headers: { 'X-Requested-With': 'Flicx-Router' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (isValidRouteHtmlString(html, path)) {
      if (pageCache.size > 25) {
        const first = pageCache.keys().next().value;
        pageCache.delete(first);
      }
      pageCache.set(path, html);
    }
    return html;
  }

  async function navigateTo(rawTargetPath, pushState = true) {
    const targetPath = canonicalizeAliasRoute(rawTargetPath);
    if (isNavigating) return;
    if (pushState && targetPath === currentRenderedPath) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    isNavigating = true;
    document.documentElement.setAttribute('data-pending', '');

    try {
      const dynRoute = parseDynamicRoute(targetPath);
      const isTargetWatch = normalizeRoutePath(targetPath).startsWith('/watch/');
      let newDoc = null;
      let hydrateDynamic = null;

      try {
        const html = await fetchPageHtml(targetPath);
        const parser = new DOMParser();
        newDoc = parser.parseFromString(html, 'text/html');
      } catch (fetchErr) {
        if (!dynRoute && !isTargetWatch) throw fetchErr;
      }

      if (isTargetWatch && !newDoc) {
        newDoc = new DOMParser().parseFromString('<!DOCTYPE html><html><head><title>Watch · Kaira</title></head><body><div class="watch-root"></div></body></html>', 'text/html');
      } else if (dynRoute && !isValidRouteDoc(newDoc, targetPath)) {
        const built = buildFallbackDocumentForDynamicRoute(dynRoute);
        if (built) {
          newDoc = built.doc;
          hydrateDynamic = built.hydrate;
        }
      }

      if (!newDoc) {
        throw new Error('No document available for navigation');
      }

      const currentMain = document.querySelector('main') || document.querySelector('.watch-root');

      if (document.startViewTransition) {
        const transition = document.startViewTransition(() => {
          swapPageDom(newDoc, targetPath, pushState);
        });
        await Promise.race([
          transition.finished.catch(() => {}),
          new Promise(r => setTimeout(r, 800))
        ]);
      } else {
        if (currentMain) {
          currentMain.classList.add('page-transitioning-out');
          await new Promise(r => setTimeout(r, 140));
        }
        swapPageDom(newDoc, targetPath, pushState);
        const activeMain = document.querySelector('main') || document.querySelector('.watch-root');
        if (activeMain) {
          activeMain.classList.add('page-transitioning-in');
          setTimeout(() => {
            activeMain.classList.remove('page-transitioning-in');
          }, 280);
        }
      }

      if (hydrateDynamic) {
        hydrateDynamic();
      }
    } catch (err) {
      console.warn('Transition navigation failed, falling back to full reload', err);
      window.location.href = targetPath;
      return;
    } finally {
      isNavigating = false;
      document.documentElement.removeAttribute('data-pending');
    }
  }

  function swapPageDom(newDoc, targetPath, pushState) {
    try { rewriteProxyImagesInDom(newDoc); } catch {}
    const prevPath = currentRenderedPath;
    currentRenderedPath = targetPath;

    // 1. Title
    document.title = newDoc.title;

    // 2. Push history state
    if (pushState) {
      window.history.pushState({ path: targetPath }, newDoc.title, targetPath);
    }

    const normPrev = normalizeRoutePath(prevPath);
    const normTarget = normalizeRoutePath(targetPath);

    // 3. Clean up previous route timers, media players & WebGL loops
    if (heroTimer) {
      clearTimeout(heroTimer);
      heroTimer = null;
    }
    if (normPrev.startsWith('/watch/') || !normTarget.startsWith('/watch/')) {
      try { cleanupWatchPlayer(); } catch (e) {}
    }
    if (normPrev.startsWith('/search') && !normTarget.startsWith('/search')) {
      try { if (typeof window.destroyFlicxLightPillar === 'function') window.destroyFlicxLightPillar(); } catch (e) {}
    }
    closeSettingsModal(null, true);
    closeTrailerModal(true);
    closeNotifications(true);
    closeCurrentPopup();

    const isTargetWatch = normTarget.startsWith('/watch/');
    const currentHeader = document.querySelector('.site-header, header');
    const newHeader = newDoc.querySelector('.site-header, header');
    const currentTabBar = document.querySelector('nav.tab-bar');
    const newTabBar = newDoc.querySelector('nav.tab-bar');
    const currentFooter = document.querySelector('footer');
    const newFooter = newDoc.querySelector('footer');
    const currentMain = document.querySelector('main');
    const newMain = newDoc.querySelector('main');
    const currentWatchRoot = document.querySelector('.watch-root');
    const newWatchRoot = newDoc.querySelector('.watch-root');

    if (document.body) {
      document.body.classList.toggle('kaira-watching', isTargetWatch);
    }

    if (isTargetWatch) {
      if (currentHeader) currentHeader.style.display = 'none';
      if (currentTabBar) currentTabBar.style.display = 'none';
      if (currentFooter) currentFooter.style.display = 'none';
      if (currentMain) currentMain.style.display = 'none';

      let watchContainer = document.querySelector('.watch-root');
      if (!watchContainer) {
        watchContainer = document.createElement('div');
        watchContainer.className = 'watch-root';
        document.body.prepend(watchContainer);
      }
      watchContainer.style.display = 'block';
      if (newWatchRoot) {
        watchContainer.innerHTML = newWatchRoot.innerHTML;
      }
    } else {
      if (currentWatchRoot) {
        currentWatchRoot.style.display = 'none';
        currentWatchRoot.innerHTML = '';
      }

      if (!currentHeader && newHeader) {
        document.body.prepend(newHeader);
      } else if (currentHeader) {
        currentHeader.style.display = '';
      }

      if (currentMain && newMain) {
        currentMain.style.display = '';
        currentMain.replaceWith(newMain);
      } else if (newMain) {
        const header = document.querySelector('.site-header, header');
        if (header && header.nextSibling) {
          header.parentNode.insertBefore(newMain, header.nextSibling);
        } else {
          document.body.appendChild(newMain);
        }
      }

      if (!currentFooter && newFooter) {
        document.body.appendChild(newFooter);
      } else if (currentFooter) {
        currentFooter.style.display = '';
      }

      if (!currentTabBar && newTabBar) {
        document.body.appendChild(newTabBar);
      } else if (currentTabBar) {
        currentTabBar.style.display = '';
        // Sync filled vs outlined tab icons from the newly fetched page's tab bar
        if (newTabBar) {
          const newIconsByHref = new Map();
          newTabBar.querySelectorAll('a[href]').forEach(link => {
            const norm = normalizeRoutePath(link.getAttribute('href'));
            const svg = link.querySelector('svg');
            if (norm && svg) newIconsByHref.set(norm, svg.outerHTML);
          });
          currentTabBar.querySelectorAll('a[href]').forEach(link => {
            const norm = normalizeRoutePath(link.getAttribute('href'));
            const nextSvgHtml = newIconsByHref.get(norm);
            const curSvg = link.querySelector('svg');
            if (nextSvgHtml && curSvg) {
              curSvg.outerHTML = nextSvgHtml;
            }
          });
        }
      }
    }

    // 4. Update Navigation active tabs
    updateActiveNavTabs(targetPath);

    // 5. Scroll to top
    window.scrollTo(0, 0);

    // 6. Reinitialize page features
    reinitPageFeatures();
  }

  function normalizeRoutePath(rawPath) {
    let p = String(rawPath || '/').split('?')[0].split('#')[0];
    const base = typeof window.__KAIRA_BASE_PATH__ === 'string' ? window.__KAIRA_BASE_PATH__ : '/';
    if (base && base !== '/') {
      const cleanBase = base.replace(/\/$/, '');
      if (p === cleanBase || p === cleanBase + '/') {
        p = '/';
      } else if (p.startsWith(cleanBase + '/')) {
        p = p.slice(cleanBase.length);
      }
    }
    p = p.replace(/\/$/, '') || '/';
    return p;
  }

  function updateActiveNavTabs(currentPath) {
    const cleanCurrent = normalizeRoutePath(currentPath || window.location.pathname || '/');
    document.querySelectorAll('.top-tabs a, .top-nav a, nav[aria-label="Primary"] a, nav.tab-bar a, .site-header a').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (a.classList.contains('flicx-logo-link') || a.getAttribute('aria-label') === 'Kaira home') return;

      const cleanHref = normalizeRoutePath(href);
      const inMobileTabBar = Boolean(a.closest('nav.tab-bar'));

      let isActive = false;
      if (cleanHref === '/') {
        isActive = cleanCurrent === '/';
      } else if (inMobileTabBar && cleanHref === '/discover') {
        isActive =
          cleanCurrent === '/discover' ||
          cleanCurrent.startsWith('/discover/') ||
          cleanCurrent.startsWith('/genres/') ||
          cleanCurrent === '/movies' ||
          cleanCurrent.startsWith('/movies/');
      } else {
        isActive = cleanCurrent === cleanHref || cleanCurrent.startsWith(cleanHref + '/');
      }

      if (isActive) {
        a.classList.add('active', 'text-white');
        a.setAttribute('aria-current', 'page');
      } else {
        a.classList.remove('active', 'text-white');
        a.removeAttribute('aria-current');
      }

      if (inMobileTabBar) {
        const existingPills = a.querySelectorAll('span.kaira-tab-pill, span.absolute.inset-0');
        if (isActive) {
          a.classList.add('text-fg');
          a.classList.remove('text-fg-subtle');
          if (existingPills.length === 0) {
            const pill = document.createElement('span');
            pill.className = 'kaira-tab-pill absolute inset-0 rounded-[calc(1.375rem*var(--corner-scale,1))] bg-white/12';
            a.prepend(pill);
          } else {
            existingPills[0].classList.add('kaira-tab-pill');
            for (let i = 1; i < existingPills.length; i++) existingPills[i].remove();
          }
        } else {
          a.classList.remove('text-fg');
          a.classList.add('text-fg-subtle');
          existingPills.forEach(p => p.remove());
        }
      }
    });
  }

  let toTopBound = false;
  function syncToTopVisibility() {
    const show = window.scrollY > 360;
    document.querySelectorAll('button.to-top').forEach(btn => {
      if (show) {
        btn.setAttribute('data-shown', '');
        btn.setAttribute('tabindex', '0');
      } else {
        btn.removeAttribute('data-shown');
        btn.setAttribute('tabindex', '-1');
      }
    });
  }

  function initBackToTopButton() {
    syncToTopVisibility();
    if (toTopBound) return;
    toTopBound = true;
    window.addEventListener('scroll', syncToTopVisibility, { passive: true });
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button.to-top');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function reinitPageFeatures() {
    try { rewriteProxyImagesInDom(document); } catch (e) {}
    try { applyLiquidChromeAttributes(); } catch (e) {}
    try { updateActiveNavTabs(window.location.pathname); } catch (e) {}
    closeCurrentPopup();

    try { initHeroCarousel(); } catch (e) { console.error(e); }
    try { initContinueWatching(); } catch (e) { console.error(e); }
    try { initRailScroll(); } catch (e) { console.error(e); }
    try { initWatchlist(); } catch (e) { console.error(e); }
    try { renderLibraryPage(); } catch (e) { console.error(e); }
    try { initWatchPlayer(); } catch (e) { console.error(e); }
    try { initDetailPageControls(); } catch (e) { console.error(e); }
    try { initTitleSelect(); } catch (e) { console.error(e); }
    try { initDiscoverPage(); } catch (e) { console.error(e); }
    try { initSearchPage(); } catch (e) { console.error(e); }
    try { initAnimatedLogoHover(); } catch (e) { console.error(e); }
    try { initBackToTopButton(); } catch (e) { console.error(e); }
  }

  let transitionsInitialized = false;
  function initPageTransitions() {
    if (transitionsInitialized) return;
    transitionsInitialized = true;

    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      if (e.target.closest('button, input, select, textarea, [data-watchlist-button], .cover-add, .watch-server-btn, .watch-fs-btn, .settings-btn, .notes-bell, .hero-switch-bar, .hero-pause, .select-option, .title-select, .select-trigger, .dl-file-btn, .to-top')) {
        return;
      }

      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
        return;
      }

      if (link.getAttribute('target') === '_blank' || link.hasAttribute('download')) {
        return;
      }

      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) {
          return;
        }

        const personQuery = parsePersonRouteToSearchQuery(url.pathname);
        if (personQuery) {
          e.preventDefault();
          navigateTo(withBasePath(`/search?q=${encodeURIComponent(personQuery)}`));
          return;
        }

        stashCardMetaFromElement(link, url.pathname);
        e.preventDefault();
        navigateTo(url.pathname + url.search);
      } catch (err) {}
    }, true);

    window.addEventListener('popstate', () => {
      navigateTo(window.location.pathname + window.location.search, false);
    });

    window.addEventListener('pageshow', () => {
      updateActiveNavTabs(window.location.pathname);
      refreshContinueWatchingUI();
    });

    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.includes('/person/')) return;
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin === window.location.origin) {
          const path = url.pathname + url.search;
          if (!pageCache.has(path)) {
            fetchPageHtml(path).catch(() => {});
          }
        }
      } catch (err) {}
    }, { passive: true });
  }

  // --- Bootstrap on load ---
  function bootstrap() {
    // Restore deep links redirected via GitHub Pages 404.html
    try {
      const ghRedirect = sessionStorage.getItem('kaira:gh-redirect');
      if (ghRedirect) {
        sessionStorage.removeItem('kaira:gh-redirect');
        if (ghRedirect !== window.location.pathname + window.location.search + window.location.hash) {
          window.history.replaceState({ path: ghRedirect }, '', ghRedirect);
          currentRenderedPath = window.location.pathname + window.location.search;
        }
      }
    } catch {}

    try { rewriteProxyImagesInDom(document); } catch (e) {}
    try { injectLiquidGlassStyles(); applyLiquidChromeAttributes(); } catch (e) { console.error('Liquid glass error', e); }

    // Guard direct deep-links / reloads on static hosts (e.g. Firebase Hosting ** -> /index.html)
    let initialDynamicHydrate = null;
    try {
      const currentRaw = window.location.pathname + window.location.search;
      const canonical = canonicalizeAliasRoute(currentRaw);
      if (canonical !== currentRaw) {
        window.history.replaceState({ path: canonical }, '', canonical);
        currentRenderedPath = canonical;
      }
      const initialDynRoute = parseDynamicRoute(window.location.pathname);
      if (initialDynRoute && !isValidRouteDoc(document, window.location.pathname)) {
        const built = buildFallbackDocumentForDynamicRoute(initialDynRoute);
        const dynMain = built?.doc?.querySelector('main');
        const curMain = document.querySelector('main');
        if (dynMain && curMain) {
          curMain.replaceWith(dynMain);
          document.title = built.doc.title;
          initialDynamicHydrate = built.hydrate;
        }
      }
    } catch (e) { console.error('Dynamic route bootstrap error', e); }

    try { updateActiveNavTabs(window.location.pathname); } catch (e) { console.error('Nav tab sync error', e); }
    try { getSettingsState(); } catch (e) { console.error('Settings init error', e); }
    try { initHeroCarousel(); } catch (e) { console.error('Hero init error', e); }
    try { initContinueWatching(); } catch (e) { console.error('ContinueWatching error', e); }
    try { initCardNavigation(); } catch (e) { console.error('Card nav error', e); }
    try { initRailScroll(); } catch (e) { console.error('Rail scroll error', e); }
    try { initWatchlist(); } catch (e) { console.error('Watchlist error', e); }
    try { renderLibraryPage(); } catch (e) { console.error('Library error', e); }
    try { initWatchPlayer(); } catch (e) { console.error('Watch player error', e); }
    try { initDetailPageControls(); } catch (e) { console.error('Detail controls error', e); }
    try { initTitleSelect(); } catch (e) { console.error('TitleSelect error', e); }
    try { initDiscoverPage(); } catch (e) { console.error('Discover error', e); }
    try { initSearchPage(); } catch (e) { console.error('SearchPage error', e); }
    try { initAnimatedLogoHover(); } catch (e) { console.error('LogoHover error', e); }
    try { initBackToTopButton(); } catch (e) { console.error('BackToTop error', e); }
    try { initPageTransitions(); } catch (e) { console.error('PageTransitions error', e); }

    if (typeof initialDynamicHydrate === 'function') {
      initialDynamicHydrate();
    }

    // Wire Settings & Notification header buttons (strictly excluding controls inside the modals themselves)
    document.addEventListener('click', (e) => {
      if (e.target.closest('#flicx-settings-dialog, #flicx-settings-backdrop, .set-close, #flicx-notes-popover, .notes-close')) {
        return;
      }

      const settingBtn = e.target.closest('button[aria-label*="Setting"], button[aria-label*="setting"], .settings-btn');
      if (settingBtn) {
        e.preventDefault();
        e.stopPropagation();
        openSettingsModal();
        return;
      }

      const notifBtn = e.target.closest('button[aria-label*="Notification"], button[aria-label*="notification"], .notes-bell');
      if (notifBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleNotifications();
        return;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
