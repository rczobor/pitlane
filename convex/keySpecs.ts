import type { Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { keySpec } from "./validators";

type KeySpec = Infer<typeof keySpec>;

export type ResolvedSpec = {
  id: string;
  name: string;
  kind: KeySpec["kind"];
  value: string | null;
  // "you": set by the user. "listing": the listing text mentions it, unconfirmed.
  source: "you" | "listing" | null;
};

export function applicableSpecs(specs: KeySpec[], modelId: string | undefined) {
  return specs.filter((spec) => spec.models.length === 0 || (modelId !== undefined && spec.models.includes(modelId)));
}

// The user's value wins. Otherwise a spec counts as present when the listing names it
// (a check by its own name, a choice by the choice's name). Absence in the text is
// never read as "no": listings often leave options out.
export function resolveSpecs(board: Doc<"boards">, item: Doc<"boardItems">, listing: Doc<"listings">): ResolvedSpec[] {
  const text = listingText(listing.current);
  return applicableSpecs(board.keySpecs ?? [], item.modelId).map((spec) => {
    const base = { id: spec.id, name: spec.name, kind: spec.kind };
    const own = item.specValues?.[spec.id];
    if (own !== undefined) return { ...base, value: own, source: "you" as const };
    const found =
      spec.kind === "check" ? (mentions(text, spec.name) ? "yes" : null) : (spec.choices.find((c) => mentions(text, c)) ?? null);
    return { ...base, value: found, source: found ? ("listing" as const) : null };
  });
}

function listingText(data: Doc<"listings">["current"]) {
  const { title, description, details } = data;
  return [title, description ?? "", details.color ?? "", details.gearbox, ...details.options].join("\n").toLowerCase();
}

// Whole-term match, so "RS" does not hit "first" and "PDLS" does not hit "PDLS+".
function mentions(text: string, term: string) {
  const needle = term.trim().toLowerCase();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}+])${escaped}($|[^\\p{L}\\p{N}+])`, "u").test(text);
}
