import { type Tier, tiers } from "./format";

// The board's order as plain data: car ids per tier, best first. Drags, the keyboard and the
// move sheet all work on this, then save one car's new tier and rank.
export type Lanes = Record<Tier, string[]>;

const tierOrder = tiers.map(({ tier }) => tier);

export function laneIds(listings: { listingId: string; tier: Tier; rank: number }[]): Lanes {
  const lanes = Object.fromEntries(tierOrder.map((tier) => [tier, [] as string[]])) as Lanes;
  for (const l of listings.toSorted((a, b) => a.rank - b.rank)) lanes[l.tier].push(l.listingId);
  return lanes;
}

export function laneOf(lanes: Lanes, id: string | undefined) {
  return tierOrder.find((tier) => id !== undefined && lanes[tier].includes(id));
}

export function isTier(id: unknown): id is Tier {
  return tierOrder.some((tier) => tier === id);
}

/** A rank that sorts between two neighbours (either may be missing). */
export function rankBetween(before: number | undefined, after: number | undefined) {
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1;
  if (after !== undefined) return after - 1;
  return Date.now();
}

/** The lanes with `id` taken out of its tier and put into `tier` at `index` (clamped). */
export function placeCar(lanes: Lanes, id: string, tier: Tier, index: number): Lanes {
  const without = Object.fromEntries(tierOrder.map((t) => [t, lanes[t].filter((other) => other !== id)])) as Lanes;
  const target = without[tier];
  return { ...without, [tier]: target.toSpliced(Math.max(0, Math.min(index, target.length)), 0, id) };
}

/**
 * One step of a keyboard or sheet move, or null when the car can go no further.
 * - `tier`: up or down one tier. Going up lands at the end of the better tier and going down
 *   at the start of the worse one, as if the car crossed the edge between them.
 * - `place`: one place earlier or later in its tier; with `cross`, a step past the tier's
 *   edge moves it into the next tier the same way.
 */
export type Step = { by: "tier" | "place"; delta: -1 | 1; cross?: boolean };

export function stepCar(lanes: Lanes, id: string, step: Step) {
  const tier = laneOf(lanes, id);
  if (!tier) return null;
  const index = lanes[tier].indexOf(id);
  const next = index + step.delta;
  if (step.by === "place" && next >= 0 && next < lanes[tier].length) return placeCar(lanes, id, tier, next);
  if (step.by === "place" && !step.cross) return null;
  const neighbour = tierOrder[tierOrder.indexOf(tier) + step.delta];
  if (!neighbour) return null;
  return placeCar(lanes, id, neighbour, step.delta < 0 ? lanes[neighbour].length : 0);
}

/** The tier and rank that put `id` where `lanes` has it, from its neighbours' ranks. */
export function rankIn(lanes: Lanes, id: string, rankOf: (id: string) => number | undefined) {
  const tier = laneOf(lanes, id);
  if (!tier) return null;
  const ids = lanes[tier];
  const index = ids.indexOf(id);
  return { tier, index, rank: rankBetween(rankOf(ids[index - 1]), rankOf(ids[index + 1])) };
}

/**
 * Lot numbers: each car's place in the order it reached the board, from 1. Derived, so they
 * need no stored counter; they stay put while cars move between tiers or come and go from
 * view, and only a deleted car's later lots move up by one.
 */
export function lotNumbers(listings: { listingId: string; firstSeenAt: number }[]) {
  const order = listings.toSorted((a, b) => a.firstSeenAt - b.firstSeenAt || a.listingId.localeCompare(b.listingId));
  return new Map(order.map((l, index) => [l.listingId, index + 1]));
}

export function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}
