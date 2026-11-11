import { convexTest } from "convex-test";
import { beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedOwner } from "./test.setup";

const site = "https://pitlane.example.convex.site";

beforeEach(() => {
  vi.stubEnv("CONVEX_SITE_URL", site);
  vi.stubEnv("CLERK_FRONTEND_API_URL", "https://clerk.example.com");
});

let id = 0;
const rpc = (method: string, params: unknown = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
});

test("signed-out calls get a 401 that points Claude at the sign-in metadata", async () => {
  const t = convexTest(schema, modules);
  for (const init of [rpc("tools/list"), { method: "GET" }]) {
    const response = await t.fetch("/mcp", init);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${site}/.well-known/oauth-protected-resource/mcp", scope="profile"`,
    );
  }
  const metadata = await (await t.fetch("/.well-known/oauth-protected-resource/mcp")).json();
  expect(metadata).toMatchObject({ resource: `${site}/mcp`, authorization_servers: ["https://clerk.example.com"] });
  // The Add cars page shows this URL; tokens are only accepted for exactly the advertised resource.
  expect(await t.query(api.mcp.serverUrl, {})).toBe(metadata.resource);
});

test("a signed-in client works on the owner's board, and a first sign-in sets it up", async () => {
  const t = convexTest(schema, modules);
  await seedOwner(t);
  // Clerk's OAuth access tokens carry the client's id; session tokens don't.
  const claude = t.withIdentity({ subject: "owner", client_id: "https://claude.ai/oauth/claude-code-client-metadata" });

  const tools = await (await claude.fetch("/mcp", rpc("tools/list"))).json();
  expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toContain("save_listing");

  const call = async (name: string, args: unknown) =>
    (await (await claude.fetch("/mcp", rpc("tools/call", { name, arguments: args }))).json()).result;
  const listed = await call("list_listings", {});
  expect(JSON.parse(listed.content[0].text)).toEqual({ listings: [] });
  // The seeded owner was taken over, not a second user created.
  expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(1);

  const missing = await call("get_listing", { listingId: "nope" });
  expect(missing.isError).toBe(true);
  // Signed in, the endpoint still only takes POST.
  expect((await claude.fetch("/mcp", { method: "GET" })).status).toBe(405);
});

test("each token kind works only on its own side", async () => {
  const t = convexTest(schema, modules);
  // A web session is refused at /mcp before anything is set up for it.
  expect((await t.withIdentity({ subject: "stranger" }).fetch("/mcp", rpc("tools/list"))).status).toBe(401);
  expect(await t.run((ctx) => ctx.db.query("users").collect())).toEqual([]);
  const claude = t.withIdentity({ subject: "owner", client_id: "https://claude.ai/oauth/claude-code-client-metadata" });
  expect((await claude.fetch("/mcp", rpc("tools/list"))).status).toBe(200);
  // Claude's token cannot drive the web app's functions, such as moving cars between tiers.
  expect(await claude.query(api.board.get, {})).toBeNull();
  // And the web app's session cannot call /mcp.
  const browser = t.withIdentity({ subject: "owner" });
  expect(await browser.query(api.board.get, {})).not.toBeNull();
  expect((await browser.fetch("/mcp", rpc("tools/list"))).status).toBe(401);
});

test("only the owner can connect an agent", async () => {
  const t = convexTest(schema, modules);
  const client_id = "https://claude.ai/oauth/claude-code-client-metadata";
  expect((await t.withIdentity({ subject: "owner", client_id }).fetch("/mcp", rpc("tools/list"))).status).toBe(200);
  // An invited friend signs in fine, but their agent could rewrite shared listing facts.
  const friend = await t.withIdentity({ subject: "friend", client_id }).fetch("/mcp", rpc("tools/list"));
  expect(friend.status).toBe(403);
});
