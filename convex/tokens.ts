import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx } from "./_generated/server";
import { appError } from "./errors";
import { viewerAccess } from "./users";

const tokenPattern = /^pit_[0-9a-f]{64}$/;

// Run from the CLI; prints the token once:
//   pnpm convex run tokens:create '{"name": "chrome-extension"}'
// Generated in an action because mutations use seeded randomness.
export const create = internalAction({
  args: { name: v.string(), userName: v.optional(v.string()) },
  handler: async (ctx, { name, userName }): Promise<string> => {
    const token = `pit_${toHex(crypto.getRandomValues(new Uint8Array(32)))}`;
    await ctx.runMutation(internal.tokens.insert, { name, userName, tokenHash: await sha256(token) });
    return token;
  },
});

// Every token belongs to the oldest user's first board, created on demand: the owner's,
// as long as the owner signs in or creates a token before anyone else signs in.
export const insert = internalMutation({
  args: { name: v.string(), userName: v.optional(v.string()), tokenHash: v.string() },
  handler: async (ctx, { name, userName, tokenHash }) => {
    const userId = (await ctx.db.query("users").first())?._id ?? (await ctx.db.insert("users", { name: userName ?? "Me" }));
    const boardId =
      (await ctx.db.query("boards").withIndex("by_owner", (q) => q.eq("ownerId", userId)).first())?._id ??
      (await ctx.db.insert("boards", { name: "Watchlist", ownerId: userId }));
    await ctx.db.insert("apiTokens", { name, tokenHash, userId, boardId, createdAt: Date.now() });
  },
});

// The signed-in user's API tokens, for Settings. Never the hashes.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const access = await viewerAccess(ctx);
    if (!access) return [];
    const tokens = await ctx.db
      .query("apiTokens")
      .withIndex("by_user", (q) => q.eq("userId", access.userId))
      .collect();
    return tokens.map(({ _id, name, createdAt }) => ({ tokenId: _id, name, createdAt }));
  },
});

// Deleting the row is enough: every request looks its token up by hash.
export const revoke = mutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, { tokenId }) => {
    const access = await viewerAccess(ctx);
    const token = await ctx.db.get(tokenId);
    if (!access || token?.userId !== access.userId) throw appError("not_found", "Token not found");
    await ctx.db.delete(tokenId);
  },
});

export const byHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: (ctx, { tokenHash }) =>
    ctx.db
      .query("apiTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique(),
});

export async function authenticate(ctx: ActionCtx, request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  return token && tokenPattern.test(token)
    ? ctx.runQuery(internal.tokens.byHash, { tokenHash: await sha256(token) })
    : null;
}

export async function sha256(text: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
