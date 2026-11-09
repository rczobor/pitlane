import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { appError } from "./errors";
import { boardItem, boardListings, listingDetail } from "./listings";
import { tokenAccess } from "./tokens";
import { boardModel, keySpec, tiers } from "./validators";

// Functions for the web app. Until there are user accounts, the browser holds an
// API token and passes it to every call; a bad token reads as signed out (null).

export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const access = await tokenAccess(ctx, token);
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
  args: { token: v.string(), listingId: v.string() },
  handler: async (ctx, { token, listingId }) => {
    const access = await tokenAccess(ctx, token);
    return access && listingDetail(ctx, access.boardId, listingId);
  },
});

export const move = mutation({
  args: { token: v.string(), listingId: v.id("listings"), tier: tiers, rank: v.number() },
  handler: async (ctx, { token, listingId, tier, rank }) => {
    const { item } = await ownItem(ctx, token, listingId);
    await ctx.db.patch(item._id, { tier, rank });
  },
});

export const setModel = mutation({
  args: { token: v.string(), listingId: v.id("listings"), modelId: v.union(v.string(), v.null()) },
  handler: async (ctx, { token, listingId, modelId }) => {
    const { board, item } = await ownItem(ctx, token, listingId);
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
    token: v.string(),
    listingId: v.id("listings"),
    specId: v.string(),
    value: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { token, listingId, specId, value }) => {
    const { board, item } = await ownItem(ctx, token, listingId);
    const specs = board.keySpecs ?? [];
    const spec = specs.find((s) => s.id === specId);
    if (!spec) throw appError("invalid", "Unknown key spec");

    const { [specId]: _, ...rest } = item.specValues ?? {};
    if (value === null) {
      await ctx.db.patch(item._id, { specValues: rest });
      return;
    }
    const clean = value.trim();
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
  args: { token: v.string(), models: v.array(boardModel), keySpecs: v.array(keySpec) },
  handler: async (ctx, { token, models, keySpecs }) => {
    const access = await tokenAccess(ctx, token);
    if (!access) throw appError("not_found", "Board not found");
    await ctx.db.patch(access.boardId, cleanSettings(models, keySpecs));
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
    models: models.map((m) => ({ id: m.id, name: name(m.name, "Model") })),
    keySpecs: keySpecs.map((s) => ({
      id: s.id,
      name: name(s.name, "Key spec"),
      kind: s.kind,
      choices: s.kind === "choice" ? [...new Set(s.choices.map((c) => name(c, "Choice")))] : [],
      // Drops references to models that no longer exist.
      models: s.models.filter((id) => modelIds.has(id)),
    })),
  };
}

async function ownItem(ctx: MutationCtx, token: string, listingId: Id<"listings">) {
  const access = await tokenAccess(ctx, token);
  const item = access && (await boardItem(ctx, access.boardId, listingId));
  if (!access || !item) throw appError("not_found", "This listing is not on your board");
  return { board: (await ctx.db.get(access.boardId))!, item };
}
