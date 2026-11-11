import { expect, test } from "vitest";
import { listingSite } from "../shared/sources";
import { findListingUrl } from "./sharedText";

test("finds the listing link in shared text", () => {
  const id = "10000000000001";
  const text = `Look at this one: https://example.com/ad and ${listingSite.canonicalUrl(id)}.`;
  expect(findListingUrl(undefined, text)?.externalId).toBe(id);
  expect(findListingUrl("Just a title", "no links here")).toBeNull();
});
