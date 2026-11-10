/// <reference types="vite/client" />
import type { TestConvex } from "convex-test";
import type schema from "./schema";

// Every Convex function module, excluding tests (files with extra dots) — passed to convexTest.
export const modules = import.meta.glob(["./**/*.*s", "!./**/*.*.*s"]);

// The owner's user and board before any account has signed in, as the design fixtures
// seed them. The first sign-in takes them over (see `users.ensureUser`).
export const seedOwner = (t: TestConvex<typeof schema>) =>
  t.run(async (ctx) => ctx.db.insert("boards", { name: "Watchlist", ownerId: await ctx.db.insert("users", { name: "Me" }) }));
