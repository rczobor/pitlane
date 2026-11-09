import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const url = "https://listings.example/fahrzeuge/details.html?lang=en&id=10000000000001&utm_source=linkcopy";
const photo = (n: number) => `https://img.classistatic.de/api/v1/mo-prod/images/aa/photo-${n}?rule=mo-1600.jpg`;

function listing(overrides: Record<string, unknown> = {}) {
  return {
    status: "available",
    url,
    title: "BMW 320d Touring M Sport",
    price: { amount: 24_990, currency: "EUR" },
    seller: { type: "dealer", name: "Autohaus Beispiel", location: "10115 Berlin" },
    details: {
      category: "car",
      make: "BMW",
      model: "320d Touring",
      firstRegistration: "2020-03",
      mileageKm: 84_000,
      fuel: "diesel",
      gearbox: "automatic",
      powerKw: 140,
      options: ["Navigation system", "Heated seats"],
    },
    photoUrls: [photo(1)],
    ...overrides,
  };
}

async function setup() {
  const t = convexTest(schema, modules);
  const token = await t.action(internal.tokens.create, { name: "claude-desktop" });
  const call = async (path: string, body?: unknown, auth = `Bearer ${token}`) => {
    const response = await t.fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  return { t, call };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("rejects requests without a valid token", async () => {
  const { call } = await setup();
  expect((await call("/api/listings", undefined, "")).status).toBe(401);
  expect((await call("/api/listings", listing(), `Bearer pit_${"0".repeat(64)}`)).status).toBe(401);
});

test("reports which fields are invalid", async () => {
  const { call } = await setup();
  const response = await call("/api/listings", listing({ url: "https://example.com/car/1", price: { amount: "cheap" } }));
  expect(response.status).toBe(400);
  expect(response.body.issues.map((issue: { path: string }) => issue.path)).toEqual(
    expect.arrayContaining(["url", "price.amount", "price.currency"]),
  );
});

test("refuses photo URLs outside the source's image host", async () => {
  const { call } = await setup();
  const response = await call("/api/listings", listing({ photoUrls: ["https://192.168.1.1/admin.png"] }));
  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/image host/);
});

test("adds a new listing to Watching and archives its photos", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", async (input: string) =>
    input === photo(1)
      ? new Response(new Blob(["jpeg"]), { headers: { "content-type": "image/jpeg" } })
      : new Response("nope", { status: 404 }),
  );
  const { t, call } = await setup();

  const saved = await call("/api/listings", listing({ photoUrls: [photo(1), photo(2)] }));
  expect(saved.body).toMatchObject({ created: true, changed: true, priceChange: null });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const detail = await call(`/api/listings/${saved.body.listingId}`);
  expect(detail.body).toMatchObject({
    tier: "watching",
    status: "available",
    url: "https://listings.example/fahrzeuge/details.html?id=10000000000001",
  });
  expect(detail.body.photos.map((p: { status: string }) => p.status)).toEqual(["stored", "failed"]);
  expect(detail.body.photos[0].url).not.toBe(photo(1));
});

test("a re-check only adds history when something changed", async () => {
  const { call } = await setup();
  const { body: first } = await call("/api/listings", listing());

  // Same data with options reordered: not a change.
  const unchanged = await call(
    "/api/listings",
    listing({ details: { ...listing().details, options: ["Heated seats", "Navigation system"] } }),
  );
  expect(unchanged.body).toMatchObject({ created: false, changed: false });

  const cheaper = await call("/api/listings", listing({ price: { amount: 23_490, currency: "EUR" } }));
  expect(cheaper.body).toMatchObject({
    changed: true,
    priceChange: { from: { amount: 24_990 }, to: { amount: 23_490 } },
  });

  const detail = await call(`/api/listings/${first.listingId}`);
  expect(detail.body.history.map((h: { price: { amount: number } }) => h.price.amount)).toEqual([24_990, 23_490]);
  expect(detail.body.price.amount).toBe(23_490);
});

test("marks a saved listing removed, and only listings on the board", async () => {
  const { call } = await setup();
  expect((await call("/api/listings", { status: "removed", url })).status).toBe(404);

  const { body: saved } = await call("/api/listings", listing());
  expect((await call("/api/listings", { status: "removed", url })).body).toMatchObject({ changed: true });

  const detail = await call(`/api/listings/${saved.listingId}`);
  expect(detail.body.status).toBe("removed");
  expect(detail.body.history.map((h: { status: string }) => h.status)).toEqual(["available", "removed"]);
});

test("lists the board and hides listings from other boards", async () => {
  const { t, call } = await setup();
  const { body: saved } = await call("/api/listings", listing());
  const { body } = await call("/api/listings");
  expect(body.listings).toHaveLength(1);
  expect(body.listings[0]).toMatchObject({ tier: "watching", title: "BMW 320d Touring M Sport" });
  expect((await call("/api/listings/not-an-id")).status).toBe(404);

  const otherToken = `pit_${"1".repeat(64)}`;
  const otherHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otherToken))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Friend" });
    const boardId = await ctx.db.insert("boards", { name: "Friend's board", ownerId: userId });
    await ctx.db.insert("apiTokens", { name: "friend", tokenHash: otherHash, userId, boardId, createdAt: 0 });
  });
  const asFriend = `Bearer ${otherToken}`;
  expect((await call("/api/listings", undefined, asFriend)).body.listings).toEqual([]);
  expect((await call(`/api/listings/${saved.listingId}`, undefined, asFriend)).status).toBe(404);
  expect((await call("/api/listings", { status: "removed", url }, asFriend)).status).toBe(404);
});
