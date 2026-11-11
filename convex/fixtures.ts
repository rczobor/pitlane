// Synthetic board for design reviews (`pnpm dev:design`) and PR previews. Seeds a local
// deployment, wiping it first, so every capture renders the same cars; a preview gets
// the same board when it is created.
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { point, tiers } from "./validators";
import type { ListingData } from "../shared/listing";
import { listingSite } from "../shared/sources";

// Two boards whose users no account owns yet. The web app signs in with Clerk: the first
// account takes over the seeded board, a second one the empty board.

// Photos are not part of the repository: `scripts/dev-design.sh` passes listing photo
// URLs from a local file (PITLANE_FIXTURE_PHOTOS). Without them every car shows the
// "No photo saved" panel. Each car takes `count` photos starting at slot `from`.
type PhotoSlots = { from: number; count?: number };

type FixtureCar = {
  id: string;
  tier: Infer<typeof tiers>;
  model: string;
  /** Asking prices, oldest first; history is spread over the weeks before today. */
  prices: number[];
  removed?: boolean;
  /** The last re-check could not read the page. */
  failed?: string;
  take?: { notes?: string; pros?: string[]; cons?: string[] };
  // The user's own key-spec values; anything else comes from the listing text or stays unknown.
  specs?: Record<string, string>;
  data: Omit<ListingData, "price" | "seller" | "details" | "photoUrls"> & {
    photos?: PhotoSlots;
    price?: Partial<ListingData["price"]>;
    seller?: Partial<ListingData["seller"]>;
    details: Partial<Extract<ListingData["details"], { category: "car" }>> & { model: string; mileageKm: number };
  };
};

const options = ["Navigation system", "Heated seats", "Apple CarPlay", "Cruise control", "Bose Surround Sound"];

// A sample shortlist: the models and the specs that decide a GT car's tier.
const models = [
  { id: "gt4", name: "718 GT4", maxPrice: 100_000, maxMileageKm: 30_000 },
  { id: "gt4rs", name: "718 GT4 RS" },
  { id: "9912-gt3", name: "991.2 GT3", maxPrice: 165_000, minYear: 2017, maxYear: 2019, maxMileageKm: 50_000 },
  { id: "9912-gt3t", name: "991.2 GT3 Touring" },
  { id: "9912-gt3rs", name: "991.2 GT3 RS" },
  { id: "9921-gt3", name: "992.1 GT3" },
  { id: "9921-gt3t", name: "992.1 GT3 Touring" },
];
const keySpecs = [
  { id: "seats", name: "Seats", kind: "choice" as const, choices: ["918 buckets", "Carbon buckets", "Sport seats Plus", "Adaptive sport seats"], models: [], preferred: [{ value: "918 buckets", models: [] }, { value: "Adaptive sport seats", models: [], avoid: true }] },
  { id: "pdls", name: "PDLS+", kind: "check" as const, choices: [], models: [], preferred: [{ value: "yes", models: [] }] },
  // PDK for the 718s, manual for the GT3s; the RS only comes with PDK.
  { id: "gearbox", name: "Gearbox", kind: "choice" as const, choices: ["PDK", "Manual"], models: [], preferred: [{ value: "PDK", models: ["gt4", "gt4rs"] }, { value: "Manual", models: ["9912-gt3", "9912-gt3t", "9921-gt3", "9921-gt3t"] }] },
  { id: "colour", name: "Colour", kind: "choice" as const, choices: ["GT Silver", "Chalk", "Python Green", "Shark Blue", "Guards Red", "White", "Black"], models: [] },
  { id: "cage", name: "Roll cage", kind: "check" as const, choices: [], models: ["gt4", "gt4rs", "9912-gt3", "9912-gt3rs", "9921-gt3"] },
  { id: "accent", name: "Interior accent", kind: "choice" as const, choices: ["Black", "Guards Red", "Shark Blue", "Racing Yellow"], models: [] },
];

const cars: FixtureCar[] = [
  {
    id: "10000000000002",
    tier: "S",
    model: "9912-gt3",
    prices: [169_900, 164_900, 159_999],
    specs: { seats: "918 buckets", gearbox: "Manual", colour: "GT Silver", cage: "yes", accent: "Black" },
    take: {
      notes: "Ask for the service history and whether the lift was retrofitted.",
      pros: ["Manual with 918 buckets", "Approved warranty"],
      cons: ["Clubsport cage makes the rear seats area useless"],
    },
    data: {
      title: "Porsche 991.2 GT3 Clubsport, Lift, Approved 09.2027",
      price: { vatDeductible: true, netAmount: 134_453 },
      seller: { name: "Kurvenreich Automobile", location: "80331 München" },
      details: { model: "911 GT3", firstRegistration: "2018-03", mileageKm: 39_500, gearbox: "manual", powerKw: 368, color: "GT Silver Metallic", options: [...options, "LED headlights incl. PDLS+", "Front axle lift", "Clubsport package"] },
      description:
        "Porsche Approved Garantie bis 09.2027. Scheckheftgepflegt, unfallfrei. Bremsen und Reifen beim letzten Service neu.\n\nBesichtigung nur nach Terminvereinbarung.",
      descriptionTranslation: {
        from: "de",
        text: "Porsche Approved warranty until 09.2027. Full service history (stamped service book), accident-free. New brakes and tyres at the last service.\n\nViewing by appointment only.",
      },
      photos: { from: 0, count: 12 },
    },
  },
  {
    id: "10000000000003",
    tier: "A",
    model: "gt4rs",
    prices: [189_900],
    specs: { pdls: "no", seats: "Carbon buckets" },
    data: {
      title: "Porsche 718 Cayman GT4 RS Weissach package, PDK",
      seller: { name: "Elbkurve Automobile", location: "20095 Hamburg" },
      details: { model: "718 Cayman GT4 RS", firstRegistration: "2022-09", mileageKm: 8_900, gearbox: "automatic", powerKw: 368, color: "Python Green", options: [...options, "Weissach package", "Roll cage"] },
      photos: { from: 1 },
    },
  },
  {
    id: "10000000000004",
    tier: "A",
    model: "9921-gt3",
    prices: [214_800],
    specs: { gearbox: "Manual" },
    data: {
      title: "Porsche 992 GT3 manual, Clubsport, PDLS+",
      seller: { name: "Rheinlinie Sportwagen", location: "50667 Köln" },
      details: { model: "911 GT3", firstRegistration: "2022-04", mileageKm: 14_200, gearbox: "manual", powerKw: 375, color: "Shark Blue", options },
      photos: { from: 2 },
    },
  },
  {
    id: "10000000000005",
    tier: "B",
    model: "9912-gt3rs",
    prices: [229_000],
    data: {
      title: "Porsche 911 GT3 RS (991.2), PDK, Guards Red",
      seller: { name: "Autohaus Schikane", location: "70173 Stuttgart" },
      details: { model: "911 GT3 RS", firstRegistration: "2019-02", mileageKm: 21_000, gearbox: "automatic", powerKw: 383, color: "Guards Red", options },
      photos: { from: 3 },
    },
  },
  {
    id: "10000000000006",
    tier: "watching",
    model: "gt4",
    prices: [99_900, 96_500],
    failed: "timed out",
    specs: { seats: "Sport seats Plus", pdls: "no" },
    data: {
      title: "Porsche 718 Cayman GT4 PDK, Chalk",
      seller: { name: "Salzachring Automobile", location: "5020 Salzburg", country: "AT" },
      details: { model: "718 Cayman GT4", firstRegistration: "2021-03", mileageKm: 18_300, gearbox: "automatic", powerKw: 309, color: "Chalk", options: [...options, "PDK"] },
      photos: { from: 4 },
    },
  },
  {
    id: "51122334455667",
    tier: "watching",
    model: "9921-gt3t",
    prices: [198_500],
    data: {
      title: "Porsche 992 GT3 Touring, manual, leather package",
      seller: { type: "private", location: "80331 München" },
      details: { model: "911 GT3 Touring", firstRegistration: "2022-07", mileageKm: 9_400, gearbox: "manual", powerKw: 375, color: "Black", options: [...options, "LED headlights incl. PDLS+"] },
      photos: { from: 5 },
    },
  },
  {
    id: "52233445566778",
    tier: "watching",
    model: "9912-gt3",
    prices: [149_500],
    data: {
      title: "Porsche 911 GT3 (991.2) PDK, Approved",
      price: { vatDeductible: true, netAmount: 125_630 },
      seller: { name: "Mainkurve Sportwagen", location: "60311 Frankfurt am Main" },
      details: { model: "911 GT3", firstRegistration: "2017-11", mileageKm: 33_800, gearbox: "automatic", powerKw: 368, options },
      // No photos: shows how a listing without them looks.
    },
  },
  {
    id: "53344556677889",
    tier: "rejected",
    model: "9912-gt3t",
    prices: [139_900],
    removed: true,
    specs: { seats: "Adaptive sport seats" },
    data: {
      title: "Porsche 911 GT3 Touring (991.2), manual",
      seller: { type: "private", location: "28195 Bremen" },
      details: { model: "911 GT3 Touring", firstRegistration: "2018-07", mileageKm: 58_000, gearbox: "manual", powerKw: 368, previousOwners: 3, options },
      photos: { from: 6 },
    },
  },
  {
    id: "54455667788990",
    tier: "rejected",
    model: "gt4",
    prices: [89_400],
    specs: { gearbox: "Manual", pdls: "no", seats: "Sport seats Plus" },
    data: {
      title: "Porsche 718 Cayman GT4 manual, one owner",
      seller: { name: "Grachtenring Auto", location: "1012 Amsterdam", country: "NL" },
      details: { model: "718 Cayman GT4", firstRegistration: "2020-05", mileageKm: 46_500, gearbox: "manual", powerKw: 309, options },
      photos: { from: 7 },
    },
  },
  // A and Watching hold more cars than fit across a wide screen, so long lanes show how
  // they scroll.
  {
    id: "55566677788800",
    tier: "A",
    model: "9912-gt3",
    prices: [147_500],
    specs: { pdls: "yes", seats: "918 buckets" },
    data: {
      title: "Porsche 911 GT3 (991.2) PDK, Clubsport package",
      seller: { name: "Rheinlinie Sportwagen", location: "50667 Köln" },
      details: { model: "911 GT3", firstRegistration: "2018-04", mileageKm: 47_800, gearbox: "automatic", powerKw: 368, color: "Guards Red", options },
      photos: { from: 8 },
    },
  },
  {
    id: "55566677788811",
    tier: "A",
    model: "9912-gt3t",
    prices: [161_000, 156_500],
    specs: { gearbox: "Manual", colour: "White" },
    data: {
      title: "Porsche 911 GT3 Touring (991.2), manual, leather",
      seller: { name: "Autohaus Schikane", location: "70173 Stuttgart" },
      details: { model: "911 GT3 Touring", firstRegistration: "2018-11", mileageKm: 57_300, gearbox: "manual", powerKw: 368, color: "White", options },
      photos: { from: 9 },
    },
  },
  {
    id: "55566677788822",
    tier: "A",
    model: "gt4",
    prices: [94_800],
    data: {
      title: "Porsche 718 Cayman GT4 PDK, Clubsport, Shark Blue",
      seller: { name: "Salzachring Automobile", location: "5020 Salzburg", country: "AT" },
      details: { model: "718 Cayman GT4", firstRegistration: "2021-06", mileageKm: 12_400, gearbox: "automatic", powerKw: 309, color: "Shark Blue", options },
      photos: { from: 10 },
    },
  },
  {
    id: "55566677788833",
    tier: "watching",
    model: "9921-gt3",
    prices: [209_900],
    data: {
      title: "Porsche 911 GT3 (992) PDK, Lift, ceramic brakes",
      seller: { name: "Kurvenreich Automobile", location: "80331 München" },
      details: { model: "911 GT3", firstRegistration: "2023-02", mileageKm: 6_800, gearbox: "automatic", powerKw: 375, color: "GT Silver", options },
      photos: { from: 11 },
    },
  },
  {
    id: "55566677788844",
    tier: "watching",
    model: "9912-gt3rs",
    prices: [244_500],
    specs: { cage: "yes" },
    data: {
      title: "Porsche 911 GT3 RS (991.2) Weissach, Lift",
      seller: { name: "Elbkurve Automobile", location: "20095 Hamburg" },
      details: { model: "911 GT3 RS", firstRegistration: "2019-05", mileageKm: 15_600, gearbox: "automatic", powerKw: 383, color: "White", options },
      photos: { from: 0 },
    },
  },
  {
    id: "55566677788855",
    tier: "watching",
    model: "gt4rs",
    prices: [179_000],
    data: {
      title: "Porsche 718 Cayman GT4 RS, Clubsport, PDLS+",
      seller: { name: "Grachtenring Auto", location: "1012 Amsterdam", country: "NL" },
      details: { model: "718 Cayman GT4 RS", firstRegistration: "2023-04", mileageKm: 4_100, gearbox: "automatic", powerKw: 368, color: "Black", options },
      photos: { from: 1 },
    },
  },
  {
    id: "55566677788866",
    tier: "watching",
    model: "9912-gt3",
    prices: [139_500],
    data: {
      title: "Porsche 911 GT3 (991.2) manual, unfallfrei",
      seller: { type: "private", location: "28195 Bremen" },
      details: { model: "911 GT3", firstRegistration: "2017-08", mileageKm: 61_300, gearbox: "manual", powerKw: 368, options },
      photos: { from: 2 },
    },
  },
  {
    id: "55566677788877",
    tier: "watching",
    model: "9921-gt3t",
    prices: [201_000],
    specs: { pdls: "yes" },
    data: {
      title: "Porsche 911 GT3 Touring (992), PDK, leather",
      seller: { name: "Mainkurve Sportwagen", location: "60311 Frankfurt am Main" },
      details: { model: "911 GT3 Touring", firstRegistration: "2022-11", mileageKm: 11_900, gearbox: "automatic", powerKw: 375, color: "Chalk", options },
      photos: { from: 3 },
    },
  },
];

const toListing = ({ data: { photos, ...data } }: FixtureCar, amount: number, photoUrls: string[]): ListingData => ({
  ...data,
  photoUrls:
    photos && photoUrls.length > 0
      ? Array.from({ length: photos.count ?? 4 }, (_, i) => photoUrls[(photos.from + i) % photoUrls.length])
      : [],
  price: { currency: "EUR", ...data.price, amount },
  seller: { type: "dealer", country: "DE", ...data.seller },
  details: { category: "car", make: "Porsche", fuel: "petrol", gearbox: "automatic", options, ...data.details },
});

// Where the geocoder would place each fixture seller, so seeding never calls it.
const coordinates: Record<string, { lat: number; lng: number }> = {
  "80331 München": { lat: 48.1374, lng: 11.5755 },
  "20095 Hamburg": { lat: 53.5503, lng: 9.993 },
  "50667 Köln": { lat: 50.9384, lng: 6.9599 },
  "70173 Stuttgart": { lat: 48.7784, lng: 9.18 },
  "5020 Salzburg": { lat: 47.8095, lng: 13.055 },
  "60311 Frankfurt am Main": { lat: 50.1109, lng: 8.6821 },
  "28195 Bremen": { lat: 53.0793, lng: 8.8017 },
  "1012 Amsterdam": { lat: 52.373, lng: 4.8924 },
};
const demoHome = { query: "1010 Wien", place: "1010, Innere Stadt, Vienna, Austria", lat: 48.2082, lng: 16.3738 };

// Every fixture function wipes or rewrites data, so on a cloud deployment each refuses
// real data, even when called directly with `convex run`: the wipe runs only on an
// empty database (a preview the CLI just created), the rest only before anyone signs in.
async function fixturesOnly(ctx: MutationCtx, { wipe = false } = {}) {
  if (process.env.CONVEX_CLOUD_URL?.startsWith("http://127.0.0.1")) return;
  const users = ctx.db.query("users");
  const blocking = await (wipe
    ? users.first()
    : users.withIndex("by_token_identifier", (q) => q.gt("tokenIdentifier", "")).first());
  if (blocking) throw new Error("Fixtures only run on a local deployment or a fresh preview");
}

const sharedListingId = "10000000000900";

// Vercel's preview builds also run this, without photos, when they create a preview
// deployment (`convex deploy --preview-run`).
export const seed = internalAction({
  args: { photoUrls: v.optional(v.array(v.string())) },
  handler: async (ctx, { photoUrls = [] }) => {
    const boardId = await ctx.runMutation(internal.fixtures.reset, {});

    for (const [index, car] of cars.entries()) {
      const url = listingSite.canonicalUrl(car.id);
      let listingId: Id<"listings"> | undefined;
      for (const amount of car.prices) {
        const data = toListing(car, amount, photoUrls);
        ({ listingId } = await ctx.runMutation(internal.listings.save, { boardId, capturedBy: "fixtures", url, data }));
      }
      if (car.removed) await ctx.runMutation(internal.listings.markRemoved, { boardId, capturedBy: "fixtures", url });
      await ctx.runMutation(internal.fixtures.place, {
        boardId,
        listingId: listingId!,
        tier: car.tier,
        rank: index,
        modelId: car.model,
        specValues: car.specs ?? {},
        geo: coordinates[car.data.seller?.location ?? ""],
        ...car.take,
      });
      if (car.failed) await ctx.runMutation(internal.listings.markFailed, { boardId, url, reason: car.failed });
    }
    await ctx.runMutation(internal.fixtures.backdate, {});

    // Captures need every photo in storage, so wait for the archive jobs.
    for (let waited = 0; (await ctx.runQuery(internal.fixtures.pendingPhotos, {})) > 0; waited += 500) {
      if (waited > 120_000) throw new Error("Photos did not finish downloading");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  },
});

export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    await fixturesOnly(ctx, { wipe: true });
    for (const table of ["captureRequests", "boardItems", "snapshots", "listings", "boards", "users"] as const) {
      for (const doc of await ctx.db.query(table).collect()) await ctx.db.delete(table, doc._id);
    }
    for (const doc of await ctx.db.query("photos").collect()) {
      if (doc.storageId) await ctx.storage.delete(doc.storageId);
      await ctx.db.delete("photos", doc._id);
    }
    const userId = await ctx.db.insert("users", { name: "Demo driver", home: demoHome });
    const boardId = await ctx.db.insert("boards", { name: "Watchlist", ownerId: userId, models, keySpecs });
    // A listing shared from the phone that nobody has captured yet.
    await ctx.db.insert("captureRequests", {
      boardId,
      source: listingSite.id,
      externalId: sharedListingId,
      url: listingSite.canonicalUrl(sharedListingId),
    });

    const newUserId = await ctx.db.insert("users", { name: "New user" });
    await ctx.db.insert("boards", { name: "Watchlist", ownerId: newUserId });
    return boardId;
  },
});

export const place = internalMutation({
  args: {
    boardId: v.id("boards"),
    listingId: v.id("listings"),
    tier: tiers,
    rank: v.number(),
    modelId: v.string(),
    specValues: v.record(v.string(), v.string()),
    geo: v.optional(point),
    notes: v.optional(v.string()),
    pros: v.optional(v.array(v.string())),
    cons: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { boardId, listingId, geo, ...placement }) => {
    await fixturesOnly(ctx);
    if (geo) await ctx.db.patch("listings", listingId, { geo, geoPending: undefined });
    const item = await ctx.db
      .query("boardItems")
      .withIndex("by_board_listing", (q) => q.eq("boardId", boardId).eq("listingId", listingId))
      .unique();
    if (item) await ctx.db.patch("boardItems", item._id, placement);
  },
});

// Every save above happened just now; spread each car's history over the weeks before
// today, two weeks per change, so the price chart and "added" dates have a shape.
export const backdate = internalMutation({
  args: {},
  handler: async (ctx) => {
    await fixturesOnly(ctx);
    const now = Date.now();
    const day = 86_400_000;
    for (const listing of await ctx.db.query("listings").collect()) {
      const snapshots = await ctx.db
        .query("snapshots")
        .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
        .collect();
      const at = (i: number) => now - (snapshots.length - i) * 14 * day - 3 * day;
      for (const [i, snapshot] of snapshots.entries()) await ctx.db.patch("snapshots", snapshot._id, { capturedAt: at(i) });
      const last = at(snapshots.length - 1);
      await ctx.db.patch("listings", listing._id, {
        firstSeenAt: at(0),
        lastChangedAt: last,
        lastCheckedAt: now - day / 4,
        ...(listing.removedAt !== undefined && { removedAt: last }),
        // A failed check stays the most recent event.
        ...(listing.lastFailedCheckAt !== undefined && { lastCheckedAt: now - 2 * day, lastFailedCheckAt: now - day / 8 }),
      });
    }
  },
});

export const pendingPhotos = internalQuery({
  args: {},
  // Fixture deployments hold a handful of photos.
  // oxlint-disable-next-line @convex-dev/no-filter-in-query
  handler: async (ctx) => (await ctx.db.query("photos").filter((q) => q.eq(q.field("status"), "pending")).collect()).length,
});
