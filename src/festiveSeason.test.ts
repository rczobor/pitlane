import { describe, expect, test } from "vitest";
import { isFestiveSeason } from "./festiveSeason";

describe("isFestiveSeason", () => {
  test("runs from 1 December to 6 January", () => {
    expect(isFestiveSeason(new Date(2026, 10, 30, 23, 59))).toBe(false);
    expect(isFestiveSeason(new Date(2026, 11, 1, 0, 0))).toBe(true);
    expect(isFestiveSeason(new Date(2027, 0, 6, 23, 59))).toBe(true);
    expect(isFestiveSeason(new Date(2027, 0, 7, 0, 0))).toBe(false);
  });
});
