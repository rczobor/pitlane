import { afterEach, expect, test, vi } from "vitest";
import { isNewer, latestVersion } from "./update.ts";

afterEach(() => vi.unstubAllGlobals());

test("compares versions part by part, as numbers", () => {
  expect(isNewer("0.10.0", "0.9.3")).toBe(true);
  expect(isNewer("0.4.1", "0.4")).toBe(true);
  expect(isNewer("0.4.0", "0.4")).toBe(false);
  expect(isNewer("0.3.9", "0.4.0")).toBe(false);
});

test("reads the version from the latest release's tag, and gives up quietly", async () => {
  const reply = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status }));
  reply(200, { tag_name: "extension-v0.5.1" });
  expect(await latestVersion()).toBe("0.5.1");
  reply(200, { tag_name: "v2" });
  expect(await latestVersion()).toBeNull();
  reply(403, { message: "API rate limit exceeded" });
  expect(await latestVersion()).toBeNull();
});
