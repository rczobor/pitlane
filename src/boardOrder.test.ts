import { expect, test } from "vitest";
import { type Lanes, lotNumbers, ordinal, rankIn, stepCar } from "./boardOrder";

const lanes: Lanes = { S: ["s1"], A: ["a1", "a2"], B: [], watching: ["w1"], rejected: [] };

test("moving a car up a tier lands it at the end of the better tier, down at the start of the worse one", () => {
  expect(stepCar(lanes, "a1", { by: "tier", delta: -1 })).toMatchObject({ S: ["s1", "a1"], A: ["a2"] });
  expect(stepCar(lanes, "a2", { by: "tier", delta: 1 })).toMatchObject({ A: ["a1"], B: ["a2"] });
  expect(stepCar(lanes, "s1", { by: "tier", delta: -1 })).toBeNull();
});

test("reordering stays in the tier unless it may cross the edge", () => {
  expect(stepCar(lanes, "a2", { by: "place", delta: -1 })).toMatchObject({ A: ["a2", "a1"] });
  expect(stepCar(lanes, "a1", { by: "place", delta: -1 })).toBeNull();
  expect(stepCar(lanes, "a1", { by: "place", delta: -1, cross: true })).toMatchObject({ S: ["s1", "a1"], A: ["a2"] });
});

test("a moved car is ranked between its new neighbours", () => {
  const ranks: Record<string, number> = { s1: 1, a1: 10, a2: 20, w1: 30 };
  const moved = stepCar(lanes, "w1", { by: "tier", delta: -1 })!;
  expect(moved.B).toEqual(["w1"]);
  const placed = stepCar(lanes, "a2", { by: "place", delta: -1 })!;
  expect(rankIn(placed, "a2", (id) => ranks[id])).toEqual({ tier: "A", index: 0, rank: 9 });
  expect(rankIn(stepCar(lanes, "w1", { by: "place", delta: -1, cross: true })!, "w1", (id) => ranks[id])).toMatchObject({
    tier: "B",
    rank: expect.any(Number),
  });
});

test("lot numbers follow the order cars reached the board, whatever their tier", () => {
  const lots = lotNumbers([
    { listingId: "b", firstSeenAt: 200 },
    { listingId: "a", firstSeenAt: 100 },
    { listingId: "c", firstSeenAt: 200 },
  ]);
  expect([...lots]).toEqual([
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ]);
});

test("ordinals", () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual([
    "1st",
    "2nd",
    "3rd",
    "4th",
    "11th",
    "12th",
    "13th",
    "21st",
    "22nd",
    "103rd",
  ]);
});
