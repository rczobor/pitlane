// Synthetic board for design reviews (`pnpm dev:design`). Seeds only a local
// deployment, wiping it first, so every capture renders the same cars.
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { sha256 } from "./tokens";
import { tiers } from "./validators";
import type { ListingData } from "../shared/listing";

// Sign the browser in during captures. They only ever exist on a local fixture deployment.
export const fixtureToken = `pit_${"f".repeat(64)}`;
export const emptyBoardToken = `pit_${"e".repeat(64)}`;

const photo = (path: string) => `https://img.classistatic.de/api/v1/mo-prod/images/${path}?rule=mo-1600.jpg`;
const photos = [
  photo("00/00000000-0000-4000-8000-000000000001"),
  photo("00/00000000-0000-4000-8000-000000000002"),
  photo("00/00000000-0000-4000-8000-000000000003"),
  photo("00/00000000-0000-4000-8000-000000000004"),
  photo("00/00000000-0000-4000-8000-000000000005"),
  photo("00/00000000-0000-4000-8000-000000000006"),
  photo("00/00000000-0000-4000-8000-000000000007"),
  photo("00/00000000-0000-4000-8000-000000000008"),
  photo("00/00000000-0000-4000-8000-000000000009"),
  photo("00/00000000-0000-4000-8000-000000000010"),
  photo("00/00000000-0000-4000-8000-000000000011"),
  photo("00/00000000-0000-4000-8000-000000000012"),
];
const photoSet = (start: number, count = 4) => Array.from({ length: count }, (_, i) => photos[(start + i) % photos.length]);

type FixtureCar = { id: string; tier: Infer<typeof tiers>; prices: number[]; removed?: boolean; data: Omit<ListingData, "price"> & { price?: Partial<ListingData["price"]> } };

const options = ["Navigation system", "Heated seats", "LED headlights", "Apple CarPlay", "Sport seats", "Cruise control"];

const cars: FixtureCar[] = [
  {
    id: "10000000000002",
    tier: "S",
    prices: [164_900, 159_999],
    data: {
      title: "Porsche 991 911 GT3 Clubsport Lift Approved 09.2027",
      price: { vatDeductible: true, netAmount: 134_453 },
      seller: { type: "dealer", name: "Kurvenreich Automobile", location: "80331 München" },
      details: { category: "car", make: "Porsche", model: "991 GT3", firstRegistration: "2018-03", mileageKm: 39_500, fuel: "petrol", gearbox: "automatic", powerKw: 368, bodyType: "Sports Car/Coupe", color: "White Metallic", options: [...options, "Front axle lift", "Clubsport package", "Carbon bucket seats"] },
      description: "Porsche Approved warranty until 09.2027. New brakes and tyres at the last service.\n\nViewing by appointment only.",
      photoUrls: photoSet(0, 12),
    },
  },
  {
    id: "10000000000003",
    tier: "A",
    prices: [61_490],
    data: {
      title: "BMW M2 Competition DKG, M Performance exhaust",
      seller: { type: "dealer", name: "Autohaus Nordkurve", location: "20095 Hamburg" },
      details: { category: "car", make: "BMW", model: "M2 Competition", firstRegistration: "2020-06", mileageKm: 28_900, fuel: "petrol", gearbox: "automatic", powerKw: 302, options },
      photoUrls: photoSet(1),
    },
  },
  {
    id: "10000000000004",
    tier: "A",
    prices: [54_800],
    data: {
      title: "Audi RS 4 Avant quattro, panoramic roof, B&O",
      seller: { type: "dealer", name: "Autohaus Schikane", location: "50667 Köln" },
      details: { category: "car", make: "Audi", model: "RS 4 Avant", firstRegistration: "2019-11", mileageKm: 74_200, fuel: "petrol", gearbox: "automatic", powerKw: 331, options },
      photoUrls: photoSet(2),
    },
  },
  {
    id: "10000000000005",
    tier: "B",
    prices: [36_950],
    data: {
      title: "VW Golf R 4Motion, DSG, Akrapovič",
      seller: { type: "private", location: "70173 Stuttgart" },
      details: { category: "car", make: "Volkswagen", model: "Golf R", firstRegistration: "2021-04", mileageKm: 41_000, fuel: "petrol", gearbox: "automatic", powerKw: 235, previousOwners: 1, options },
      photoUrls: photoSet(3),
    },
  },
  {
    id: "10000000000006",
    tier: "watching",
    prices: [89_900, 87_500],
    data: {
      title: "Porsche 718 Cayman GT4, manual, Clubsport package",
      seller: { type: "dealer", name: "Zentrum Porsche Leipzig", location: "04109 Leipzig" },
      details: { category: "car", make: "Porsche", model: "718 Cayman GT4", firstRegistration: "2020-02", mileageKm: 18_300, fuel: "petrol", gearbox: "manual", powerKw: 309, options },
      photoUrls: photoSet(4),
    },
  },
  {
    id: "51122334455667",
    tier: "watching",
    prices: [58_900],
    data: {
      title: "Alpine A110 S, carbon roof, Sabelt seats",
      seller: { type: "private", location: "80331 München" },
      details: { category: "car", make: "Alpine", model: "A110 S", firstRegistration: "2022-05", mileageKm: 12_400, fuel: "petrol", gearbox: "automatic", powerKw: 221, options },
      photoUrls: photoSet(5),
    },
  },
  {
    id: "52233445566778",
    tier: "watching",
    prices: [72_500],
    data: {
      title: "Mercedes-AMG C 63 S T-Modell, AMG Performance seats",
      price: { vatDeductible: true, netAmount: 60_924 },
      seller: { type: "dealer", name: "Sternwerk Automobile", location: "60311 Frankfurt am Main" },
      details: { category: "car", make: "Mercedes-Benz", model: "C 63 S AMG T-Modell", firstRegistration: "2019-09", mileageKm: 63_800, fuel: "petrol", gearbox: "automatic", powerKw: 375, options },
      // No photos: shows how a listing without them looks.
      photoUrls: [],
    },
  },
  {
    id: "53344556677889",
    tier: "rejected",
    prices: [33_900],
    removed: true,
    data: {
      title: "Ford Focus RS Performance Edition, Quaife LSD",
      seller: { type: "private", location: "28195 Bremen" },
      details: { category: "car", make: "Ford", model: "Focus RS", firstRegistration: "2018-07", mileageKm: 88_000, fuel: "petrol", gearbox: "manual", powerKw: 257, previousOwners: 3, options },
      photoUrls: photoSet(6),
    },
  },
  {
    id: "54455667788990",
    tier: "rejected",
    prices: [29_400],
    data: {
      title: "Honda Civic Type R GT, one owner, full service history",
      seller: { type: "dealer", name: "Autohaus Apex", location: "90402 Nürnberg" },
      details: { category: "car", make: "Honda", model: "Civic Type R", firstRegistration: "2019-01", mileageKm: 96_500, fuel: "petrol", gearbox: "manual", powerKw: 235, options },
      photoUrls: photoSet(7),
    },
  },
];

export const seed = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!process.env.CONVEX_CLOUD_URL?.startsWith("http://127.0.0.1")) {
      throw new Error("Fixtures only seed a local deployment");
    }
    const boardId = await ctx.runMutation(internal.fixtures.reset, {
      tokenHash: await sha256(fixtureToken),
      emptyTokenHash: await sha256(emptyBoardToken),
    });

    for (const [index, car] of cars.entries()) {
      const url = `https://suchen.mobile.de/fahrzeuge/details.html?id=${car.id}`;
      let listingId: Id<"listings"> | undefined;
      for (const amount of car.prices) {
        const data = { ...car.data, price: { currency: "EUR", ...car.data.price, amount } };
        ({ listingId } = await ctx.runMutation(internal.listings.save, { boardId, capturedBy: "fixtures", url, data }));
      }
      if (car.removed) await ctx.runMutation(internal.listings.markRemoved, { boardId, capturedBy: "fixtures", url });
      await ctx.runMutation(internal.fixtures.place, { boardId, listingId: listingId!, tier: car.tier, rank: index });
    }

    // Captures need every photo in storage, so wait for the archive jobs.
    for (let waited = 0; (await ctx.runQuery(internal.fixtures.pendingPhotos, {})) > 0; waited += 500) {
      if (waited > 120_000) throw new Error("Photos did not finish downloading");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  },
});

export const reset = internalMutation({
  args: { tokenHash: v.string(), emptyTokenHash: v.string() },
  handler: async (ctx, { tokenHash, emptyTokenHash }) => {
    for (const table of ["boardItems", "snapshots", "listings", "apiTokens", "boards", "users"] as const) {
      for (const doc of await ctx.db.query(table).collect()) await ctx.db.delete(doc._id);
    }
    for (const doc of await ctx.db.query("photos").collect()) {
      if (doc.storageId) await ctx.storage.delete(doc.storageId);
      await ctx.db.delete(doc._id);
    }
    const userId = await ctx.db.insert("users", { name: "Demo driver" });
    const boardId = await ctx.db.insert("boards", { name: "Watchlist", ownerId: userId });
    await ctx.db.insert("apiTokens", { name: "design-fixtures", tokenHash, userId, boardId, createdAt: Date.now() });

    const newUserId = await ctx.db.insert("users", { name: "New user" });
    const emptyBoardId = await ctx.db.insert("boards", { name: "Watchlist", ownerId: newUserId });
    await ctx.db.insert("apiTokens", {
      name: "design-fixtures-empty",
      tokenHash: emptyTokenHash,
      userId: newUserId,
      boardId: emptyBoardId,
      createdAt: Date.now(),
    });
    return boardId;
  },
});

export const place = internalMutation({
  args: { boardId: v.id("boards"), listingId: v.id("listings"), tier: tiers, rank: v.number() },
  handler: async (ctx, { boardId, listingId, tier, rank }) => {
    const item = await ctx.db
      .query("boardItems")
      .withIndex("by_board_listing", (q) => q.eq("boardId", boardId).eq("listingId", listingId))
      .unique();
    if (item) await ctx.db.patch(item._id, { tier, rank });
  },
});

export const pendingPhotos = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("photos").filter((q) => q.eq(q.field("status"), "pending")).collect()).length,
});
