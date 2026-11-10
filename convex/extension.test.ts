import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedOwner } from "./test.setup";
import { listingSite } from "../shared/sources";

const url = listingSite.canonicalUrl("10000000000001");
const snapshot = {
  status: "available",
  url,
  title: "Skoda Octavia Combi 2.0 TDI",
  price: { amount: 18_900, currency: "EUR" },
  seller: { type: "private" },
  details: {
    category: "car",
    make: "Skoda",
    model: "Octavia Combi",
    firstRegistration: "2019-06",
    mileageKm: 112_000,
    fuel: "diesel",
    gearbox: "manual",
    options: [],
  },
  photoUrls: [],
};

test("the extension saves with the owner's web session, and nobody else's", async () => {
  const t = convexTest(schema, modules);
  await seedOwner(t);
  const owner = t.withIdentity({ subject: "owner" });
  await owner.mutation(api.users.ensureUser, {});

  // Claude's OAuth token is for the MCP server only, even for the same account.
  const claude = t.withIdentity({ subject: "owner", client_id: "https://claude.ai/oauth/claude-code-client-metadata" });
  expect(await claude.action(api.extension.save, { snapshot })).toMatchObject({ status: 401 });

  expect(await owner.action(api.extension.save, { snapshot })).toMatchObject({ status: 200, body: { created: true } });
  expect(await owner.query(api.extension.saved, { url })).toMatchObject({ title: snapshot.title, price: snapshot.price });
  const nextDay = Date.now() + 25 * 60 * 60 * 1000;
  expect(await owner.query(api.extension.due, { now: nextDay })).toEqual([expect.objectContaining({ url })]);

  // Listing facts are shared across boards, so another account may not rewrite them.
  const other = t.withIdentity({ subject: "other" });
  await other.mutation(api.users.ensureUser, {});
  expect(await other.action(api.extension.save, { snapshot })).toMatchObject({ status: 403 });
  expect(await other.query(api.extension.saved, { url })).toBeNull();
});
