import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const car = {
  title: "Porsche 911 GT3",
  price: { amount: 159_999, currency: "EUR" },
  seller: { type: "dealer" as const, location: "80331 München" },
  details: {
    category: "car" as const,
    make: "Porsche",
    model: "991",
    mileageKm: 39_500,
    fuel: "petrol" as const,
    gearbox: "automatic" as const,
    options: ["Sport seats"],
  },
  photoUrls: [],
};

async function setup() {
  const t = convexTest(schema, modules);
  const token = await t.action(internal.tokens.create, { name: "web" });
  const board = await t.run((ctx) => ctx.db.query("boards").first());
  const { listingId } = await t.mutation(internal.listings.save, {
    boardId: board!._id,
    capturedBy: "test",
    url: "https://listings.example/fahrzeuge/details.html?id=10000000000002",
    data: car,
  });
  return { t, token, listingId };
}

test("a bad token reads as signed out", async () => {
  const { t } = await setup();
  expect(await t.query(api.board.get, { token: "pit_nope" })).toBeNull();
  expect(await t.query(api.board.get, { token: `pit_${"0".repeat(64)}` })).toBeNull();
});

test("shows card data without the options list", async () => {
  const { t, token } = await setup();
  const board = await t.query(api.board.get, { token });
  expect(board?.listings[0]).toMatchObject({
    tier: "watching",
    title: "Porsche 911 GT3",
    specs: { make: "Porsche", mileageKm: 39_500 },
    location: "80331 München",
    coverUrl: null,
  });
  expect(board?.listings[0].specs).not.toHaveProperty("options");
});

test("moves a car between tiers and orders by rank", async () => {
  const { t, token, listingId } = await setup();
  await t.mutation(api.board.move, { token, listingId, tier: "S", rank: 5 });
  const board = await t.query(api.board.get, { token });
  expect(board?.listings[0]).toMatchObject({ tier: "S", rank: 5 });

  const other = await t.action(internal.tokens.create, { name: "other" });
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Friend" });
    const boardId = await ctx.db.insert("boards", { name: "Friend's", ownerId: userId });
    const token = (await ctx.db.query("apiTokens").collect()).find((row) => row.name === "other")!;
    await ctx.db.patch(token._id, { userId, boardId });
  });
  await expect(t.mutation(api.board.move, { token: other, listingId, tier: "rejected", rank: 1 })).rejects.toThrow(
    /not on your board/,
  );
});
