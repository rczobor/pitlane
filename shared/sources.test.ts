import { describe, expect, test } from "vitest";
import { findListingUrl, fullSizePhotoUrl, isAllowedPhotoUrl, listingSite, resolveListingUrl } from "./sources.ts";

const id = "10000000000001";
const canonicalUrl = listingSite.canonicalUrl(id);
const { hostname } = new URL(canonicalUrl);
const siteDomain = hostname.slice(hostname.indexOf(".") + 1);

// Saved listings are looked up by this id, so renaming it would duplicate them on re-check.
test("keeps the stored source id", () => {
  expect(listingSite.id).toBe(siteDomain);
});

describe("resolveListingUrl", () => {
  test("reduces a share link to its listing id", () => {
    const shareLink = canonicalUrl.replace(`?id=${id}`, `?lang=en&id=${id}&utm_campaign=socialbuttons&utm_source=linkcopy`);
    expect(resolveListingUrl(shareLink)).toEqual({ source: listingSite.id, externalId: id, canonicalUrl });
  });

  test("reads the id from slug-style links", () => {
    expect(resolveListingUrl(`https://m.${siteDomain}/auto-inserat/bmw-320d-touring/${id}.html`)?.externalId).toBe(id);
  });

  test.each([
    `https://evil.example/fahrzeuge/details.html?id=${id}`,
    `https://not${siteDomain}/fahrzeuge/details.html?id=${id}`,
    new URL("/fahrzeuge/search.html?ms=3500", canonicalUrl).href,
    canonicalUrl.replace("https:", "ftp:"),
    "not a url",
  ])("rejects %s", (url) => {
    expect(resolveListingUrl(url)).toBeNull();
  });
});

test("finds the listing link in shared text", () => {
  const text = `Look at this one: https://example.com/ad and ${canonicalUrl}.`;
  expect(findListingUrl(undefined, text)?.externalId).toBe(id);
  expect(findListingUrl("Just a title", "no links here")).toBeNull();
});

describe("isAllowedPhotoUrl", () => {
  test("only accepts https photos from the source's image host", () => {
    expect(isAllowedPhotoUrl(listingSite.id, "https://img.classistatic.de/x.jpg")).toBe(true);
    expect(isAllowedPhotoUrl(listingSite.id, "http://img.classistatic.de/x.jpg")).toBe(false);
    expect(isAllowedPhotoUrl(listingSite.id, "https://127.0.0.1:3212/x.jpg")).toBe(false);
    expect(isAllowedPhotoUrl("unknown", "https://img.classistatic.de/x.jpg")).toBe(false);
  });
});

test("upgrades photos to full size and drops other hosts", () => {
  expect(fullSizePhotoUrl(listingSite.id, "https://img.classistatic.de/api/v1/mo-prod/images/aa/x?rule=mo-240.jpg")).toBe(
    "https://img.classistatic.de/api/v1/mo-prod/images/aa/x?rule=mo-1600.jpg",
  );
  expect(fullSizePhotoUrl(listingSite.id, "https://example.com/x.jpg")).toBeNull();
});
