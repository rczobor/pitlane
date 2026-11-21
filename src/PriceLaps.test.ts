import { describe, expect, test } from "vitest";
import { priceLaps } from "./PriceLaps";

const eur = (amount: number) => ({ amount, currency: "EUR" });

describe("priceLaps", () => {
  test("numbers captures oldest first, lists them newest first, with each one's gap and a bar scaled from zero", () => {
    const laps = priceLaps([
      { capturedAt: 1, price: eur(170_000) },
      { capturedAt: 2, price: eur(165_000) },
      { capturedAt: 3, price: eur(160_000) },
    ]);
    expect(laps.map((l) => l.number)).toEqual([3, 2, 1]);
    expect(laps.map((l) => l.bar)).toEqual([(160_000 / 170_000) * 100, (165_000 / 170_000) * 100, 100]);
    expect(laps[0].gap).toEqual({ amount: -5_000, percent: (-5_000 / 165_000) * 100 });
    expect(laps[2].gap).toBeUndefined();
  });

  test("a capture without a price (the ad went) has no bar, and the next price gaps from the last one seen", () => {
    const laps = priceLaps([
      { capturedAt: 1, price: eur(100_000) },
      { capturedAt: 2 },
      { capturedAt: 3, price: eur(90_000) },
    ]);
    expect(laps[1]).toMatchObject({ number: 2, bar: undefined, gap: undefined });
    expect(laps[0].gap?.amount).toBe(-10_000);
  });

  test("a single capture fills its bar", () => {
    expect(priceLaps([{ capturedAt: 1, price: eur(50_000) }])[0].bar).toBe(100);
  });
});
