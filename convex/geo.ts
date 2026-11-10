import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { point } from "./validators";

// Seller locations and the user's home become coordinates through OpenStreetMap's
// Nominatim. Its results may be stored, unlike Mapbox's free geocoding. Its usage policy
// asks for an identifying User-Agent and at most one request per second
// (https://operations.osmfoundation.org/policies/nominatim/). Seller lookups go through
// one queue (below) to keep to that.
const searchUrl = "https://nominatim.openstreetmap.org/search";
const userAgent = "Pitlane/1.0 (personal car watchlist)";

const results = z.array(z.object({ lat: z.coerce.number(), lon: z.coerce.number(), display_name: z.string() }));

// Null when nothing matches; throws when the geocoder cannot be reached or answers oddly,
// so the caller can try again later instead of recording "not found".
export async function geocode(query: string, country?: string) {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1" });
  if (country) params.set("countrycodes", country.toLowerCase());
  const response = await fetch(`${searchUrl}?${params}`, {
    headers: { "user-agent": userAgent, "accept-language": "en" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Geocoder answered HTTP ${response.status}`);
  const [hit] = results.parse(await response.json());
  return hit ? { lat: hit.lat, lng: hit.lon, place: hit.display_name } : null;
}

// Run every minute by convex/crons.ts. Works through the queued seller locations one per
// second; stops at the first failure and leaves the rest queued for the next run.
export const locatePending = internalAction({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.runQuery(internal.geo.pending, {});
    for (const [index, { listingId, location, country }] of pending.entries()) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1_100));
      let found;
      try {
        found = await geocode(location, country);
      } catch (error) {
        console.warn(`Geocoding stopped at "${location}":`, error instanceof Error ? error.message : error);
        return;
      }
      await ctx.runMutation(internal.geo.settle, {
        listingId,
        location,
        country,
        geo: found && { lat: found.lat, lng: found.lng },
      });
    }
  },
});

export const pending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_geo_pending", (q) => q.eq("geoPending", true))
      .take(20);
    return listings.flatMap(({ _id, current: { seller } }) =>
      seller.location ? [{ listingId: _id, location: seller.location, country: seller.country }] : [],
    );
  },
});

export const settle = internalMutation({
  args: {
    listingId: v.id("listings"),
    location: v.string(),
    country: v.optional(v.string()),
    geo: v.union(point, v.null()),
  },
  handler: async (ctx, { listingId, location, country, geo }) => {
    const listing = await ctx.db.get(listingId);
    // A save during the lookup may have moved the seller; that location is queued anew.
    const { seller } = listing?.current ?? {};
    if (!listing || seller?.location !== location || seller.country !== country) return;
    await ctx.db.patch(listingId, { geo, geoPending: undefined });
  },
});
