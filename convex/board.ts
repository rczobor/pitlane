import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError } from "./errors";
import { boardItem, boardListings, listingDetail } from "./listings";
import { tokenAccess } from "./tokens";
import { tiers } from "./validators";

// Functions for the web app. Until there are user accounts, the browser holds an
// API token and passes it to every call; a bad token reads as signed out (null).

export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const access = await tokenAccess(ctx, token);
    if (!access) return null;
    const board = (await ctx.db.get(access.boardId))!;
    return { name: board.name, listings: await boardListings(ctx, access.boardId) };
  },
});

export const listing = query({
  args: { token: v.string(), listingId: v.string() },
  handler: async (ctx, { token, listingId }) => {
    const access = await tokenAccess(ctx, token);
    return access && listingDetail(ctx, access.boardId, listingId);
  },
});

export const move = mutation({
  args: { token: v.string(), listingId: v.id("listings"), tier: tiers, rank: v.number() },
  handler: async (ctx, { token, listingId, tier, rank }) => {
    const access = await tokenAccess(ctx, token);
    const item = access && (await boardItem(ctx, access.boardId, listingId));
    if (!item) throw appError("not_found", "This listing is not on your board");
    await ctx.db.patch(item._id, { tier, rank });
  },
});
