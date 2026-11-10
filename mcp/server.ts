// Local MCP server (stdio) that lets agents such as Claude Desktop save and read
// listings. It is a thin client over the REST API, so both share one auth and
// validation path. Run with: node mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listingData, listingUrl } from "../shared/listing.ts";

const apiUrl = process.env.PITLANE_API_URL;
const apiToken = process.env.PITLANE_API_TOKEN;
if (!apiUrl || !apiToken) {
  console.error("Set PITLANE_API_URL (the Convex .site URL) and PITLANE_API_TOKEN.");
  process.exit(1);
}

async function callApi(path: string, init: { method: "GET" } | { method: "POST"; body: unknown }) {
  try {
    const response = await fetch(new URL(path, apiUrl), {
      method: init.method,
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: init.method === "POST" ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const body: unknown = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    return { content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }], isError: !response.ok };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: `Could not reach the Pitlane API: ${message}` }], isError: true };
  }
}

const server = new McpServer({ name: "pitlane", version: "0.2.0" });

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
    inputSchema: listingData.extend({ url: listingUrl }),
  },
  (input) => callApi("/api/listings", { method: "POST", body: { status: "available", ...input } }),
);

server.registerTool(
  "mark_listing_removed",
  {
    title: "Mark listing removed",
    description:
      "Record that a saved listing's page says the ad is gone (sold or deleted). Only use this when the page explicitly says so; if the page failed to load or looked blocked, report that instead and change nothing.",
    inputSchema: z.object({ url: listingUrl }),
  },
  ({ url }) => callApi("/api/listings", { method: "POST", body: { status: "removed", url } }),
);

server.registerTool(
  "list_due_rechecks",
  {
    title: "List due re-checks",
    description: [
      "The saved listings that are due for a re-check, oldest first (at most 10).",
      "Open each one and save it again with save_listing. If the page says the ad is gone, use mark_listing_removed.",
      "If the page did not load or looked blocked, use report_check_failed instead.",
      "Only re-check listings from this list.",
    ].join(" "),
    annotations: { readOnlyHint: true },
  },
  () => callApi("/api/rechecks", { method: "GET" }),
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
  ({ url, reason }) => callApi("/api/listings", { method: "POST", body: { status: "failed", url, reason } }),
);

server.registerTool(
  "list_listings",
  {
    title: "List listings",
    description: "List every listing on the watchlist with its tier, status, price and last-checked time.",
    annotations: { readOnlyHint: true },
  },
  () => callApi("/api/listings", { method: "GET" }),
);

server.registerTool(
  "get_listing",
  {
    title: "Get listing",
    description: "Full details of one saved listing, including its price history and photos.",
    inputSchema: z.object({ listingId: z.string().describe("The listingId from list_listings or save_listing.") }),
    annotations: { readOnlyHint: true },
  },
  ({ listingId }) => callApi(`/api/listings/${encodeURIComponent(listingId)}`, { method: "GET" }),
);

await server.connect(new StdioServerTransport());
