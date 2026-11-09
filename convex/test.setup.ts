/// <reference types="vite/client" />
// Every Convex function module, excluding tests (files with extra dots) — passed to convexTest.
export const modules = import.meta.glob(["./**/*.*s", "!./**/*.*.*s"]);
