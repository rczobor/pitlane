import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { v } from "convex/values";
import { z } from "zod";
import { api, internal } from "./_generated/api";
import { httpAction, query, type ActionCtx } from "./_generated/server";
import { getListing, listDue, listListings, saveSnapshot, type Owner } from "./agent";
import { listingData, listingUrl } from "../shared/listing";

// The remote MCP server: Claude adds it as a custom connector by URL and signs in with
// OAuth. Clerk is the authorization server; Convex verifies its access tokens (see
// auth.config.ts), so every request arrives with the user's identity or none.
const siteUrl = () => process.env.CONVEX_SITE_URL!;
const metadataUrl = () => `${siteUrl()}/.well-known/oauth-protected-resource/mcp`;
// Pitlane needs no data from the Clerk account itself, but Clerk grants at least one scope.
const scopes = ["profile"];

// The URL people paste into Claude or ChatGPT. It must equal the `resource` below, since
// access tokens are issued for that exact URL; the web app only knows the .cloud URL.
export const serverUrl = query({
  args: {},
  returns: v.string(),
  handler: () => `${siteUrl()}/mcp`,
});

// Protected resource metadata (RFC 9728): tells clients where to sign in.
export const protectedResource = httpAction(async () =>
  Response.json({
    resource: `${siteUrl()}/mcp`,
    authorization_servers: [process.env.CLERK_FRONTEND_API_URL],
    scopes_supported: scopes,
    bearer_methods_supported: ["header"],
    resource_name: "Pitlane",
  }),
);

// Stateless: each POST gets a fresh server and a JSON response, which fits HTTP actions.
// There is no event stream or session, so other methods get 405 once signed in.
export const handle = httpAction(async (ctx, request) => {
  const owner = await ownerOf(ctx);
  if (owner === "not_owner") {
    // Signed in, so not a 401: that would send Claude back to sign-in in a loop.
    return Response.json({ error: "Only the board's owner can connect an agent for now." }, { status: 403 });
  }
  if (!owner) {
    // Claude starts sign-in, and refreshes an expired token, only on a 401 with this pointer.
    // A token that was sent but refused also gets RFC 6750's error code.
    const error = request.headers.has("authorization") ? ', error="invalid_token"' : "";
    const challenge = `Bearer resource_metadata="${metadataUrl()}", scope="${scopes.join(" ")}"${error}`;
    return Response.json({ error: "invalid_token" }, { status: 401, headers: { "WWW-Authenticate": challenge } });
  }
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await createServer(ctx, owner).connect(transport);
  return transport.handleRequest(request);
});

// A first sign-in through Claude sets the user up just like the web app's.
async function ownerOf(ctx: ActionCtx): Promise<Owner | "not_owner" | null> {
  // An expired or malformed token throws here; it must still answer 401 so Claude refreshes it.
  const identity = await ctx.auth.getUserIdentity().catch(() => null);
  // Only OAuth access tokens; refused before anything is set up for a web session.
  if (typeof identity?.client_id !== "string") return null;
  let access = await ctx.runQuery(internal.users.viewerForCapture, { via: "mcp" });
  if (!access) {
    await ctx.runMutation(api.users.ensureUser, {});
    access = await ctx.runQuery(internal.users.viewerForCapture, { via: "mcp" });
  }
  if (!access) return null;
  return access.isOwner ? { boardId: access.boardId, capturedBy: "mcp" } : "not_owner";
}

function createServer(ctx: ActionCtx, owner: Owner) {
  const server = new McpServer({ name: "pitlane", version: "1.0.0" });
  const reply = ({ status, body }: { status: number; body: unknown }) => ({
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
    isError: status >= 400,
  });

  server.registerTool(
    "save_listing",
    {
      title: "Save listing",
      description: [
        "Add a listing to the watchlist, or record a re-check of one that is already saved.",
        "Open the listing page first and copy every value exactly as the page shows it; never guess or fill gaps.",
        "The one exception is descriptionTranslation: write it yourself when the description is not in English.",
        "Saving the same URL again is safe: unchanged data only updates the last-checked time, and price changes are recorded in the history.",
        "New listings land in the Watching tier; only the user moves them between tiers.",
      ].join(" "),
      inputSchema: listingData.extend({
        url: listingUrl,
        recheck: z
          .boolean()
          .optional()
          .describe("Set to true when re-checking a listing from list_due_rechecks. If the user removed it meanwhile, the save is refused and nothing is added back."),
      }),
    },
    async (input) => reply(await saveSnapshot(ctx, owner, { status: "available", ...input })),
  );

  server.registerTool(
    "mark_listing_removed",
    {
      title: "Mark listing removed",
      description:
        "Record that a saved listing's page says the ad is gone (sold or deleted). Only use this when the page explicitly says so; if the page failed to load or looked blocked, report that instead and change nothing.",
      inputSchema: z.object({ url: listingUrl }),
    },
    async ({ url }) => reply(await saveSnapshot(ctx, owner, { status: "removed", url })),
  );

  server.registerTool(
    "list_due_rechecks",
    {
      title: "List due re-checks",
      description: [
        "The saved listings that are due for a re-check, oldest first (at most 10).",
        "Open each one and save it again with save_listing and recheck: true. If the page says the ad is gone, use mark_listing_removed.",
        "If the page did not load or looked blocked, use report_check_failed instead.",
        "Only re-check listings from this list.",
      ].join(" "),
      annotations: { readOnlyHint: true },
    },
    async () => reply(await listDue(ctx, owner.boardId)),
  );

  server.registerTool(
    "report_check_failed",
    {
      title: "Report failed check",
      description:
        "Record that a re-check could not read a saved listing (blocked, timed out, unreadable). The listing stays as it is and is retried later. Never use mark_listing_removed for this.",
      inputSchema: z.object({
        url: listingUrl,
        reason: z.string().max(200).optional().describe('What went wrong, e.g. "blocked", "timed out".'),
      }),
    },
    async ({ url, reason }) => reply(await saveSnapshot(ctx, owner, { status: "failed", url, reason })),
  );

  server.registerTool(
    "list_listings",
    {
      title: "List listings",
      description: "List every listing on the watchlist with its tier, status, price and last-checked time.",
      annotations: { readOnlyHint: true },
    },
    async () => reply(await listListings(ctx, owner.boardId)),
  );

  server.registerTool(
    "get_listing",
    {
      title: "Get listing",
      description: "Full details of one saved listing, including its price history and photos.",
      inputSchema: z.object({ listingId: z.string().describe("The listingId from list_listings or save_listing.") }),
      annotations: { readOnlyHint: true },
    },
    async ({ listingId }) => reply(await getListing(ctx, owner.boardId, listingId)),
  );

  return server;
}
