// How well a car matches the user's preferred key-spec values. Shared by the board, the
// car page and the settings preview, which evaluates unsaved settings.

export type Preference = { value: string; models: string[] };
type SpecDef = { id: string; preferred?: Preference[] };
type SpecValue = { id: string; value: string | null; source: "you" | "listing" | null };

/** The values the user wants for a spec on this model; empty when there is no preference. */
export function preferredFor(def: SpecDef | undefined, modelId: string | null) {
  return (def?.preferred ?? [])
    .filter((p) => p.models.length === 0 || (modelId !== null && p.models.includes(modelId)))
    .map((p) => p.value);
}

/**
 * "hit" or "miss" against the preference, or null when there is no preference or the
 * value is not the user's own yet: a listing claim does not count until confirmed.
 */
export function verdict(preferred: string[], spec: SpecValue) {
  if (preferred.length === 0 || spec.value === null || spec.source !== "you") return null;
  return preferred.includes(spec.value) ? ("hit" as const) : ("miss" as const);
}

/** Confirmed hits out of the car's specs that have a preference. */
export function fit(defs: SpecDef[], specs: SpecValue[], modelId: string | null) {
  let hits = 0;
  let total = 0;
  for (const spec of specs) {
    const preferred = preferredFor(
      defs.find((d) => d.id === spec.id),
      modelId,
    );
    if (preferred.length === 0) continue;
    total++;
    if (verdict(preferred, spec) === "hit") hits++;
  }
  return { hits, total };
}

/** Specs the user still has to check: from the listing, or unknown. */
export const toCheck = (specs: SpecValue[]) => specs.filter((s) => s.source !== "you").length;
