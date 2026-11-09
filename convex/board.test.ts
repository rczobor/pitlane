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

const models = [
  { id: "gt3", name: "991.2 GT3" },
  { id: "gt4", name: "718 GT4" },
];
const keySpecs = [
  { id: "pdls", name: "PDLS+", kind: "check" as const, choices: [], models: [] },
  { id: "seats", name: "Seats", kind: "choice" as const, choices: ["918 buckets", "Sport seats Plus"], models: [] },
  { id: "cage", name: "Roll cage", kind: "check" as const, choices: [], models: ["gt4"] },
];

async function setupWithSpecs(options: string[]) {
  const t = convexTest(schema, modules);
  const token = await t.action(internal.tokens.create, { name: "web" });
  const board = await t.run((ctx) => ctx.db.query("boards").first());
  const { listingId } = await t.mutation(internal.listings.save, {
    boardId: board!._id,
    capturedBy: "test",
    url: "https://listings.example/fahrzeuge/details.html?id=10000000000002",
    data: { ...car, details: { ...car.details, options } },
  });
  await t.mutation(api.board.saveSettings, { token, models, keySpecs });
  const specsOf = async () => (await t.query(api.board.get, { token }))!.listings[0].keySpecs;
  return { t, token, listingId, specsOf };
}

test("key specs come from the listing until the user sets them", async () => {
  const { t, token, listingId, specsOf } = await setupWithSpecs(["LED headlights incl. PDLS+", "918 buckets"]);
  expect(await specsOf()).toEqual([
    { id: "pdls", name: "PDLS+", kind: "check", value: "yes", source: "listing" },
    { id: "seats", name: "Seats", kind: "choice", value: "918 buckets", source: "listing" },
  ]);

  // The listing can be wrong: the user's value wins, and clearing it falls back.
  await t.mutation(api.board.setSpecValue, { token, listingId, specId: "pdls", value: "no" });
  expect((await specsOf())[0]).toMatchObject({ value: "no", source: "you" });
  await t.mutation(api.board.setSpecValue, { token, listingId, specId: "pdls", value: null });
  expect((await specsOf())[0]).toMatchObject({ value: "yes", source: "listing" });
});

test("listing matches are whole terms: PDLS does not count as PDLS+", async () => {
  const { specsOf } = await setupWithSpecs(["PDLS+ preparation"]);
  const { specsOf: plain } = await setupWithSpecs(["Matrix PDLS"]);
  expect((await specsOf())[0]).toMatchObject({ value: "yes" });
  expect((await plain())[0]).toMatchObject({ value: null, source: null });
});

test("model-specific specs apply only to that model", async () => {
  const { t, token, listingId, specsOf } = await setupWithSpecs([]);
  expect((await specsOf()).map((s) => s.id)).toEqual(["pdls", "seats"]);
  await t.mutation(api.board.setModel, { token, listingId, modelId: "gt4" });
  expect((await specsOf()).map((s) => s.id)).toEqual(["pdls", "seats", "cage"]);
  await expect(t.mutation(api.board.setModel, { token, listingId, modelId: "nope" })).rejects.toThrow(/Unknown model/);
});

test("a new choice is added to the spec's list", async () => {
  const { t, token, listingId } = await setupWithSpecs([]);
  await t.mutation(api.board.setSpecValue, { token, listingId, specId: "seats", value: " Carbon buckets " });
  const board = await t.query(api.board.get, { token });
  expect(board!.keySpecs[1].choices).toEqual(["918 buckets", "Sport seats Plus", "Carbon buckets"]);
  expect(board!.listings[0].keySpecs[1]).toMatchObject({ value: "Carbon buckets", source: "you" });
  // A case-only variant reuses the existing choice instead of adding a twin.
  await t.mutation(api.board.setSpecValue, { token, listingId, specId: "seats", value: "carbon BUCKETS" });
  const again = await t.query(api.board.get, { token });
  expect(again!.keySpecs[1].choices).toHaveLength(3);
  expect(again!.listings[0].keySpecs[1].value).toBe("Carbon buckets");
  await expect(t.mutation(api.board.setSpecValue, { token, listingId, specId: "pdls", value: "maybe" })).rejects.toThrow(
    /yes or no/,
  );
});

test("settings reject duplicate ids and drop links to deleted models", async () => {
  const { t, token } = await setupWithSpecs([]);
  await expect(
    t.mutation(api.board.saveSettings, { token, models: [models[0], models[0]], keySpecs: [] }),
  ).rejects.toThrow(/unique/);
  await t.mutation(api.board.saveSettings, { token, models: [models[0]], keySpecs });
  expect((await t.query(api.board.get, { token }))!.keySpecs[2].models).toEqual([]);
});

test("a choice shared by two specs is not filled in from the listing", async () => {
  const t = convexTest(schema, modules);
  const token = await t.action(internal.tokens.create, { name: "web" });
  const board = await t.run((ctx) => ctx.db.query("boards").first());
  await t.mutation(internal.listings.save, {
    boardId: board!._id,
    capturedBy: "test",
    url: "https://listings.example/fahrzeuge/details.html?id=10000000000002",
    data: { ...car, details: { ...car.details, color: "Chalk", options: ["Guards Red seat belts"] } },
  });
  await t.mutation(api.board.saveSettings, {
    token,
    models: [],
    keySpecs: [
      { id: "colour", name: "Colour", kind: "choice", choices: ["Guards Red", "Chalk"], models: [] },
      { id: "accent", name: "Interior accent", kind: "choice", choices: ["Guards Red", "Racing Yellow"], models: [] },
    ],
  });
  const specs = (await t.query(api.board.get, { token }))!.listings[0].keySpecs;
  expect(specs.map((s) => s.value)).toEqual(["Chalk", null]);
});

test("settings keep preferences only for values and models that exist", async () => {
  const { t, token } = await setupWithSpecs([]);
  const returned = await t.mutation(api.board.saveSettings, {
    token,
    models,
    keySpecs: [
      {
        ...keySpecs[1],
        preferred: [
          { value: "918 buckets", models: ["gt3", "gone"] },
          { value: "Bean bag", models: [] },
        ],
      },
      { ...keySpecs[0], preferred: [{ value: "maybe", models: [] }, { value: "yes", models: [] }] },
    ],
  });
  const saved = (await t.query(api.board.get, { token }))!.keySpecs;
  expect(saved[0].preferred).toEqual([{ value: "918 buckets", models: ["gt3"] }]);
  expect(saved[1].preferred).toEqual([{ value: "yes", models: [] }]);

  // A preference for deleted models only goes away rather than widening to every model.
  const onlyGone = await t.mutation(api.board.saveSettings, {
    token,
    models,
    keySpecs: [{ ...keySpecs[1], preferred: [{ value: "918 buckets", models: ["gone"] }] }],
  });
  expect(onlyGone.keySpecs[0].preferred).toEqual([]);
  // The editor adopts what was stored, so its unsaved state clears after a save.
  expect(returned.keySpecs).toEqual(saved);
});
