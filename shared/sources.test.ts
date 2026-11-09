import { describe, expect, test } from "vitest";
import { isAllowedPhotoUrl, resolveListingUrl } from "./sources.ts";

describe("resolveListingUrl", () => {
  test("reduces a share link to its listing id", () => {
    expect(
      resolveListingUrl(
        "https://listings.example/fahrzeuge/details.html?lang=en&id=10000000000001&utm_campaign=socialbuttons&utm_source=linkcopy",
      ),
    ).toEqual({
      source: "listings.example",
      externalId: "10000000000001",
      canonicalUrl: "https://listings.example/fahrzeuge/details.html?id=10000000000001",
    });
  });

  test("reads the id from slug-style links", () => {
    expect(resolveListingUrl("https://m.listings.example/auto-inserat/bmw-320d-touring/10000000000001.html")?.externalId).toBe(
      "10000000000001",
    );
  });

  test.each([
    "https://evil.example/fahrzeuge/details.html?id=10000000000001",
    "https://notlistings.example/fahrzeuge/details.html?id=10000000000001",
    "https://listings.example/fahrzeuge/search.html?ms=3500",
    "ftp://listings.example/fahrzeuge/details.html?id=10000000000001",
    "not a url",
  ])("rejects %s", (url) => {
    expect(resolveListingUrl(url)).toBeNull();
  });
});

describe("isAllowedPhotoUrl", () => {
  test("only accepts https photos from the source's image host", () => {
    expect(isAllowedPhotoUrl("listings.example", "https://img.classistatic.de/api/v1/mo-prod/images/aa/x?rule=mo-1600.jpg")).toBe(true);
    expect(isAllowedPhotoUrl("listings.example", "http://img.classistatic.de/x.jpg")).toBe(false);
    expect(isAllowedPhotoUrl("listings.example", "https://127.0.0.1:3212/x.jpg")).toBe(false);
    expect(isAllowedPhotoUrl("unknown", "https://img.classistatic.de/x.jpg")).toBe(false);
  });
});
