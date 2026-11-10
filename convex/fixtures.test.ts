import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules, seedOwner } from "./test.setup";

test("a fresh preview gets the fixture board", async () => {
  const t = convexTest(schema, modules);
  await t.action(internal.fixtures.seed, {});

  const reviewer = t.withIdentity({ subject: "reviewer" });
  await reviewer.mutation(api.users.ensureUser, {});
  expect((await reviewer.query(api.board.get, {}))!.listings.length).toBeGreaterThan(1);
});

test("fixtures never wipe a cloud deployment with data, even one nobody has signed in to", async () => {
  const t = convexTest(schema, modules);
  await seedOwner(t);
  await expect(t.action(internal.fixtures.seed, {})).rejects.toThrow(/fresh preview/);
  expect(await t.run((ctx) => ctx.db.query("boards").collect())).toHaveLength(1);
});
