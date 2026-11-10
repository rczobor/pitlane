// How well a car matches what the user wants: the model's limits (budget, years,
// mileage) and the preferred key-spec values, plus any deal-breakers. Shared by the
// board, the car page, the comparison and the settings preview (which evaluates unsaved
// settings).

/** A wanted value for some models (empty: every model); `avoid` makes it a deal-breaker. */
export type Preference = { value: string; models: string[]; avoid?: boolean };
type SpecDef = { id: string; name: string; preferred?: Preference[] };
type SpecValue = { id: string; value: string | null; source: "you" | "listing" | null };
export type Criteria = { maxPrice?: number; minYear?: number; maxYear?: number; maxMileageKm?: number };
type Car = { price: { amount: number }; firstRegistration?: string; mileageKm: number };

export type Status = "met" | "missed" | "unknown";
export type Check =
  | { kind: "price"; limit: number; status: Status }
  | { kind: "year"; min?: number; max?: number; status: Status }
  | { kind: "mileage"; limit: number; status: Status }
  | { kind: "spec"; specId: string; name: string; wanted: string[]; status: Status };

const applies = (p: Preference, modelId: string | null) =>
  p.models.length === 0 || (modelId !== null && p.models.includes(modelId));

/** The values the user wants for a spec on this model; empty when there is no preference. */
export function preferredFor(def: SpecDef | undefined, modelId: string | null) {
  return (def?.preferred ?? []).filter((p) => !p.avoid && applies(p, modelId)).map((p) => p.value);
}

/** The values that rule a car out for this model. */
export function avoidedFor(def: SpecDef | undefined, modelId: string | null) {
  return (def?.preferred ?? []).filter((p) => p.avoid && applies(p, modelId)).map((p) => p.value);
}

/**
 * "hit" or "miss" against the preference, or null when there is no preference or the
 * value is not the user's own yet: a listing claim does not count until confirmed.
 */
export function verdict(preferred: string[], spec: SpecValue) {
  if (preferred.length === 0 || spec.value === null || spec.source !== "you") return null;
  return preferred.includes(spec.value) ? ("hit" as const) : ("miss" as const);
}

/** Every check that applies to this car, how many are met, and its deal-breakers. */
export function evaluate(
  car: Car,
  criteria: Criteria | undefined,
  defs: SpecDef[],
  specs: SpecValue[],
  modelId: string | null,
) {
  const checks: Check[] = [];
  const within = (ok: boolean): Status => (ok ? "met" : "missed");
  if (criteria?.maxPrice !== undefined) {
    checks.push({ kind: "price", limit: criteria.maxPrice, status: within(car.price.amount <= criteria.maxPrice) });
  }
  if (criteria?.minYear !== undefined || criteria?.maxYear !== undefined) {
    // An unregistered (new) car has no year to compare.
    const year = car.firstRegistration ? Number(car.firstRegistration.slice(0, 4)) : null;
    const ok = year !== null && year >= (criteria.minYear ?? -Infinity) && year <= (criteria.maxYear ?? Infinity);
    checks.push({ kind: "year", min: criteria.minYear, max: criteria.maxYear, status: year === null ? "unknown" : within(ok) });
  }
  if (criteria?.maxMileageKm !== undefined) {
    checks.push({ kind: "mileage", limit: criteria.maxMileageKm, status: within(car.mileageKm <= criteria.maxMileageKm) });
  }

  const dealBreakers: { specId: string; name: string; value: string }[] = [];
  for (const spec of specs) {
    const def = defs.find((d) => d.id === spec.id);
    const wanted = preferredFor(def, modelId);
    if (wanted.length > 0) {
      const v = verdict(wanted, spec);
      checks.push({
        kind: "spec",
        specId: spec.id,
        name: def?.name ?? spec.id,
        wanted,
        status: v === "hit" ? "met" : v === "miss" ? "missed" : "unknown",
      });
    }
    if (spec.source === "you" && spec.value !== null && avoidedFor(def, modelId).includes(spec.value)) {
      dealBreakers.push({ specId: spec.id, name: def?.name ?? spec.id, value: spec.value });
    }
  }
  return { checks, met: checks.filter((c) => c.status === "met").length, total: checks.length, dealBreakers };
}

/** Specs the user still has to check: from the listing, or unknown. */
export const toCheck = (specs: SpecValue[]) => specs.filter((s) => s.source !== "you").length;
