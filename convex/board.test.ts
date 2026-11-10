import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules, seedOwner } from "./test.setup";
import { listingSite } from "../shared/sources";

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

// Signs in as a Clerk account and sets its user up, as the web app does.
async function signIn(t: TestConvex<typeof schema>, subject: string) {
  const user = t.withIdentity({ subject, name: subject });
  await user.mutation(api.users.ensureUser, {});
  return user;
}

// The owner's user and board exist before any account has signed in.
async function setup() {
  const t = convexTest(schema, modules);
  const boardId = await seedOwner(t);
  const { listingId } = await t.mutation(internal.listings.save, {
    boardId,
    capturedBy: "test",
    url: listingSite.canonicalUrl("10000000000002"),
    data: car,
  });
  return { t, me: await signIn(t, "owner"), listingId };
}

test("signed out, or before the user is set up, the board reads as null", async () => {
  const { t } = await setup();
  expect(await t.query(api.board.get, {})).toBeNull();
  expect(await t.withIdentity({ subject: "invited" }).query(api.board.get, {})).toBeNull();
  await expect(t.mutation(api.users.ensureUser, {})).rejects.toThrow(/Sign in first/);
});

test("the first account takes over the owner's board; later accounts get their own", async () => {
  const { t, me } = await setup();
  expect((await me.query(api.board.get, {}))?.listings).toHaveLength(1);

  const friend = await signIn(t, "friend");
  expect(await friend.query(api.board.get, {})).toMatchObject({ name: "Watchlist", listings: [] });
  // Signing in again reuses the same user and board.
  await signIn(t, "owner");
  await signIn(t, "friend");
  const counts = await t.run(async (ctx) => [(await ctx.db.query("users").collect()).length, (await ctx.db.query("boards").collect()).length]);
  expect(counts).toEqual([2, 2]);
});

test("shows card data without the options list", async () => {
  const { me } = await setup();
  const board = await me.query(api.board.get, {});
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
  const { t, me, listingId } = await setup();
  await me.mutation(api.board.move, { listingId, tier: "S", rank: 5 });
  const board = await me.query(api.board.get, {});
  expect(board?.listings[0]).toMatchObject({ tier: "S", rank: 5 });

  const friend = await signIn(t, "friend");
  await expect(friend.mutation(api.board.move, { listingId, tier: "rejected", rank: 1 })).rejects.toThrow(
    /not on your board/,
  );
});

test("removing a car keeps a listing another board tracks, and deletes it with the last", async () => {
  const { t, me, listingId } = await setup();
  const friend = await signIn(t, "friend");
  const friendBoard = await t.run((ctx) => ctx.db.query("boards").order("desc").first());
  await t.mutation(internal.listings.save, {
    boardId: friendBoard!._id,
    capturedBy: "test",
    url: listingSite.canonicalUrl("10000000000002"),
    data: car,
  });
  const storageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["jpeg"]));
    await ctx.db.insert("photos", { listingId, sourceUrl: "https://img.example/1.jpg", position: 0, status: "stored", storageId: id });
    return id;
  });

  await me.mutation(api.board.remove, { listingId });
  expect((await me.query(api.board.get, {}))?.listings).toEqual([]);
  await expect(me.mutation(api.board.remove, { listingId })).rejects.toThrow(/not on your board/);
  expect(await friend.query(api.board.listing, { listingId })).toMatchObject({ photos: [{ status: "stored" }] });

  await friend.mutation(api.board.remove, { listingId });
  const left = await t.run(async (ctx) => ({
    listing: await ctx.db.get(listingId),
    snapshots: await ctx.db.query("snapshots").collect(),
    photos: await ctx.db.query("photos").collect(),
    file: await ctx.storage.getUrl(storageId),
  }));
  expect(left).toEqual({ listing: null, snapshots: [], photos: [], file: null });
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
  const boardId = await seedOwner(t);
  const { listingId } = await t.mutation(internal.listings.save, {
    boardId,
    capturedBy: "test",
    url: listingSite.canonicalUrl("10000000000002"),
    data: { ...car, details: { ...car.details, options } },
  });
  const me = await signIn(t, "owner");
  await me.mutation(api.board.saveSettings, { models, keySpecs });
  const specsOf = async () => (await me.query(api.board.get, {}))!.listings[0].keySpecs;
  return { me, listingId, specsOf };
}

test("key specs come from the listing until the user sets them", async () => {
  const { me, listingId, specsOf } = await setupWithSpecs(["LED headlights incl. PDLS+", "918 buckets"]);
  expect(await specsOf()).toEqual([
    { id: "pdls", name: "PDLS+", kind: "check", value: "yes", source: "listing" },
    { id: "seats", name: "Seats", kind: "choice", value: "918 buckets", source: "listing" },
  ]);

  // The listing can be wrong: the user's value wins, and clearing it falls back.
  await me.mutation(api.board.setSpecValue, { listingId, specId: "pdls", value: "no" });
  expect((await specsOf())[0]).toMatchObject({ value: "no", source: "you" });
  await me.mutation(api.board.setSpecValue, { listingId, specId: "pdls", value: null });
  expect((await specsOf())[0]).toMatchObject({ value: "yes", source: "listing" });
});

test("listing matches are whole terms: PDLS does not count as PDLS+", async () => {
  const { specsOf } = await setupWithSpecs(["PDLS+ preparation"]);
  const { specsOf: plain } = await setupWithSpecs(["Matrix PDLS"]);
  expect((await specsOf())[0]).toMatchObject({ value: "yes" });
  expect((await plain())[0]).toMatchObject({ value: null, source: null });
});

test("model-specific specs apply only to that model", async () => {
  const { me, listingId, specsOf } = await setupWithSpecs([]);
  expect((await specsOf()).map((s) => s.id)).toEqual(["pdls", "seats"]);
  await me.mutation(api.board.setModel, { listingId, modelId: "gt4" });
  expect((await specsOf()).map((s) => s.id)).toEqual(["pdls", "seats", "cage"]);
  await expect(me.mutation(api.board.setModel, { listingId, modelId: "nope" })).rejects.toThrow(/Unknown model/);
});

test("a new choice is added to the spec's list", async () => {
  const { me, listingId } = await setupWithSpecs([]);
  await me.mutation(api.board.setSpecValue, { listingId, specId: "seats", value: " Carbon buckets " });
  const board = await me.query(api.board.get, {});
  expect(board!.keySpecs[1].choices).toEqual(["918 buckets", "Sport seats Plus", "Carbon buckets"]);
  expect(board!.listings[0].keySpecs[1]).toMatchObject({ value: "Carbon buckets", source: "you" });
  // A case-only variant reuses the existing choice instead of adding a twin.
  await me.mutation(api.board.setSpecValue, { listingId, specId: "seats", value: "carbon BUCKETS" });
  const again = await me.query(api.board.get, {});
  expect(again!.keySpecs[1].choices).toHaveLength(3);
  expect(again!.listings[0].keySpecs[1].value).toBe("Carbon buckets");
  await expect(me.mutation(api.board.setSpecValue, { listingId, specId: "pdls", value: "maybe" })).rejects.toThrow(
    /yes or no/,
  );
});

test("settings reject duplicate ids and drop links to deleted models", async () => {
  const { me } = await setupWithSpecs([]);
  await expect(
    me.mutation(api.board.saveSettings, { models: [models[0], models[0]], keySpecs: [] }),
  ).rejects.toThrow(/unique/);
  await me.mutation(api.board.saveSettings, { models: [models[0]], keySpecs });
  expect((await me.query(api.board.get, {}))!.keySpecs[2].models).toEqual([]);
});

test("a choice shared by two specs is not filled in from the listing", async () => {
  const t = convexTest(schema, modules);
  const boardId = await seedOwner(t);
  await t.mutation(internal.listings.save, {
    boardId,
    capturedBy: "test",
    url: listingSite.canonicalUrl("10000000000002"),
    data: { ...car, details: { ...car.details, color: "Chalk", options: ["Guards Red seat belts"] } },
  });
  const me = await signIn(t, "owner");
  await me.mutation(api.board.saveSettings, {
    models: [],
    keySpecs: [
      { id: "colour", name: "Colour", kind: "choice", choices: ["Guards Red", "Chalk"], models: [] },
      { id: "accent", name: "Interior accent", kind: "choice", choices: ["Guards Red", "Racing Yellow"], models: [] },
    ],
  });
  const specs = (await me.query(api.board.get, {}))!.listings[0].keySpecs;
  expect(specs.map((s) => s.value)).toEqual(["Chalk", null]);
});

test("settings keep preferences only for values and models that exist", async () => {
  const { me } = await setupWithSpecs([]);
  const returned = await me.mutation(api.board.saveSettings, {
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
  const saved = (await me.query(api.board.get, {}))!.keySpecs;
  expect(saved[0].preferred).toEqual([{ value: "918 buckets", models: ["gt3"] }]);
  expect(saved[1].preferred).toEqual([{ value: "yes", models: [] }]);

  // A preference for deleted models only goes away rather than widening to every model.
  const onlyGone = await me.mutation(api.board.saveSettings, {
    models,
    keySpecs: [{ ...keySpecs[1], preferred: [{ value: "918 buckets", models: ["gone"] }] }],
  });
  expect(onlyGone.keySpecs[0].preferred).toEqual([]);
  // The editor adopts what was stored, so its unsaved state clears after a save.
  expect(returned.keySpecs).toEqual(saved);
});

test("model limits are stored and checked on save, and deal-breakers kept", async () => {
  const { me } = await setupWithSpecs([]);
  const saved = await me.mutation(api.board.saveSettings, {
    models: [{ ...models[0], maxPrice: 180_000, minYear: 2017, maxYear: 2019 }, models[1]],
    keySpecs: [{ ...keySpecs[1], preferred: [{ value: "Sport seats Plus", models: ["gt3"], avoid: true }] }],
  });
  expect(saved.models[0]).toEqual({ id: "gt3", name: "991.2 GT3", maxPrice: 180_000, minYear: 2017, maxYear: 2019 });
  expect(saved.keySpecs[0].preferred).toEqual([{ value: "Sport seats Plus", models: ["gt3"], avoid: true }]);

  const save = (model: (typeof saved.models)[number]) =>
    me.mutation(api.board.saveSettings, { models: [model], keySpecs: [] });
  await expect(save({ ...models[0], minYear: 2020, maxYear: 2018 })).rejects.toThrow(/first year for 991.2 GT3 is after the last/);
  await expect(save({ ...models[0], minYear: 20 })).rejects.toThrow(/Year for 991.2 GT3 must be 1950–2100/);
  await expect(save({ ...models[0], maxMileageKm: 0.5 })).rejects.toThrow(/Mileage/);
});

test("notes, pros and cons are saved per car, each field on its own", async () => {
  const { t, me, listingId } = await setup();
  await me.mutation(api.board.setNotes, { listingId, notes: "Ask about the IMS", pros: [" Low km ", ""] });
  await me.mutation(api.board.setNotes, { listingId, cons: ["Stone chips"] });
  expect(await me.query(api.board.listing, { listingId })).toMatchObject({
    notes: "Ask about the IMS",
    pros: ["Low km"],
    cons: ["Stone chips"],
  });
  await expect(me.mutation(api.board.setNotes, { listingId, pros: ["x".repeat(201)] })).rejects.toThrow(/200/);
  await expect(t.mutation(api.board.setNotes, { listingId, notes: "" })).rejects.toThrow();
});
