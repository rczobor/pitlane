import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

test("a fresh preview gets the fixture board once, and fixtures refuse a board someone signed in to", async () => {
  const t = convexTest(schema, modules);
  await t.action(internal.fixtures.seedPreview, {});

  const reviewer = t.withIdentity({ subject: "reviewer" });
  await reviewer.mutation(api.users.ensureUser, {});
  const seeded = (await reviewer.query(api.board.get, {}))!.listings.map((l) => l.listingId);
  expect(seeded.length).toBeGreaterThan(1);

  // A later push to the same preview keeps the reviewer's board.
  await t.action(internal.fixtures.seedPreview, {});
  expect((await reviewer.query(api.board.get, {}))!.listings.map((l) => l.listingId)).toEqual(seeded);
  await expect(t.mutation(internal.fixtures.reset, {})).rejects.toThrow(/fresh preview/);
});
