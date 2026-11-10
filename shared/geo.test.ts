import { expect, test } from "vitest";
import { distanceKm } from "./geo.ts";

test("measures the straight line between two places", () => {
  const munich = { lat: 48.137, lng: 11.575 };
  const vienna = { lat: 48.208, lng: 16.373 };
  expect(distanceKm(munich, vienna)).toBeCloseTo(355, -1);
  expect(distanceKm(munich, munich)).toBe(0);
});
