import { describe, expect, test } from "vitest";
import { isFestiveSeason } from "./festiveSeason";

describe("isFestiveSeason", () => {
  test("runs from 25 November to 6 January", () => {
    expect(isFestiveSeason(new Date(2026, 10, 24, 23, 59))).toBe(false);
    expect(isFestiveSeason(new Date(2026, 10, 25, 0, 0))).toBe(true);
    expect(isFestiveSeason(new Date(2026, 11, 15))).toBe(true);
    expect(isFestiveSeason(new Date(2027, 0, 6, 23, 59))).toBe(true);
    expect(isFestiveSeason(new Date(2027, 0, 7, 0, 0))).toBe(false);
  });
});
