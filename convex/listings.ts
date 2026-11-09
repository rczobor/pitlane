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
  },
  handler: async (ctx, { boardId, capturedBy, url, data }) => {
    const ref = resolveListingUrl(url);
    if (!ref) throw appError("invalid", "Not a supported listing URL");
    const badPhoto = data.photoUrls.find((photoUrl) => !isAllowedPhotoUrl(ref.source, photoUrl));
    if (badPhoto) throw appError("invalid", `Photo URL is not on a ${ref.source} image host: ${badPhoto}`);

    const now = Date.now();
    const existing = await ctx.db
      .query("listings")
      .withIndex("by_source_external", (q) => q.eq("source", ref.source).eq("externalId", ref.externalId))
      .unique();

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
        ...(changed && { lastChangedAt: now }),
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

export const markRemoved = internalMutation({
  args: { boardId: v.id("boards"), capturedBy: v.string(), url: v.string() },
  handler: async (ctx, { boardId, capturedBy, url }) => {
    const ref = resolveListingUrl(url);
    const listing =
      ref &&
      (await ctx.db
        .query("listings")
        .withIndex("by_source_external", (q) => q.eq("source", ref.source).eq("externalId", ref.externalId))
        .unique());
    if (!listing || !(await boardItem(ctx, boardId, listing._id))) {
      throw appError("not_found", "This listing is not on your board");
    }

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
        // A deleted model leaves its cars without one.
        modelId: item.modelId && modelIds.has(item.modelId) ? item.modelId : null,
        keySpecs: resolveSpecs(board, item, listing),
        coverUrl: cover?.storageId ? await ctx.storage.getUrl(cover.storageId) : null,
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

// Photo URLs are excluded because CDNs may rotate them without the listing changing.
function fingerprint({ photoUrls: _, ...rest }: ListingData) {
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
