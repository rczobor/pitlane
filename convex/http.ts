import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import type { AppErrorData } from "./errors";
import { authenticate } from "./tokens";
import { snapshotInput } from "../shared/listing";

// REST API for agents and the browser extension. Every route needs `Authorization: Bearer pit_…`.
const http = httpRouter();

http.route({
  path: "/api/listings",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = await authenticate(ctx, request);
    if (!token) return unauthorized();

    const body: unknown = await request.json().catch(() => undefined);
    const parsed = snapshotInput.safeParse(body);
    if (!parsed.success) {
      return json(400, {
        error: "Invalid listing",
        issues: parsed.error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
      });
    }

    const owner = { boardId: token.boardId, capturedBy: token.name };
    try {
      if (parsed.data.status === "removed") {
        return json(200, await ctx.runMutation(internal.listings.markRemoved, { ...owner, url: parsed.data.url }));
      }
      if (parsed.data.status === "failed") {
        const { url, reason } = parsed.data;
        return json(200, await ctx.runMutation(internal.listings.markFailed, { boardId: token.boardId, url, reason }));
      }
      const { status: _, url, ...data } = parsed.data;
      return json(200, await ctx.runMutation(internal.listings.save, { ...owner, url, data }));
    } catch (error) {
      return appErrorResponse(error);
    }
  }),
});

http.route({
  path: "/api/listings",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = await authenticate(ctx, request);
    if (!token) return unauthorized();
    return json(200, { listings: await ctx.runQuery(internal.listings.listForBoard, { boardId: token.boardId }) });
  }),
});

// The listings due for a re-check, oldest first. Agents work through this list rather
// than choosing what to fetch, so the app sets the pace.
http.route({
  path: "/api/rechecks",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = await authenticate(ctx, request);
    if (!token) return unauthorized();
    return json(200, { due: await ctx.runQuery(internal.listings.listDue, { boardId: token.boardId, now: Date.now() }) });
  }),
});

http.route({
  pathPrefix: "/api/listings/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = await authenticate(ctx, request);
    if (!token) return unauthorized();
    const listingId = decodeURIComponent(new URL(request.url).pathname.slice("/api/listings/".length));
    const listing = await ctx.runQuery(internal.listings.getForBoard, { boardId: token.boardId, listingId });
    return listing ? json(200, listing) : json(404, { error: "Listing not found" });
  }),
});

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

function unauthorized() {
  return json(401, { error: "Missing or invalid API token" });
}

function appErrorResponse(error: unknown) {
  if (!(error instanceof ConvexError)) throw error;
  const { code, message }: AppErrorData = error.data;
  return json(code === "not_found" ? 404 : 400, { error: message });
}

export default http;
