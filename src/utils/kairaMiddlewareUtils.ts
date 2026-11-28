import path from 'path';

const ALLOWED_IMAGE_HOSTS = new Set([
  's.fli.cx',
  'fli.cx',
  'image.tmdb.org',
  'i.ytimg.com',
  'img.youtube.com',
  'm.media-amazon.com',
]);

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
  /^fc/i,
  /^fd/i,
  /^fe80:/i,
];

/**
 * Validates that an image proxy target URL uses https, points to an allowlisted
 * media host, and is not a loopback/private/metadata IP.
 */
export function isAllowedImageUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (PRIVATE_IP_PATTERNS.some((re) => re.test(host))) return false;
    return ALLOWED_IMAGE_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * Resolves a route segment safely inside baseDir, rejecting path traversal,
 * null bytes, or characters outside safe URL route segments.
 */
export function resolveSafePublicPath(baseDir: string, cleanPath: string): string | null {
  if (!cleanPath || typeof cleanPath !== 'string') return null;
  if (cleanPath.includes('\0') || cleanPath.includes('..') || cleanPath.includes('\\')) {
    return null;
  }
  if (!/^[a-zA-Z0-9/_-]+$/.test(cleanPath)) {
    return null;
  }
  const normalizedBase = path.resolve(baseDir);
  const resolved = path.resolve(normalizedBase, cleanPath);
  if (resolved === normalizedBase || !resolved.startsWith(normalizedBase + path.sep)) {
    return null;
  }
  return resolved;
}

export interface ExtractedTitleMetadata {
  slug: string;
  id: string | null;
  imdbId: string | null;
  title: string;
  year: string;
  kind: 'movie' | 'show';
  trailerId: string | null;
  trailers: string[];
  poster: string | null;
  description?: string;
  rating?: string;
  genres?: string[];
}

/**
 * Parses a scraped Kaira/Flicx detail HTML page to extract the canonical IMDb ID,
 * clean title (without trailing year duplication), release year, kind, and YouTube trailer IDs.
 */
export function extractTitleMetadataFromHtml(
  html: string,
  slug: string,
  fallbackKind: 'movie' | 'show' = 'movie'
): ExtractedTitleMetadata {
  let id: string | null = null;
  let title = '';
  let year = '';
  let kind: 'movie' | 'show' = fallbackKind;
  let poster: string | null = null;
  let description = '';
  let rating = '';
  let genres: string[] = [];

  // 1. Try JSON-LD first for authoritative title, datePublished, and type
  const ldMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1]);
      if (ld && typeof ld === 'object') {
        if (typeof ld.name === 'string' && ld.name.trim()) {
          title = ld.name.trim();
        }
        if (typeof ld.datePublished === 'string') {
          const ym = ld.datePublished.match(/^(\d{4})/);
          if (ym) year = ym[1];
        }
        if (ld['@type'] === 'TVSeries') {
          kind = 'show';
        } else if (ld['@type'] === 'Movie') {
          kind = 'movie';
        }
        if (typeof ld.image === 'string') {
          poster = ld.image;
          const imgId = ld.image.match(/\/(tt\d+)\//);
          if (imgId) id = imgId[1];
        }
        if (typeof ld.description === 'string' && ld.description.trim()) {
          description = ld.description.trim();
        }
        if (ld.aggregateRating && ld.aggregateRating.ratingValue != null) {
          const num = Number(ld.aggregateRating.ratingValue);
          if (Number.isFinite(num) && num > 0) {
            rating = num.toFixed(1);
          }
        }
        if (Array.isArray(ld.genre)) {
          genres = ld.genre.filter((g: unknown): g is string => typeof g === 'string' && g.trim().length > 0).slice(0, 4);
        } else if (typeof ld.genre === 'string' && ld.genre.trim()) {
          genres = [ld.genre.trim()];
        }
      }
    } catch {
      // Ignore malformed JSON-LD and fall through to regex extraction
    }
  }

  // 2. Extract IMDb ID from rate-* or poster/logo URLs if not yet found
  if (!id) {
    const rateMatch = html.match(/id=["']rate-(tt\d+)["']/);
    if (rateMatch) {
      id = rateMatch[1];
    } else {
      const assetMatch = html.match(/s\.fli\.cx\/a\/(?:poster|logo|background)\/[^/"']+\/(tt\d+)\//);
      if (assetMatch) id = assetMatch[1];
    }
  }

  // 3. Extract YouTube trailer IDs from /y/vi/<YT_ID>/ thumbnails
  const trailerSet = new Set<string>();
  const ytRegex = /\/y\/vi\/([A-Za-z0-9_-]{6,20})\//g;
  let ytMatch: RegExpExecArray | null;
  while ((ytMatch = ytRegex.exec(html)) !== null) {
    trailerSet.add(ytMatch[1]);
  }
  const trailers = Array.from(trailerSet);

  // 4. Clean fallback title and year from slug if still missing
  const slugYearMatch = slug.match(/-(\d{4})$/);
  if (!year && slugYearMatch) {
    year = slugYearMatch[1];
  }
  if (!title) {
    const titlePart = slugYearMatch ? slug.slice(0, -5) : slug;
    title = titlePart
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  if (!poster && id) {
    poster = `https://s.fli.cx/a/poster/medium/${id}/img`;
  }

  return {
    slug,
    id,
    imdbId: id,
    title,
    year,
    kind,
    trailerId: trailers[0] || null,
    trailers,
    poster,
    ...(description ? { description } : {}),
    ...(rating ? { rating } : {}),
    ...(genres.length ? { genres } : {}),
  };
}

/**
 * Validates that an HTML document for /movie/<slug> or /tv/<slug> is a real
 * detail page rather than a Next.js __next_error__ shell or homepage rewrite.
 */
export function isValidDetailPageHtml(html: string): boolean {
  if (!html || typeof html !== 'string') return false;
  if (html.includes('id="__next_error__"') || html.includes("id='__next_error__'")) {
    return false;
  }
  if (html.includes('hero-switch')) {
    return false;
  }
  return /<article[\s>]/i.test(html);
}

/**
 * Validates any cached or upstream-fetched HTML page before serving or caching it to disk.
 * Rejects Next.js error shells, pages missing <main> (except /watch/*), homepage clones on
 * non-browse routes, and invalid movie/TV detail documents.
 */
export function isValidAppPageHtml(html: string, cleanPath: string): boolean {
  if (!html || typeof html !== 'string') return false;
  if (html.includes('id="__next_error__"') || html.includes("id='__next_error__'")) {
    return false;
  }
  const normalized = String(cleanPath || '').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (normalized.startsWith('watch/')) {
    return html.includes('watch-root') || /<body[\s>]/i.test(html);
  }
  if (/^(movie|tv)\/[^/]+$/.test(normalized)) {
    return isValidDetailPageHtml(html);
  }
  if (!/<main[\s>]/i.test(html)) {
    return false;
  }
  const allowsHeroSwitch =
    normalized === '' ||
    normalized === 'index.html' ||
    normalized === 'movies' ||
    normalized === 'tv';
  if (!allowsHeroSwitch && html.includes('hero-switch')) {
    return false;
  }
  return true;
}

const KAIRA_HOME_LOGO_HTML =
  '<a aria-label="Kaira home" class="flicx-logo-link flex items-center justify-center rounded-[0.625rem]" style="width:3.1rem;height:3.1rem;" href="/">' +
  '<svg class="mark" style="width:3.1rem;height:3.1rem;display:block;" viewBox="0 0 796 757" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<defs>' +
  '<linearGradient id="paint0_linear_2393_3956" x1="73.5" y1="0" x2="73.5" y2="453" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0.5"/><stop offset="1" stop-color="#F25C05"/></linearGradient>' +
  '<linearGradient id="paint1_linear_2393_3956" x1="72.5" y1="0" x2="72.5" y2="269" gradientUnits="userSpaceOnUse"><stop stop-color="#F25C05"/><stop offset="1" stop-color="white"/></linearGradient>' +
  '<linearGradient id="paint2_linear_2393_3956" x1="72.5" y1="0" x2="72.5" y2="269" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0.5"/><stop offset="1" stop-color="#F25C05" stop-opacity="0"/></linearGradient>' +
  '<linearGradient id="paint3_linear_2393_3956" x1="147.75" y1="0" x2="147.75" y2="386.5" gradientUnits="userSpaceOnUse"><stop stop-color="#F25C05"/><stop offset="1" stop-color="white"/></linearGradient>' +
  '<linearGradient id="paint4_linear_2393_3956" x1="147.75" y1="0" x2="147.75" y2="386.5" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0.5"/><stop offset="1" stop-color="#F25C05" stop-opacity="0"/></linearGradient>' +
  '</defs>' +
  '<g id="kaira-mark">' +
  '<rect id="Rectangle_22048" transform="translate(195 150)" x="0.5" y="0.5" width="146" height="452" rx="73" fill="#F25C05" stroke="url(#paint0_linear_2393_3956)"/>' +
  '<path id="Union" transform="translate(196 333)" d="M144.5 195.616C144.5 235.874 112.259 268.5 72.5 268.5C32.7414 268.5 0.500104 235.874 0.5 195.616V181.902C38.0057 125.417 93.8697 47.5687 144.5 1.13867V195.616Z" fill="url(#paint1_linear_2393_3956)" fill-opacity="0.5" stroke="url(#paint2_linear_2393_3956)"/>' +
  '<path id="Rectangle_22049" transform="translate(341 234)" d="M69.3506 30.9248C86.8558 13.564 114.469 11.7324 134.114 26.6279L244.233 110.122C269.874 129.564 270.442 167.917 245.387 188.108L81.0605 320.534C48.6786 346.63 0.500306 323.58 0.5 281.992V99.209L69.3506 30.9248Z" fill="url(#paint3_linear_2393_3956)" stroke="url(#paint4_linear_2393_3956)"/>' +
  '</g></svg></a>';

/**
 * Strips unused Next.js preload links that trigger console warnings, cleans leftover
 * "Flicx" branding strings in visible copy, and ensures the interactive runtime script is injected.
 */
export function prepareServedHtml(html: string): string {
  let out = html;
  // Remove unused preloaded Next.js chunk link tag that causes console warnings on every page
  out = out.replace(/<link[^>]*rel=["']preload["'][^>]*href=["']\/_next\/static\/chunks\/3bep5nso12chb\.js["'][^>]*\/?>/gi, '');
  // Normalize leftover visible Flicx branding text, header logo, and social preview assets to Kaira
  out = out.replace(/<a[^>]*aria-label=["']Flicx home["'][^>]*>[\s\S]*?<\/a>/gi, KAIRA_HOME_LOGO_HTML);
  out = out.replace(/·\s*Flicx<\/title>/gi, '· Kaira</title>');
  out = out.replace(/Popular on Flicx/g, 'Popular on Kaira');
  out = out.replace(/On Flicx since/g, 'On Kaira since');
  out = out.replace(/Watch on Flicx/g, 'Watch on Kaira');
  out = out.replace(/https:\/\/fli\.cx\/opengraph-image(?:\?[^"'\s<>\\]*)?/gi, '/brand/og-image.png');
  out = out.replace(/<link[^>]*rel=["']alternate["'][^>]*href=["']https:\/\/fli\.cx\/feed\.xml["'][^>]*\/?>/gi, '');
  if (!out.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')) {
    out = out.replace(
      '</head>',
      '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9047551447187712" crossorigin="anonymous"></script></head>'
    );
  }
  if (!out.includes('flicx-interactive.js')) {
    out = out.replace('</body>', '<script src="/flicx-interactive.js"></script></body>');
  }
  return out;
}
