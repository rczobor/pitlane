import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { appError } from "./errors";
import { resolveSpecs } from "./keySpecs";
import { listingDataValidator } from "./validators";
import { isAllowedPhotoUrl, resolveListingUrl } from "../shared/sources";

type ListingData = Infer<typeof listingDataValidator>;

const tierOrder: Doc<"boardItems">["tier"][] = ["S", "A", "B", "watching", "rejected"];

export const save = internalMutation({
  args: {
    boardId: v.id("boards"),
    capturedBy: v.string(),
    url: v.string(),
    data: listingDataValidator,
    // A re-check only updates a car still on the board; one the user removed meanwhile stays gone.
    recheck: v.optional(v.boolean()),
  },
  handler: async (ctx, { boardId, capturedBy, url, data: captured, recheck }) => {
    const ref = resolveListingUrl(url);
    if (!ref) throw appError("invalid", "Not a supported listing URL");
    const badPhoto = captured.photoUrls.find((photoUrl) => !isAllowedPhotoUrl(ref.source, photoUrl));
    if (badPhoto) throw appError("invalid", `Photo URL is not on a ${ref.source} image host: ${badPhoto}`);

    const now = Date.now();
    const existing = await ctx.db
      .query("listings")
      .withIndex("by_source_external", (q) => q.eq("source", ref.source).eq("externalId", ref.externalId))
      .unique();
    if (recheck && !(existing && (await boardItem(ctx, boardId, existing._id)))) {
      throw appError("not_found", "This listing is no longer on the board. Skip it.");
    }

    // A capture without a translation (the extension, or an agent that skipped it) keeps the
    // one already saved, as long as the description it translates is unchanged.
    const kept =
      !captured.descriptionTranslation &&
      existing?.current.description === captured.description &&
      existing?.current.descriptionTranslation;
    const data = kept ? { ...captured, descriptionTranslation: kept } : captured;

    let listingId: Id<"listings">;
    let changed = true;
    let priceChange = null;
    if (existing) {
      listingId = existing._id;
      changed = existing.status !== "available" || fingerprint(existing.current) !== fingerprint(data);
      const before = existing.current.price;
      if (before.amount !== data.price.amount || before.currency !== data.price.currency) {
        priceChange = { from: before, to: data.price };
      }
      await ctx.db.patch(listingId, {
        status: "available",
        current: data,
        lastCheckedAt: now,
        removedAt: undefined,
        lastFailedCheckAt: undefined,
        failureReason: undefined,
        ...(changed && { lastChangedAt: now }),
        ...locateUpdate(existing, data.seller),
      });
    } else {
      listingId = await ctx.db.insert("listings", {
        source: ref.source,
        externalId: ref.externalId,
        url: ref.canonicalUrl,
        status: "available",
        current: data,
        firstSeenAt: now,
        lastCheckedAt: now,
        lastChangedAt: now,
        ...(data.seller.location && { geoPending: true }),
      });
    }

    if (changed) {
      await ctx.db.insert("snapshots", { listingId, capturedAt: now, capturedBy, status: "available", data });
    }
    await queuePhotos(ctx, listingId, data.photoUrls);
    await ensureOnBoard(ctx, boardId, listingId, capturedBy, now);
    return { listingId, created: !existing, changed, priceChange };
  },
});

// How often a saved, available listing is due for a re-check, and how long to wait after a
// check that could not read the page. Agents only re-check what is due, which keeps the
// load on the listing site to roughly one page view per car per day.
export const recheckEveryMs = 24 * 60 * 60 * 1000;
export const retryFailedAfterMs = 6 * 60 * 60 * 1000;

// A re-check that could not read the page (blocked, timed out). Recorded so it is retried
// later, and never taken to mean the ad is gone.
export const markFailed = internalMutation({
  args: { boardId: v.id("boards"), url: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { boardId, url, reason }) => {
    const listing = await onBoard(ctx, boardId, url);
    const now = Date.now();
    await ctx.db.patch(listing._id, { lastFailedCheckAt: now, failureReason: reason?.trim().slice(0, 200) || undefined });
    return { listingId: listing._id, retryAfter: now + retryFailedAfterMs };
  },
});

export const listDue = internalQuery({
  args: { boardId: v.id("boards"), now: v.number() },
  handler: (ctx, { boardId, now }) => dueListings(ctx, boardId, now),
});

export async function dueListings(ctx: QueryCtx, boardId: Id<"boards">, now: number) {
  const items = await ctx.db
    .query("boardItems")
    .withIndex("by_board", (q) => q.eq("boardId", boardId))
    .collect();
  const listings = await Promise.all(items.map((item) => ctx.db.get(item.listingId)));
  return listings
    .filter((l) => l !== null && l.status === "available")
    .filter((l) => now - l!.lastCheckedAt >= recheckEveryMs)
    .filter((l) => !l!.lastFailedCheckAt || now - l!.lastFailedCheckAt >= retryFailedAfterMs)
    .sort((a, b) => a!.lastCheckedAt - b!.lastCheckedAt)
    .slice(0, 10)
    .map((l) => ({ listingId: l!._id, url: l!.url, title: l!.current.title, lastCheckedAt: l!.lastCheckedAt }));
}

// The listing at this URL as last captured, or null when it is not on the board.
export async function findOnBoard(ctx: QueryCtx, boardId: Id<"boards">, url: string) {
  const ref = resolveListingUrl(url);
  const listing =
    ref &&
    (await ctx.db
      .query("listings")
      .withIndex("by_source_external", (q) => q.eq("source", ref.source).eq("externalId", ref.externalId))
      .unique());
  return listing && (await boardItem(ctx, boardId, listing._id)) ? listing : null;
}

async function onBoard(ctx: QueryCtx, boardId: Id<"boards">, url: string) {
  const listing = await findOnBoard(ctx, boardId, url);
  if (!listing) throw appError("not_found", "This listing is not on your board");
  return listing;
}

export const markRemoved = internalMutation({
  args: { boardId: v.id("boards"), capturedBy: v.string(), url: v.string() },
  handler: async (ctx, { boardId, capturedBy, url }) => {
    const listing = await onBoard(ctx, boardId, url);

    const now = Date.now();
    if (listing.status === "removed") {
      await ctx.db.patch(listing._id, { lastCheckedAt: now });
      return { listingId: listing._id, changed: false };
    }
    await ctx.db.patch(listing._id, { status: "removed", removedAt: now, lastCheckedAt: now, lastChangedAt: now });
    await ctx.db.insert("snapshots", { listingId: listing._id, capturedAt: now, capturedBy, status: "removed" });
    return { listingId: listing._id, changed: true };
  },
});

export const listForBoard = internalQuery({
  args: { boardId: v.id("boards") },
  handler: (ctx, { boardId }) => boardListings(ctx, boardId),
});

export const getForBoard = internalQuery({
  args: { boardId: v.id("boards"), listingId: v.string() },
  handler: (ctx, { boardId, listingId }) => listingDetail(ctx, boardId, listingId),
});

// The board in tier order, with what a card needs: specs without the options list, and a cover photo.
export async function boardListings(ctx: QueryCtx, boardId: Id<"boards">) {
  const items = await ctx.db
    .query("boardItems")
    .withIndex("by_board", (q) => q.eq("boardId", boardId))
    .collect();
  items.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier) || a.rank - b.rank);
  const board = (await ctx.db.get(boardId))!;
  const modelIds = new Set((board.models ?? []).map((m) => m.id));
  return Promise.all(
    items.map(async (item) => {
      const listing = (await ctx.db.get(item.listingId))!;
      const { options: _, ...specs } = listing.current.details;
      // The first price seen, so cards can show how far it has moved.
      const firstPrice = (
        await ctx.db
          .query("snapshots")
          .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
          .filter((q) => q.neq(q.field("data"), undefined))
          .first()
      )?.data?.price;
      const cover = await ctx.db
        .query("photos")
        .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
        .filter((q) => q.eq(q.field("status"), "stored"))
        .first();
      return {
        listingId: listing._id,
        url: listing.url,
        tier: item.tier,
        rank: item.rank,
        status: listing.status,
        title: listing.current.title,
        price: listing.current.price,
        specs,
        location: listing.current.seller.location,
        // Some sites prefix the postcode with the country ("DE-30655 Hannover").
        country: listing.current.seller.country ?? listing.current.seller.location?.match(/^([A-Z]{2})-/)?.[1],
        geo: listing.geo ?? null,
        // A deleted model leaves its cars without one.
        modelId: item.modelId && modelIds.has(item.modelId) ? item.modelId : null,
        keySpecs: resolveSpecs(board, item, listing),
        coverUrl: cover?.storageId ? await ctx.storage.getUrl(cover.storageId) : null,
        firstPrice: firstPrice ?? listing.current.price,
        notes: item.notes ?? "",
        pros: item.pros ?? [],
        cons: item.cons ?? [],
        firstSeenAt: listing.firstSeenAt,
        lastCheckedAt: listing.lastCheckedAt,
        removedAt: listing.removedAt,
      };
    }),
  );
}

// Null when the id is malformed or the listing is not on this board.
export async function listingDetail(ctx: QueryCtx, boardId: Id<"boards">, rawId: string) {
  const listingId = ctx.db.normalizeId("listings", rawId);
  const item = listingId && (await boardItem(ctx, boardId, listingId));
  if (!listingId || !item) return null;

  const listing = (await ctx.db.get(listingId))!;
  const board = (await ctx.db.get(boardId))!;
  const snapshots = await ctx.db
    .query("snapshots")
    .withIndex("by_listing", (q) => q.eq("listingId", listingId))
    .collect();
  const photos = await ctx.db
    .query("photos")
    .withIndex("by_listing", (q) => q.eq("listingId", listingId))
    .collect();

  return {
    listingId,
    url: listing.url,
    tier: item.tier,
    modelId: item.modelId && (board.models ?? []).some((m) => m.id === item.modelId) ? item.modelId : null,
    keySpecs: resolveSpecs(board, item, listing),
    status: listing.status,
    firstSeenAt: listing.firstSeenAt,
    lastCheckedAt: listing.lastCheckedAt,
    lastChangedAt: listing.lastChangedAt,
    removedAt: listing.removedAt,
    lastFailedCheckAt: listing.lastFailedCheckAt,
    failureReason: listing.failureReason,
    geo: listing.geo ?? null,
    notes: item.notes ?? "",
    pros: item.pros ?? [],
    cons: item.cons ?? [],
    ...listing.current,
    history: snapshots.map((s) => ({
      capturedAt: s.capturedAt,
      capturedBy: s.capturedBy,
      status: s.status,
      price: s.data?.price,
    })),
    photos: await Promise.all(
      photos.map(async (p) => ({
        status: p.status,
        url: (p.storageId && (await ctx.storage.getUrl(p.storageId))) ?? p.sourceUrl,
        sourceUrl: p.sourceUrl,
      })),
    ),
  };
}

export function boardItem(ctx: QueryCtx, boardId: Id<"boards">, listingId: Id<"listings">) {
  return ctx.db
    .query("boardItems")
    .withIndex("by_board_listing", (q) => q.eq("boardId", boardId).eq("listingId", listingId))
    .unique();
}

async function ensureOnBoard(
  ctx: MutationCtx,
  boardId: Id<"boards">,
  listingId: Id<"listings">,
  addedBy: string,
  now: number,
) {
  if (await boardItem(ctx, boardId, listingId)) return;
  await ctx.db.insert("boardItems", { boardId, listingId, tier: "watching", rank: now, addedAt: now, addedBy });
}

// New photos, and earlier failures, are (re)queued; known ones just follow the listing's order.
async function queuePhotos(ctx: MutationCtx, listingId: Id<"listings">, urls: string[]) {
  const queued: Id<"photos">[] = [];
  for (const [position, sourceUrl] of urls.entries()) {
    const photo = await ctx.db
      .query("photos")
      .withIndex("by_listing_source", (q) => q.eq("listingId", listingId).eq("sourceUrl", sourceUrl))
      .unique();
    if (!photo) {
      queued.push(await ctx.db.insert("photos", { listingId, sourceUrl, position, status: "pending" }));
    } else if (photo.status === "failed") {
      await ctx.db.patch(photo._id, { position, status: "pending", error: undefined });
      queued.push(photo._id);
    } else if (photo.position !== position) {
      await ctx.db.patch(photo._id, { position });
    }
  }
  if (queued.length) await ctx.scheduler.runAfter(0, internal.photos.archive, { photoIds: queued });
}

// Queues the seller's location for the geocoder (convex/geo.ts) when it is new or has
// moved. A listing saved before geocoding existed is queued on its next re-check.
function locateUpdate(listing: Doc<"listings">, seller: ListingData["seller"]) {
  const before = listing.current.seller;
  if (before.location !== seller.location || before.country !== seller.country) {
    return { geo: undefined, geoPending: seller.location ? (true as const) : undefined };
  }
  return listing.geo === undefined && seller.location ? { geoPending: true as const } : {};
}

// Photo URLs are excluded because CDNs may rotate them without the listing changing.
// Translations are left out: they are reworded on every capture of the same text.
function fingerprint({ photoUrls: _, descriptionTranslation: __, ...rest }: ListingData) {
  return stableStringify(rest);
}

// Key order and the order of string lists (e.g. options) carry no meaning, so neither counts as a change.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    const items = value.map(stableStringify);
    return `[${(value.every((item) => typeof item === "string") ? items.sort() : items).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
