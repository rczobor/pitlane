import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";

const maxPhotoBytes = 20 * 1024 * 1024;

// Copies listing photos into Convex storage so they outlive the ad.
export const archive = internalAction({
  args: { photoIds: v.array(v.id("photos")) },
  handler: async (ctx, { photoIds }) => {
    for (const photoId of photoIds) {
      const photo = await ctx.runQuery(internal.photos.get, { photoId });
      if (photo?.status !== "pending") continue;
      try {
        const storageId = await ctx.storage.store(await download(photo.sourceUrl));
        await ctx.runMutation(internal.photos.settle, { photoId, status: "stored", storageId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await ctx.runMutation(internal.photos.settle, { photoId, status: "failed", error: message });
      }
    }
  },
});

async function download(url: string) {
  // Redirects are refused: the host allowlist was checked for this URL only.
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`Not an image (${type || "no content type"})`);
  if (Number(response.headers.get("content-length")) > maxPhotoBytes) throw new Error("Photo too large");
  const blob = await response.blob();
  if (blob.size > maxPhotoBytes) throw new Error("Photo too large");
  return blob;
}

export const get = internalQuery({
  args: { photoId: v.id("photos") },
  handler: (ctx, { photoId }) => ctx.db.get(photoId),
});

export const settle = internalMutation({
  args: {
    photoId: v.id("photos"),
    status: v.union(v.literal("stored"), v.literal("failed")),
    storageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { photoId, ...result }) => {
    await ctx.db.patch(photoId, result);
  },
});
