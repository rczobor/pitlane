import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import type { AppErrorData } from "./errors";
import { snapshotInput } from "../shared/listing";

// What agents can do through the MCP server. Each returns an HTTP-style status and a
// JSON body; the MCP tools turn any status of 400 or more into an error result.

export type Owner = { boardId: Id<"boards">; capturedBy: string };
type Result = { status: number; body: unknown };

export async function saveSnapshot(ctx: ActionCtx, owner: Owner, input: unknown): Promise<Result> {
  const parsed = snapshotInput.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: "Invalid listing",
        issues: parsed.error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
      },
    };
  }
  try {
    if (parsed.data.status === "removed") {
      return ok(await ctx.runMutation(internal.listings.markRemoved, { ...owner, url: parsed.data.url }));
    }
    if (parsed.data.status === "failed") {
      const { url, reason } = parsed.data;
      return ok(await ctx.runMutation(internal.listings.markFailed, { boardId: owner.boardId, url, reason }));
    }
    const { status: _, url, ...data } = parsed.data;
    return ok(await ctx.runMutation(internal.listings.save, { ...owner, url, data }));
  } catch (error) {
    if (!(error instanceof ConvexError)) throw error;
    const { code, message }: AppErrorData = error.data;
    return { status: code === "not_found" ? 404 : 400, body: { error: message } };
  }
}

export const listListings = async (ctx: ActionCtx, boardId: Id<"boards">) =>
  ok({ listings: await ctx.runQuery(internal.listings.listForBoard, { boardId }) });

// The listings due for a re-check, oldest first. Agents work through this list rather
// than choosing what to fetch, so the app sets the pace.
export const listDue = async (ctx: ActionCtx, boardId: Id<"boards">) =>
  ok({ due: await ctx.runQuery(internal.listings.listDue, { boardId, now: Date.now() }) });

export async function getListing(ctx: ActionCtx, boardId: Id<"boards">, listingId: string) {
  const listing = await ctx.runQuery(internal.listings.getForBoard, { boardId, listingId });
  return listing ? ok(listing) : { status: 404, body: { error: "Listing not found" } };
}

const ok = (body: unknown): Result => ({ status: 200, body });
