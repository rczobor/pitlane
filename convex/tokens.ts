import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";

const tokenPattern = /^pit_[0-9a-f]{64}$/;

// Run from the CLI; prints the token once:
//   pnpm convex run tokens:create '{"name": "claude-desktop"}'
// Generated in an action because mutations use seeded randomness.
export const create = internalAction({
  args: { name: v.string(), userName: v.optional(v.string()) },
  handler: async (ctx, { name, userName }): Promise<string> => {
    const token = `pit_${toHex(crypto.getRandomValues(new Uint8Array(32)))}`;
    await ctx.runMutation(internal.tokens.insert, { name, userName, tokenHash: await sha256(token) });
    return token;
  },
});

// Single-user for now: every token belongs to the first user's first board, created on demand.
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

// For public queries and mutations, which receive the token as an argument.
export async function tokenAccess(ctx: QueryCtx, token: string) {
  if (!tokenPattern.test(token)) return null;
  const tokenHash = await sha256(token);
  return ctx.db
    .query("apiTokens")
    .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
}

export async function sha256(text: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
