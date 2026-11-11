import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { boardModel, homeLocation, keySpec, listingDataValidator, listingStatus, point, tiers } from "./validators";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    // The Clerk account that signs in as this user. Unset until its first sign-in.
    tokenIdentifier: v.optional(v.string()),
    home: v.optional(homeLocation),
  }).index("by_token_identifier", ["tokenIdentifier"]),

  boards: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
    models: v.optional(v.array(boardModel)),
    keySpecs: v.optional(v.array(keySpec)),
  }).index("by_owner", ["ownerId"]),

  // The external ad itself, shared by every board that tracks it.
  listings: defineTable({
    source: v.string(),
    externalId: v.string(),
    url: v.string(),
    status: listingStatus,
    // Last data seen while available; kept after removal.
    current: listingDataValidator,
    firstSeenAt: v.number(),
    lastCheckedAt: v.number(),
    lastChangedAt: v.number(),
    removedAt: v.optional(v.number()),
    // A re-check that could not read the page. Never taken to mean the ad is gone.
    lastFailedCheckAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    // The seller's location as coordinates: null when the geocoder found nothing, unset
    // until it has been looked up. `geoPending` queues the lookup (convex/geo.ts).
    geo: v.optional(v.union(point, v.null())),
    geoPending: v.optional(v.literal(true)),
  })
    .index("by_source_external", ["source", "externalId"])
    .index("by_geo_pending", ["geoPending"]),

  // Append-only history: one row per capture that changed something.
  snapshots: defineTable({
    listingId: v.id("listings"),
    capturedAt: v.number(),
    capturedBy: v.string(),
    status: listingStatus,
    data: v.optional(listingDataValidator),
  }).index("by_listing", ["listingId", "capturedAt"]),

  photos: defineTable({
    listingId: v.id("listings"),
    sourceUrl: v.string(),
    position: v.number(),
    status: v.union(v.literal("pending"), v.literal("stored"), v.literal("failed")),
    storageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
  })
    .index("by_listing", ["listingId", "position"])
    .index("by_listing_source", ["listingId", "sourceUrl"]),

  // A listing's place on a board: the user's decision, never set by agents.
  boardItems: defineTable({
    boardId: v.id("boards"),
    listingId: v.id("listings"),
    tier: tiers,
    rank: v.number(),
    addedAt: v.number(),
    addedBy: v.string(),
    modelId: v.optional(v.string()),
    // The user's own key-spec values by spec id: "yes"/"no" for checks, the choice for choices.
    specValues: v.optional(v.record(v.string(), v.string())),
    // The user's own take on the car.
    notes: v.optional(v.string()),
    pros: v.optional(v.array(v.string())),
    cons: v.optional(v.array(v.string())),
  })
    .index("by_board", ["boardId", "tier", "rank"])
    .index("by_board_listing", ["boardId", "listingId"])
    .index("by_listing", ["listingId"]),

  // Listings the user shared to the app, e.g. from a phone's share sheet, that are not on
  // the board yet. The app never opens them itself: an agent or the extension captures
  // the page, and saving it clears the request (see convex/captures.ts).
  captureRequests: defineTable({
    boardId: v.id("boards"),
    source: v.string(),
    externalId: v.string(),
    url: v.string(),
    // What the share sheet called it, usually the page title; untrusted, shown as text.
    title: v.optional(v.string()),
  }).index("by_board_source_external", ["boardId", "source", "externalId"]),
});
