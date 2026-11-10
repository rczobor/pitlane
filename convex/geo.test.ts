import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules, seedOwner } from "./test.setup";
import { listingSite } from "../shared/sources";

const car = {
  title: "Porsche 911 GT3",
  price: { amount: 159_999, currency: "EUR" },
  seller: { type: "dealer" as const, location: "80331 München", country: "DE" },
  details: {
    category: "car" as const,
    make: "Porsche",
    model: "991",
    mileageKm: 39_500,
    fuel: "petrol" as const,
    gearbox: "automatic" as const,
    options: [],
  },
  photoUrls: [],
};

// A geocoder that knows two places and records what it was asked.
function stubGeocoder() {
  const asked: URL[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(input);
    asked.push(url);
    const places: Record<string, unknown> = {
      "80331 München": { lat: "48.137", lon: "11.575", display_name: "München, Bayern, Germany" },
      "1010 Wien": { lat: "48.208", lon: "16.373", display_name: "Wien, Austria" },
    };
    const hit = places[url.searchParams.get("q") ?? ""];
    return Response.json(hit ? [hit] : []);
  });
  return asked;
}

afterEach(() => vi.unstubAllGlobals());

// The owner's user and board exist before the first sign-in, which takes them over.
async function setup() {
  const t = convexTest(schema, modules);
  await seedOwner(t);
  const me = t.withIdentity({ subject: "owner", name: "owner" });
  await me.mutation(api.users.ensureUser, {});
  const board = await t.run((ctx) => ctx.db.query("boards").first());
  const save = (seller: Partial<typeof car.seller>) =>
    t.mutation(internal.listings.save, {
      boardId: board!._id,
      capturedBy: "test",
      url: listingSite.canonicalUrl("10000000000002"),
      data: { ...car, seller: { ...car.seller, ...seller } },
    });
  const geoOf = async () => (await me.query(api.board.get, {}))!.listings[0].geo;
  return { t, me, save, geoOf };
}

test("a seller's location is geocoded once, and again only when it moves", async () => {
  const asked = stubGeocoder();
  const { t, save, geoOf } = await setup();

  await save({});
  expect(await geoOf()).toBeNull();
  await t.action(internal.geo.locatePending, {});
  expect(await geoOf()).toEqual({ lat: 48.137, lng: 11.575 });
  // The country narrows the search.
  expect(asked[0].searchParams.get("countrycodes")).toBe("de");

  // A re-check with the same location asks nothing.
  await save({});
  await t.action(internal.geo.locatePending, {});
  expect(asked).toHaveLength(1);

  // A place the geocoder does not know is recorded, so it is not asked again.
  await save({ location: "Nowhere", country: "AT" });
  await t.action(internal.geo.locatePending, {});
  await t.action(internal.geo.locatePending, {});
  expect(asked).toHaveLength(2);
  expect(await t.run(async (ctx) => (await ctx.db.query("listings").first())!.geo)).toBeNull();
});

test("a geocoder outage leaves the location queued for the next run", async () => {
  vi.stubGlobal("fetch", async () => new Response("busy", { status: 503 }));
  const { t, save, geoOf } = await setup();
  await save({});
  await t.action(internal.geo.locatePending, {});
  expect(await t.query(internal.geo.pending, {})).toHaveLength(1);

  stubGeocoder();
  await t.action(internal.geo.locatePending, {});
  expect(await geoOf()).toEqual({ lat: 48.137, lng: 11.575 });
});

test("home is looked up from a place name and can be cleared", async () => {
  stubGeocoder();
  const { me } = await setup();
  await me.action(api.board.setHome, { query: " 1010 Wien " });
  expect((await me.query(api.board.get, {}))!.home).toEqual({
    query: "1010 Wien",
    place: "Wien, Austria",
    lat: 48.208,
    lng: 16.373,
  });
  await expect(me.action(api.board.setHome, { query: "Atlantis" })).rejects.toThrow(/No place found/);

  await me.action(api.board.setHome, { query: "" });
  expect((await me.query(api.board.get, {}))!.home).toBeNull();
});
