import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { modules, seedOwner } from "./test.setup";
import { listingSite } from "../shared/sources";

const canonicalUrl = listingSite.canonicalUrl("10000000000001");
// A share link: extra parameters around the id that the intake must strip.
const url = canonicalUrl.replace("?id=", "?lang=en&id=") + "&utm_source=linkcopy";
const photo = (n: number) => `https://img.classistatic.de/photo-${n}.jpg`;

function listing(overrides: Record<string, unknown> = {}) {
  return {
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

// The intake as agents reach it: the owner's MCP client calling tools.
async function setup() {
  const t = convexTest(schema, modules);
  await seedOwner(t);
  const client = t.withIdentity({ subject: "owner", client_id: "https://claude.ai/oauth/claude-code-client-metadata" });
  let id = 0;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.fetch("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }),
    });
    const { result } = await response.json();
    const text: string = result.content[0].text;
    // Errors from the intake are JSON too; the SDK's own input validation is plain text.
    return { isError: result.isError === true, text, body: text.startsWith("{") ? JSON.parse(text) : undefined };
  };
  return { t, call };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("reports which fields are invalid", async () => {
  const { call } = await setup();
  const response = await call("save_listing", listing({ url: "https://example.com/car/1", price: { amount: "cheap" } }));
  expect(response.isError).toBe(true);
  for (const path of ["url", "price.amount", "price.currency"]) expect(response.text).toContain(`at ${path}`);
});

test("keeps the VAT details and rejects a net price above the gross", async () => {
  const { call } = await setup();
  const vat = { amount: 159_999, currency: "EUR", vatDeductible: true, netAmount: 134_453 };
  const { body } = await call("save_listing", listing({ price: vat }));
  expect((await call("get_listing", { listingId: body.listingId })).body.price).toEqual(vat);

  const bad = await call("save_listing", listing({ price: { ...vat, netAmount: 170_000 } }));
  expect(bad.isError).toBe(true);
  expect(bad.text).toContain("at price.netAmount");
});

test("takes a lowercase country code and stores it uppercased", async () => {
  const { call } = await setup();
  const seller = { type: "dealer", location: "10115 Berlin", country: " de " };
  const { isError, body } = await call("save_listing", listing({ seller }));
  expect(isError).toBe(false);
  expect((await call("get_listing", { listingId: body.listingId })).body.seller.country).toBe("DE");
});

test("refuses photo URLs outside the source's image host", async () => {
  const { call } = await setup();
  const response = await call("save_listing", listing({ photoUrls: ["https://192.168.1.1/admin.png"] }));
  expect(response.isError).toBe(true);
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

  const saved = await call("save_listing", listing({ photoUrls: [photo(1), photo(2)] }));
  expect(saved.body).toMatchObject({ created: true, changed: true, priceChange: null });
  // Only the timers already pending each round: runAllTimers would also chase timers the
  // runtime keeps creating, and intermittently abort after 10,000 of them.
  await t.finishAllScheduledFunctions(vi.runOnlyPendingTimers);

  const detail = await call("get_listing", { listingId: saved.body.listingId });
  expect(detail.body).toMatchObject({
    tier: "watching",
    status: "available",
    url: canonicalUrl,
  });
  expect(detail.body.photos.map((p: { status: string }) => p.status)).toEqual(["stored", "failed"]);
  expect(detail.body.photos[0].url).not.toBe(photo(1));
});

test("a re-check only adds history when something changed", async () => {
  const { call } = await setup();
  const { body: first } = await call("save_listing", listing());

  // Same data with options reordered: not a change.
  const unchanged = await call(
    "save_listing",
    listing({ details: { ...listing().details, options: ["Heated seats", "Navigation system"] } }),
  );
  expect(unchanged.body).toMatchObject({ created: false, changed: false });

  const cheaper = await call("save_listing", listing({ price: { amount: 23_490, currency: "EUR" } }));
  expect(cheaper.body).toMatchObject({
    changed: true,
    priceChange: { from: { amount: 24_990 }, to: { amount: 23_490 } },
  });

  const detail = await call("get_listing", { listingId: first.listingId });
  expect(detail.body.history.map((h: { price: { amount: number } }) => h.price.amount)).toEqual([24_990, 23_490]);
  expect(detail.body.price.amount).toBe(23_490);
});

test("keeps a translation until the description it translates changes", async () => {
  const { call } = await setup();
  const description = "Scheckheftgepflegt, unfallfrei.";
  const translation = (text: string) => ({ from: "de", text });
  const { body: first } = await call(
    "save_listing",
    listing({ description, descriptionTranslation: translation("Full service history, accident-free.") }),
  );
  const saved = async () => (await call("get_listing", { listingId: first.listingId })).body.descriptionTranslation;

  // Reworded translation of the same text: not a change, but the newer wording is shown.
  const reworded = await call(
    "save_listing",
    listing({ description, descriptionTranslation: translation("Full dealer service history, no accidents.") }),
  );
  expect(reworded.body).toMatchObject({ changed: false });
  expect(await saved()).toEqual(translation("Full dealer service history, no accidents."));

  // A capture without a translation keeps the saved one.
  expect((await call("save_listing", listing({ description }))).body).toMatchObject({ changed: false });
  expect(await saved()).toEqual(translation("Full dealer service history, no accidents."));

  // A new description drops the translation of the old one.
  expect((await call("save_listing", listing({ description: "Neue Bremsen." }))).body).toMatchObject({ changed: true });
  expect(await saved()).toBeUndefined();
});

test("marks a saved listing removed, and only listings on the board", async () => {
  const { call } = await setup();
  expect((await call("mark_listing_removed", { url })).isError).toBe(true);

  const { body: saved } = await call("save_listing", listing());
  expect((await call("mark_listing_removed", { url })).body).toMatchObject({ changed: true });

  const detail = await call("get_listing", { listingId: saved.listingId });
  expect(detail.body.status).toBe("removed");
  expect(detail.body.history.map((h: { status: string }) => h.status)).toEqual(["available", "removed"]);
});

test("lists the board's listings", async () => {
  const { call } = await setup();
  await call("save_listing", listing());
  const { body } = await call("list_listings");
  expect(body.listings).toHaveLength(1);
  expect(body.listings[0]).toMatchObject({ tier: "watching", title: "BMW 320d Touring M Sport" });
  expect((await call("get_listing", { listingId: "not-an-id" })).isError).toBe(true);
});

test("re-checks are due a day after the last check, and a failure waits before retrying", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-01T08:00:00Z"));
  const { call } = await setup();
  const { body: saved } = await call("save_listing", listing());
  expect((await call("list_due_rechecks")).body.due).toEqual([]);

  vi.setSystemTime(new Date("2026-03-02T09:00:00Z"));
  const { body } = await call("list_due_rechecks");
  expect(body.due).toEqual([expect.objectContaining({ listingId: saved.listingId })]);

  // A failed check changes nothing about the listing and holds it back for a while.
  const failed = await call("report_check_failed", { url, reason: "blocked" });
  expect(failed.isError).toBe(false);
  expect((await call("list_due_rechecks")).body.due).toEqual([]);
  const detail = await call("get_listing", { listingId: saved.listingId });
  expect(detail.body).toMatchObject({ status: "available", failureReason: "blocked" });
  expect(detail.body.history).toHaveLength(1);

  vi.setSystemTime(new Date("2026-03-02T15:30:00Z"));
  expect((await call("list_due_rechecks")).body.due).toHaveLength(1);

  // A successful save clears the failure and the listing is no longer due.
  await call("save_listing", listing());
  expect((await call("get_listing", { listingId: saved.listingId })).body.failureReason).toBeUndefined();
  expect((await call("list_due_rechecks")).body.due).toEqual([]);
});
