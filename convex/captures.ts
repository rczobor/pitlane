import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { appError } from "./errors";
import { findOnBoard } from "./listings";
import { viewerAccess } from "./users";
import { resolveListingUrl } from "../shared/sources";

// Listings shared to Pitlane that wait for someone to capture them. Sharing only queues
// the URL; the capture itself still happens in the user's browser, by an agent through
// `list_pending_captures` or by the extension, and saving the listing clears it.

// A shared listing URL: opens the car when it is already on the board, otherwise queues it.
// Sharing the same listing again changes nothing.
export const share = mutation({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const access = await viewerAccess(ctx);
    if (!access) throw appError("invalid", "Sign in first");
    const ref = resolveListingUrl(url);
    if (!ref) throw appError("invalid", "Not a supported listing URL");
    const listing = await findOnBoard(ctx, access.boardId, url);
    if (listing) return { listingId: listing._id };
    const queued = await findRequest(ctx, access.boardId, ref);
    if (!queued) {
      const { source, externalId, canonicalUrl } = ref;
      await ctx.db.insert("captureRequests", { boardId: access.boardId, source, externalId, url: canonicalUrl });
    }
    return { listingId: null };
  },
});

export const pending = query({
  args: {},
  handler: async (ctx) => {
    const access = await viewerAccess(ctx);
    return access && pendingCaptures(ctx, access.boardId);
  },
});

export const dismiss = mutation({
  args: { requestId: v.id("captureRequests") },
  handler: async (ctx, { requestId }) => {
    const access = await viewerAccess(ctx);
    const request = await ctx.db.get("captureRequests", requestId);
    if (!access || request?.boardId !== access.boardId) throw appError("not_found", "Not on your board");
    await ctx.db.delete("captureRequests", requestId);
  },
});

export const listPending = internalQuery({
  args: { boardId: v.id("boards") },
  handler: (ctx, { boardId }) => pendingCaptures(ctx, boardId),
});

// Oldest first. A board only ever holds the few the user shared and nobody captured yet.
async function pendingCaptures(ctx: QueryCtx, boardId: Id<"boards">) {
  const requests = await ctx.db
    .query("captureRequests")
    .withIndex("by_board_source_external", (q) => q.eq("boardId", boardId))
    .collect();
  return requests
    .sort((a, b) => a._creationTime - b._creationTime)
    .map((r) => ({ requestId: r._id, url: r.url, externalId: r.externalId, sharedAt: r._creationTime }));
}

// Called by every save, so a capture from any route clears the request.
export async function clearCaptureRequest(ctx: MutationCtx, boardId: Id<"boards">, ref: Ref) {
  const request = await findRequest(ctx, boardId, ref);
  if (request) await ctx.db.delete("captureRequests", request._id);
}

type Ref = { source: string; externalId: string };

const findRequest = (ctx: QueryCtx, boardId: Id<"boards">, { source, externalId }: Ref) =>
  ctx.db
    .query("captureRequests")
    .withIndex("by_board_source_external", (q) =>
      q.eq("boardId", boardId).eq("source", source).eq("externalId", externalId),
    )
    .unique();
