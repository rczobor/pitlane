import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { listingDataValidator, listingStatus, tiers } from "./validators";

export default defineSchema({
  users: defineTable({
    name: v.string(),
  }),

  boards: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
  }).index("by_owner", ["ownerId"]),

  // An agent or extension credential. Only the SHA-256 of the token is stored.
  apiTokens: defineTable({
    name: v.string(),
    tokenHash: v.string(),
    userId: v.id("users"),
    boardId: v.id("boards"),
    createdAt: v.number(),
  }).index("by_hash", ["tokenHash"]),

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
  }).index("by_source_external", ["source", "externalId"]),

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
  })
    .index("by_board", ["boardId", "tier", "rank"])
    .index("by_board_listing", ["boardId", "listingId"]),
});
