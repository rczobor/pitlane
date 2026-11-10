import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { appError } from "./errors";
import { boardItem, boardListings, listingDetail } from "./listings";
import { viewerAccess } from "./users";
import { boardModel, keySpec, tiers } from "./validators";

// Functions for the web app, for the signed-in user's board. Signed out, or before
// `users:ensureUser` has set the user up, the board reads as null.

export const get = query({
  args: {},
  handler: async (ctx) => {
    const access = await viewerAccess(ctx);
    if (!access) return null;
    const board = (await ctx.db.get(access.boardId))!;
    return {
      name: board.name,
      models: board.models ?? [],
      keySpecs: board.keySpecs ?? [],
      listings: await boardListings(ctx, access.boardId),
    };
  },
});

export const listing = query({
  args: { listingId: v.string() },
  handler: async (ctx, { listingId }) => {
    const access = await viewerAccess(ctx);
    return access && listingDetail(ctx, access.boardId, listingId);
  },
});

export const move = mutation({
  args: { listingId: v.id("listings"), tier: tiers, rank: v.number() },
  handler: async (ctx, { listingId, tier, rank }) => {
    const { item } = await ownItem(ctx, listingId);
    await ctx.db.patch(item._id, { tier, rank });
  },
});

export const setModel = mutation({
  args: { listingId: v.id("listings"), modelId: v.union(v.string(), v.null()) },
  handler: async (ctx, { listingId, modelId }) => {
    const { board, item } = await ownItem(ctx, listingId);
    if (modelId !== null && !(board.models ?? []).some((m) => m.id === modelId)) {
      throw appError("invalid", "Unknown model");
    }
    await ctx.db.patch(item._id, { modelId: modelId ?? undefined });
  },
});

// null clears the user's value (back to unknown, or to what the listing says).
// A choice value that is not yet on the list is added to it.
export const setSpecValue = mutation({
  args: {
    listingId: v.id("listings"),
    specId: v.string(),
    value: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { listingId, specId, value }) => {
    const { board, item } = await ownItem(ctx, listingId);
    const specs = board.keySpecs ?? [];
    const spec = specs.find((s) => s.id === specId);
    if (!spec) throw appError("invalid", "Unknown key spec");

    const { [specId]: _, ...rest } = item.specValues ?? {};
    if (value === null) {
      await ctx.db.patch(item._id, { specValues: rest });
      return;
    }
    const trimmed = value.trim();
    // "manual" when "Manual" exists reuses it: a case-only twin would make the choice
    // ambiguous for listing suggestions (they match case-insensitively).
    const clean = spec.choices.find((c) => c.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
    if (spec.kind === "check" && clean !== "yes" && clean !== "no") throw appError("invalid", "Use yes or no");
    if (spec.kind === "choice") {
      if (!clean || clean.length > 60) throw appError("invalid", "Choices are 1–60 characters");
      if (!spec.choices.includes(clean)) {
        await ctx.db.patch(board._id, {
          keySpecs: specs.map((s) => (s.id === specId ? { ...s, choices: [...s.choices, clean] } : s)),
        });
      }
    }
    await ctx.db.patch(item._id, { specValues: { ...rest, [specId]: clean } });
  },
});

export const saveSettings = mutation({
  args: { models: v.array(boardModel), keySpecs: v.array(keySpec) },
  handler: async (ctx, { models, keySpecs }) => {
    const access = await viewerAccess(ctx);
    if (!access) throw appError("not_found", "Board not found");
    const clean = cleanSettings(models, keySpecs);
    await ctx.db.patch(access.boardId, clean);
    // What was stored, so the editor can adopt it (dropped preferences, trimmed names).
    return clean;
  },
});

type Model = Infer<typeof boardModel>;
type KeySpec = Infer<typeof keySpec>;

function cleanSettings(models: Model[], keySpecs: KeySpec[]) {
  const name = (raw: string, what: string) => {
    const clean = raw.trim();
    if (!clean || clean.length > 60) throw appError("invalid", `${what} names are 1–60 characters`);
    return clean;
  };
  const uniqueIds = (ids: string[], what: string) => {
    if (new Set(ids).size !== ids.length || ids.some((id) => !/^[\w-]{1,40}$/.test(id))) {
      throw appError("invalid", `${what} ids must be unique`);
    }
  };
  if (models.length > 30 || keySpecs.length > 40) throw appError("invalid", "Too many models or key specs");
  uniqueIds(models.map((m) => m.id), "Model");
  uniqueIds(keySpecs.map((s) => s.id), "Key spec");
  const modelIds = new Set(models.map((m) => m.id));
  return {
    models: models.map((m) => ({ id: m.id, name: name(m.name, "Model"), ...criteria(m) })),
    keySpecs: keySpecs.map((s) => {
      const choices = s.kind === "choice" ? [...new Set(s.choices.map((c) => name(c, "Choice")))] : [];
      const valid = s.kind === "check" ? ["yes", "no"] : choices;
      return {
        id: s.id,
        name: name(s.name, "Key spec"),
        kind: s.kind,
        choices,
        // Drops references to models that no longer exist.
        models: s.models.filter((id) => modelIds.has(id)),
        // Keeps preferences for values and models that still exist. A preference whose
        // models were all deleted goes away; emptied, it would widen to every model.
        preferred: (s.preferred ?? [])
          .filter((p) => valid.includes(p.value))
          .filter((p) => p.models.length === 0 || p.models.some((id) => modelIds.has(id)))
          .map((p) => ({
            value: p.value,
            models: p.models.filter((id) => modelIds.has(id)),
            ...(p.avoid && { avoid: true }),
          })),
      };
    }),
  };
}

// A model's limits: whole positive numbers in a sane range, and a year range that is not
// inverted. Unset limits are left out.
function criteria(m: Model) {
  const name = m.name.trim();
  const limit = (value: number | undefined, what: string, min: number, max: number) => {
    if (value === undefined) return undefined;
    if (!Number.isInteger(value) || value < min || value > max) {
      // Years stay unformatted; large numbers get separators.
      const show = (n: number) => (n >= 10_000 ? n.toLocaleString("en-IE") : String(n));
      throw appError("invalid", `${what} for ${name} must be ${show(min)}–${show(max)}`);
    }
    return value;
  };
  const maxPrice = limit(m.maxPrice, "Budget", 1, 100_000_000);
  const minYear = limit(m.minYear, "Year", 1950, 2100);
  const maxYear = limit(m.maxYear, "Year", 1950, 2100);
  const maxMileageKm = limit(m.maxMileageKm, "Mileage", 1, 2_000_000);
  if (minYear !== undefined && maxYear !== undefined && minYear > maxYear) {
    throw appError("invalid", `The first year for ${name} is after the last`);
  }
  return {
    ...(maxPrice !== undefined && { maxPrice }),
    ...(minYear !== undefined && { minYear }),
    ...(maxYear !== undefined && { maxYear }),
    ...(maxMileageKm !== undefined && { maxMileageKm }),
  };
}

const takeItems = (items: string[]) => {
  const clean = items.map((i) => i.trim()).filter(Boolean);
  if (clean.length > 30 || clean.some((i) => i.length > 200)) throw appError("invalid", "Up to 30 items of 200 characters");
  return clean;
};

// Notes, pros and cons: the user's own take on a car. Each field is replaced when given.
export const setNotes = mutation({
  args: {
    listingId: v.id("listings"),
    notes: v.optional(v.string()),
    pros: v.optional(v.array(v.string())),
    cons: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { listingId, notes, pros, cons }) => {
    const { item } = await ownItem(ctx, listingId);
    if (notes !== undefined && notes.length > 5_000) throw appError("invalid", "Notes are up to 5,000 characters");
    await ctx.db.patch(item._id, {
      ...(notes !== undefined && { notes }),
      ...(pros !== undefined && { pros: takeItems(pros) }),
      ...(cons !== undefined && { cons: takeItems(cons) }),
    });
  },
});

async function ownItem(ctx: MutationCtx, listingId: Id<"listings">) {
  const access = await viewerAccess(ctx);
  const item = access && (await boardItem(ctx, access.boardId, listingId));
  if (!access || !item) throw appError("not_found", "This listing is not on your board");
  return { board: (await ctx.db.get(access.boardId))!, item };
}
