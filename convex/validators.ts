import { v } from "convex/values";
import { zodToConvex } from "convex-helpers/server/zod4";
import { listingData } from "../shared/listing";

export const listingDataValidator = zodToConvex(listingData);

export const listingStatus = v.union(v.literal("available"), v.literal("removed"));

export const tiers = v.union(
  v.literal("S"),
  v.literal("A"),
  v.literal("B"),
  v.literal("watching"),
  v.literal("rejected"),
);
