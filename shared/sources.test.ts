import { describe, expect, test } from "vitest";
import { isAllowedPhotoUrl, resolveListingUrl } from "./sources.ts";

describe("resolveListingUrl", () => {
  test("reduces a mobile.de share link to its listing id", () => {
    expect(
      resolveListingUrl(
        "https://suchen.mobile.de/fahrzeuge/details.html?lang=en&id=10000000000001&utm_campaign=socialbuttons&utm_source=linkcopy",
      ),
    ).toEqual({
      source: "mobile.de",
      externalId: "10000000000001",
      canonicalUrl: "https://suchen.mobile.de/fahrzeuge/details.html?id=10000000000001",
    });
  });

  test("reads the id from slug-style links", () => {
    expect(resolveListingUrl("https://m.mobile.de/auto-inserat/bmw-320d-touring/10000000000001.html")?.externalId).toBe(
      "10000000000001",
    );
  });

  test.each([
    "https://evil.example/fahrzeuge/details.html?id=10000000000001",
    "https://notmobile.de/fahrzeuge/details.html?id=10000000000001",
    "https://suchen.mobile.de/fahrzeuge/search.html?ms=3500",
    "ftp://suchen.mobile.de/fahrzeuge/details.html?id=10000000000001",
    "not a url",
  ])("rejects %s", (url) => {
    expect(resolveListingUrl(url)).toBeNull();
  });
});

describe("isAllowedPhotoUrl", () => {
  test("only accepts https photos from the source's image host", () => {
    expect(isAllowedPhotoUrl("mobile.de", "https://img.classistatic.de/api/v1/mo-prod/images/aa/x?rule=mo-1600.jpg")).toBe(true);
    expect(isAllowedPhotoUrl("mobile.de", "http://img.classistatic.de/x.jpg")).toBe(false);
    expect(isAllowedPhotoUrl("mobile.de", "https://127.0.0.1:3212/x.jpg")).toBe(false);
    expect(isAllowedPhotoUrl("unknown", "https://img.classistatic.de/x.jpg")).toBe(false);
  });
});
