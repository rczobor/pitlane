import { mutation, type QueryCtx } from "./_generated/server";
import { appError } from "./errors";

// The signed-in user's board, or null when signed out or not set up yet.
export async function viewerAccess(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  const board =
    user && (await ctx.db.query("boards").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).first());
  return board && { userId: user._id, boardId: board._id };
}

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
