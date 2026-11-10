import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, query } from "./_generated/server";
import { type Result, saveSnapshot } from "./agent";
import { dueListings, findOnBoard } from "./listings";
import { viewerAccess } from "./users";

// Functions for the Chrome extension. It borrows the web app's Clerk session, so it
// sees the same board as the web app. Signed out, or before the web app has set the
// user up, reads return null.

// The listing at this URL as last saved, so a re-check keeps values typed in by hand.
export const saved = query({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const access = await viewerAccess(ctx);
    const listing = access && (await findOnBoard(ctx, access.boardId, url));
    return listing ? listing.current : null;
  },
});

// Up to 10 listings due for a re-check, oldest first. Queries must not read the clock,
// so the popup passes the time.
export const due = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const access = await viewerAccess(ctx);
    return access && dueListings(ctx, access.boardId, now);
  },
});

// Goes through the same intake as the MCP tools; `saveSnapshot` validates the input.
export const save = action({
  args: { snapshot: v.any() },
  handler: async (ctx, { snapshot }): Promise<Result> => {
    const access: { boardId: Id<"boards">; isOwner: boolean } | null = await ctx.runQuery(internal.users.viewerForCapture, { via: "web" });
    if (!access) return { status: 401, body: { error: "Sign in to Pitlane first." } };
    if (!access.isOwner) return { status: 403, body: { error: "Only the board's owner can save listings for now." } };
    return saveSnapshot(ctx, { boardId: access.boardId, capturedBy: "extension" }, snapshot);
  },
});
