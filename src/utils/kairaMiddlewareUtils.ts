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
 * Strips unused Next.js preload links that trigger console warnings, cleans leftover
 * "Flicx" branding strings in visible copy, and ensures the interactive runtime script is injected.
 */
export function prepareServedHtml(html: string): string {
  let out = html;
  // Remove unused preloaded Next.js chunk link tag that causes console warnings on every page
  out = out.replace(/<link[^>]*rel=["']preload["'][^>]*href=["']\/_next\/static\/chunks\/3bep5nso12chb\.js["'][^>]*\/?>/gi, '');
  // Normalize leftover visible Flicx branding text and social preview assets to Kaira
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
