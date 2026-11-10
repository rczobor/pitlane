import { internalQuery, mutation, type QueryCtx } from "./_generated/server";
import { appError } from "./errors";

// Convex accepts both of Clerk's token kinds on every function (see auth.config.ts).
// Only OAuth access tokens carry `client_id`; each side admits only its own kind, so a
// token granted to Claude cannot drive the web app's functions, and the reverse.
type Via = "web" | "mcp";

// The signed-in user's board, or null when signed out or not set up yet.
export async function viewerAccess(ctx: QueryCtx, via: Via = "web") {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || (typeof identity.client_id === "string") !== (via === "mcp")) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  const board =
    user && (await ctx.db.query("boards").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).first());
  return board && { userId: user._id, boardId: board._id };
}

// For actions, which have no database access of their own.
// For the MCP server. Only the owner (the oldest user, who also holds the API tokens)
// may use it for now: a car's listing facts are shared by every board that tracks it,
// so another account's agent could rewrite the owner's prices or mark a car removed.
export const viewerForMcp = internalQuery({
  args: {},
  handler: async (ctx) => {
    const access = await viewerAccess(ctx, "mcp");
    const owner = access && (await ctx.db.query("users").first());
    return access && { ...access, isOwner: owner?._id === access.userId };
  },
});

// Runs when a signed-in account has no board yet. A new account takes over a user
// that no account owns yet: the one `tokens:create` makes for the owner before they
// first sign in, so their board and API tokens carry over. Sign-up is invite-only in
// Clerk, which keeps strangers from claiming it. Anyone else gets a fresh user and an
// empty board.
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("invalid", "Sign in first");
    const { tokenIdentifier } = identity;
    const byIdentity = (value: string | undefined) =>
      ctx.db.query("users").withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", value));

    let userId = (await byIdentity(tokenIdentifier).unique())?._id;
    if (!userId) {
      const unclaimed = await byIdentity(undefined).first();
      if (unclaimed) await ctx.db.patch(unclaimed._id, { tokenIdentifier });
      userId =
        unclaimed?._id ??
        (await ctx.db.insert("users", { name: identity.name ?? identity.email ?? "Me", tokenIdentifier }));
    }
    const board = await ctx.db.query("boards").withIndex("by_owner", (q) => q.eq("ownerId", userId)).first();
    if (!board) await ctx.db.insert("boards", { name: "Watchlist", ownerId: userId });
  },
});
