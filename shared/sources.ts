// Listing sources the app accepts. Each source knows how to recognise its
// listing URLs and which hosts serve its photos (the backend downloads photos,
// so this allowlist is what keeps agent-supplied URLs from reaching anything else).

export type ResolvedListingUrl = {
  source: string;
  externalId: string;
  canonicalUrl: string;
};

type ListingSource = {
  id: string;
  hostPattern: RegExp;
  photoHostPattern: RegExp;
  externalId(url: URL): string | null;
  canonicalUrl(externalId: string): string;
  /** The same photo at the largest size the image host serves. */
  fullSizePhoto(url: URL): string;
};

// The one listing site Pitlane reads today. Tests and fixtures build their URLs
// from it rather than repeating its host.
export const listingSite: ListingSource = {
  id: "mobile.de",
  hostPattern: /(^|\.)mobile\.de$/,
  photoHostPattern: /(^|\.)classistatic\.de$/,
  externalId(url) {
    // Desktop share links: /fahrzeuge/details.html?id=10000000000001
    const idParam = url.searchParams.get("id");
    if (idParam && /^\d{6,}$/.test(idParam)) return idParam;
    // Slug links: /auto-inserat/<slug>/10000000000001.html
    return url.pathname.match(/[/-](\d{6,})\.html$/)?.[1] ?? null;
  },
  canonicalUrl: (id) => `https://suchen.mobile.de/fahrzeuge/details.html?id=${id}`,
  // The size is in the `rule` parameter, e.g. ?rule=mo-640.jpg.
  fullSizePhoto(url) {
    url.search = url.search.replace(/rule=mo-\d+/, "rule=mo-1600");
    return url.href;
  },
};

const sources = [listingSite];

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function resolveListingUrl(raw: string): ResolvedListingUrl | null {
  const url = parseUrl(raw);
  if (!url) return null;
  for (const source of sources) {
    if (!source.hostPattern.test(url.hostname)) continue;
    const externalId = source.externalId(url);
    if (externalId) {
      return { source: source.id, externalId, canonicalUrl: source.canonicalUrl(externalId) };
    }
  }
  return null;
}

export function isAllowedPhotoUrl(sourceId: string, raw: string): boolean {
  const url = parseUrl(raw);
  const source = sources.find((s) => s.id === sourceId);
  return !!url && !!source && url.protocol === "https:" && source.photoHostPattern.test(url.hostname);
}

/** The full-size URL of a photo from the source's image host, or null for any other URL. */
export function fullSizePhotoUrl(sourceId: string, raw: string): string | null {
  const source = sources.find((s) => s.id === sourceId);
  if (!source || !isAllowedPhotoUrl(sourceId, raw)) return null;
  return source.fullSizePhoto(new URL(raw));
}
