import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { getListing, listDue, listListings, saveSnapshot } from "./agent";
import * as mcp from "./mcp";
import { authenticate } from "./tokens";

const http = httpRouter();

// The MCP server for Claude and other MCP clients, signed in with OAuth.
for (const method of ["POST", "GET", "DELETE"] as const) http.route({ path: "/mcp", method, handler: mcp.handle });
http.route({ path: "/.well-known/oauth-protected-resource/mcp", method: "GET", handler: mcp.protectedResource });

// REST API for scripts and the browser extension. Every route needs `Authorization: Bearer pit_…`.
http.route({
  path: "/api/listings",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = await authenticate(ctx, request);
    if (!token) return unauthorized();
    const body: unknown = await request.json().catch(() => undefined);
    return json(await saveSnapshot(ctx, { boardId: token.boardId, capturedBy: token.name }, body));
  }),
});

http.route({
  path: "/api/listings",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = await authenticate(ctx, request);
    return token ? json(await listListings(ctx, token.boardId)) : unauthorized();
  }),
});

http.route({
  path: "/api/rechecks",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = await authenticate(ctx, request);
    return token ? json(await listDue(ctx, token.boardId)) : unauthorized();
  }),
});

http.route({
  pathPrefix: "/api/listings/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = await authenticate(ctx, request);
    if (!token) return unauthorized();
    const listingId = decodeURIComponent(new URL(request.url).pathname.slice("/api/listings/".length));
    return json(await getListing(ctx, token.boardId, listingId));
  }),
});

function json({ status, body }: { status: number; body: unknown }) {
  return Response.json(body, { status });
}

function unauthorized() {
  return json({ status: 401, body: { error: "Missing or invalid API token" } });
}

export default http;
