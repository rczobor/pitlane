import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

test("a fresh preview gets the fixture board, and fixtures refuse a deployment someone signed in to", async () => {
  const t = convexTest(schema, modules);
  await t.action(internal.fixtures.seed, {});

  const reviewer = t.withIdentity({ subject: "reviewer" });
  await reviewer.mutation(api.users.ensureUser, {});
  expect((await reviewer.query(api.board.get, {}))!.listings.length).toBeGreaterThan(1);

  await expect(t.action(internal.fixtures.seed, {})).rejects.toThrow(/fresh preview/);
});
