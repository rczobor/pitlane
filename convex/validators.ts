import { v } from "convex/values";
import { zodToConvex } from "convex-helpers/server/zod4";
import { listingData } from "../shared/listing";

export const listingDataValidator = zodToConvex(listingData);

export const listingStatus = v.union(v.literal("available"), v.literal("removed"));

// What the user tracks: car models, and the key specs that decide a car's tier.
// Both are defined per board; ids are stable, array order is display priority.
export const boardModel = v.object({ id: v.string(), name: v.string() });

export const keySpec = v.object({
  id: v.string(),
  name: v.string(),
  // "check" is yes/no; "choice" picks one of `choices`.
  kind: v.union(v.literal("check"), v.literal("choice")),
  choices: v.array(v.string()),
  // Model ids it applies to; empty means every model.
  models: v.array(v.string()),
  // The values the user wants, each for some models (empty: every model). A car's fit
  // counts its confirmed values that match.
  preferred: v.optional(v.array(v.object({ value: v.string(), models: v.array(v.string()) }))),
});

export const tiers = v.union(
  v.literal("S"),
  v.literal("A"),
  v.literal("B"),
  v.literal("watching"),
  v.literal("rejected"),
);
