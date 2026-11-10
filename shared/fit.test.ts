import { describe, expect, test } from "vitest";
import { evaluate, preferredFor, toCheck, verdict } from "./fit.ts";

const gearbox = {
  id: "gearbox",
  name: "Gearbox",
  preferred: [
    { value: "PDK", models: ["gt4", "gt4rs"] },
    { value: "Manual", models: ["gt3"] },
    { value: "Manual", models: ["gt4rs"], avoid: true },
  ],
};
const seats = { id: "seats", name: "Seats", preferred: [{ value: "918 buckets", models: [] }] };
const colour = { id: "colour", name: "Colour" };
const car = { price: { amount: 150_000 }, firstRegistration: "2018-03", mileageKm: 40_000 };

describe("preferredFor", () => {
  test("applies model-scoped and all-model preferences, not deal-breakers", () => {
    expect(preferredFor(gearbox, "gt4")).toEqual(["PDK"]);
    expect(preferredFor(gearbox, "gt4rs")).toEqual(["PDK"]);
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

describe("evaluate", () => {
  const specs = [
    { id: "gearbox", value: "Manual", source: "you" as const },
    { id: "seats", value: "918 buckets", source: "listing" as const },
    { id: "colour", value: "Chalk", source: "you" as const },
  ];

  test("counts confirmed preference hits among specs with a preference", () => {
    const result = evaluate(car, undefined, [gearbox, seats, colour], specs, "gt3");
    expect(result).toMatchObject({ met: 1, total: 2, dealBreakers: [] });
    expect(toCheck(specs)).toBe(1);
  });

  test("adds the model's budget, years and mileage", () => {
    const criteria = { maxPrice: 140_000, minYear: 2017, maxYear: 2019, maxMileageKm: 50_000 };
    const { checks, met, total } = evaluate(car, criteria, [], [], "gt3");
    expect(checks.map((c) => [c.kind, c.status])).toEqual([
      ["price", "missed"],
      ["year", "met"],
      ["mileage", "met"],
    ]);
    expect({ met, total }).toEqual({ met: 2, total: 3 });
    expect(evaluate({ ...car, firstRegistration: undefined }, criteria, [], [], "gt3").checks[1].status).toBe("unknown");
  });

  test("a confirmed avoided value is a deal-breaker, a listing claim is not", () => {
    const rs = [{ id: "gearbox", value: "Manual", source: "you" as const }];
    expect(evaluate(car, undefined, [gearbox], rs, "gt4rs").dealBreakers).toEqual([
      { specId: "gearbox", name: "Gearbox", value: "Manual" },
    ]);
    const claimed = [{ id: "gearbox", value: "Manual", source: "listing" as const }];
    expect(evaluate(car, undefined, [gearbox], claimed, "gt4rs").dealBreakers).toEqual([]);
  });
});
