/**
 * Parsing helpers for Spotify's official embed widgets.
 *
 * Key idea: never rebuild the embed URL from scratch. Spotify share links
 * carry a "si" token (and sometimes other params) that some content —
 * especially personalized/algorithmic playlists — actually needs to load
 * correctly. If we strip it and reconstruct our own URL, Spotify can
 * respond with "Page not available". So instead we extract whatever URL
 * the user pasted (from a raw link or from an <iframe src="...">) and use
 * it verbatim, only rewriting a bare share link into its /embed/ form.
 */

const TYPES = ["track", "album", "playlist", "episode", "show", "artist"];
const TYPE_PATTERN = new RegExp(`\\/(${TYPES.join("|")})\\/([a-zA-Z0-9]+)`);

// Recommended embed heights per content type (px).
const EMBED_HEIGHTS = {
  track: 352,
  episode: 232,
  show: 232,
  album: 352,
  playlist: 352,
  artist: 352,
};

/** Human-readable Russian labels for each Spotify content type. */
export const TYPE_LABELS = {
  track: "Трек",
  album: "Альбом",
  playlist: "Плейлист",
  episode: "Эпизод",
  show: "Подкаст",
  artist: "Артист",
};

/** Returns the recommended iframe height for a content type. */
export const getEmbedHeight = (type) => EMBED_HEIGHTS[type] ?? 352;

/**
 * Pulls the raw open.spotify.com URL out of either a full <iframe> snippet
 * or plain pasted text/link. Decodes stray HTML entities (&amp;) that can
 * show up if someone copies markup rather than the live DOM attribute.
 */
const extractRawUrl = (raw) => {
  const decoded = raw.replace(/&amp;/g, "&");

  const srcMatch = decoded.match(/src\s*=\s*["']([^"']+)["']/i);
  if (srcMatch && srcMatch[1].includes("open.spotify.com")) {
    return srcMatch[1];
  }

  const urlMatch = decoded.match(/https?:\/\/open\.spotify\.com\/[^\s"'<>]+/i);
  return urlMatch ? urlMatch[0] : null;
};

/**
 * Parses pasted input (share link or full iframe embed code) into a
 * track descriptor: { type, id, embedUrl }. Returns null when nothing
 * recognizable is found. embedUrl is the exact URL to put in the iframe.
 */
export const parseSpotifyInput = (raw) => {
  if (!raw) return null;

  const rawUrl = extractRawUrl(raw);
  if (!rawUrl) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.hostname !== "open.spotify.com") return null;

  const typeMatch = url.pathname.match(TYPE_PATTERN);
  if (!typeMatch) return null;
  const [, type, id] = typeMatch;

  const isAlreadyEmbed = url.pathname.startsWith("/embed/");

  if (isAlreadyEmbed) {
    // Already an embed URL (from an <iframe src>, or a copied embed link).
    // Use it exactly as given — this is what makes "paste the working
    // iframe" behave identically to embedding it directly on a page.
    return { type, id, embedUrl: url.toString() };
  }

  // Bare share link (e.g. open.spotify.com/playlist/ID?si=...): rewrite
  // the path to /embed/..., but keep every existing query param (si etc.)
  // untouched, only adding utm_source if the link doesn't already have one.
  url.pathname = `/embed${url.pathname}`;
  if (!url.searchParams.has("utm_source")) {
    url.searchParams.set("utm_source", "generator");
  }

  return { type, id, embedUrl: url.toString() };
};

/**
 * Best-effort lookup of a track's real title via Spotify's public oEmbed
 * endpoint. Runs client-side in the visitor's browser; if it fails (offline,
 * blocked, rate-limited) the caller falls back to a generic placeholder
 * title that the user can rename manually.
 */
export const fetchOEmbedTitle = async ({ type, id }) => {
  const pageUrl = `https://open.spotify.com/${type}/${id}`;
  try {
    const response = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(pageUrl)}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.title ?? null;
  } catch {
    return null;
  }
};
