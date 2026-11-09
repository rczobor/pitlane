import { describe, expect, test } from "vitest";
import { fit, preferredFor, toCheck, verdict } from "./fit.ts";

const gearbox = {
  id: "gearbox",
  preferred: [
    { value: "PDK", models: ["gt4", "gt4rs"] },
    { value: "Manual", models: ["gt3"] },
  ],
};
const seats = { id: "seats", preferred: [{ value: "918 buckets", models: [] }] };
const colour = { id: "colour" };

describe("preferredFor", () => {
  test("applies model-scoped and all-model preferences", () => {
    expect(preferredFor(gearbox, "gt4")).toEqual(["PDK"]);
    expect(preferredFor(gearbox, "gt3")).toEqual(["Manual"]);
    expect(preferredFor(gearbox, null)).toEqual([]);
    expect(preferredFor(seats, null)).toEqual(["918 buckets"]);
    expect(preferredFor(colour, "gt3")).toEqual([]);
  });
});

describe("verdict", () => {
  test("only the user's own values count", () => {
    expect(verdict(["PDK"], { id: "gearbox", value: "PDK", source: "you" })).toBe("hit");
    expect(verdict(["PDK"], { id: "gearbox", value: "Manual", source: "you" })).toBe("miss");
    expect(verdict(["PDK"], { id: "gearbox", value: "PDK", source: "listing" })).toBeNull();
    expect(verdict(["PDK"], { id: "gearbox", value: null, source: null })).toBeNull();
    expect(verdict([], { id: "colour", value: "Chalk", source: "you" })).toBeNull();
  });
});

test("fit counts confirmed hits among specs with a preference", () => {
  const specs = [
    { id: "gearbox", value: "Manual", source: "you" as const },
    { id: "seats", value: "918 buckets", source: "listing" as const },
    { id: "colour", value: "Chalk", source: "you" as const },
  ];
  expect(fit([gearbox, seats, colour], specs, "gt3")).toEqual({ hits: 1, total: 2 });
  expect(fit([gearbox, seats, colour], specs, "gt4")).toEqual({ hits: 0, total: 2 });
  expect(toCheck(specs)).toBe(1);
});
