import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules, seedOwner } from "./test.setup";
import { listingSite } from "../shared/sources";

const car = {
  title: "Alfa Romeo Giulia",
  price: { amount: 32_000, currency: "EUR" },
  seller: { type: "private" as const },
  details: {
    category: "car" as const,
    make: "Alfa Romeo",
    model: "Giulia",
    mileageKm: 61_000,
    fuel: "petrol" as const,
    gearbox: "automatic" as const,
    options: [],
  },
  photoUrls: [],
};

test("a shared listing waits until a capture saves it, then opens as the car", async () => {
  const t = convexTest(schema, modules);
  const boardId = await seedOwner(t);
  const me = t.withIdentity({ subject: "owner" });
  await me.mutation(api.users.ensureUser, {});
  const url = listingSite.canonicalUrl("10000000000003");

  expect(await me.mutation(api.captures.share, { url: `${url}&utm_source=share` })).toEqual({ listingId: null });
  // Sharing it again does not queue it twice.
  await me.mutation(api.captures.share, { url });
  expect(await me.query(api.captures.pending, {})).toMatchObject([{ url, externalId: "10000000000003" }]);
  await expect(me.mutation(api.captures.share, { url: "https://example.com/car" })).rejects.toThrow(/Not a supported/);

  // Any capture route clears it.
  const { listingId } = await t.mutation(internal.listings.save, { boardId, capturedBy: "mcp", url, data: car });
  expect(await me.query(api.captures.pending, {})).toEqual([]);
  expect(await me.mutation(api.captures.share, { url })).toEqual({ listingId });
  expect(await me.query(api.captures.pending, {})).toEqual([]);
});

test("only the board's user can dismiss its shared listings", async () => {
  const t = convexTest(schema, modules);
  await seedOwner(t);
  const me = t.withIdentity({ subject: "owner" });
  const friend = t.withIdentity({ subject: "friend" });
  await me.mutation(api.users.ensureUser, {});
  await friend.mutation(api.users.ensureUser, {});
  await me.mutation(api.captures.share, { url: listingSite.canonicalUrl("10000000000004") });
  const [{ requestId }] = (await me.query(api.captures.pending, {}))!;

  await expect(friend.mutation(api.captures.dismiss, { requestId })).rejects.toThrow(/Not on your board/);
  await me.mutation(api.captures.dismiss, { requestId });
  expect(await me.query(api.captures.pending, {})).toEqual([]);
});
