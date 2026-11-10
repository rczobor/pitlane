import type { FunctionReturnType } from "convex/server";
import type { api } from "../convex/_generated/api";
import type { Check } from "../shared/fit";

export type BoardData = NonNullable<FunctionReturnType<typeof api.board.get>>;
export type BoardListing = BoardData["listings"][number];
export type BoardModel = BoardData["models"][number];
export type KeySpecDef = BoardData["keySpecs"][number];
export type ResolvedSpec = BoardListing["keySpecs"][number];
export type Tier = BoardListing["tier"];
export type Specs = BoardListing["specs"];

export const tiers: { tier: Tier; label: string }[] = [
  { tier: "S", label: "S" },
  { tier: "A", label: "A" },
  { tier: "B", label: "B" },
  { tier: "watching", label: "Watching" },
  { tier: "rejected", label: "Rejected" },
];

export function formatPrice({ amount, currency }: { amount: number; currency: string }) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

// One line per fit check, e.g. "Budget up to €180,000" or "Seats: 918 buckets".
export function checkLabel(check: Check, currency = "EUR") {
  switch (check.kind) {
    case "price":
      return `Budget up to ${formatPrice({ amount: check.limit, currency })}`;
    case "year":
      if (check.min !== undefined && check.max !== undefined) return `Registered ${check.min}–${check.max}`;
      return check.min !== undefined ? `Registered ${check.min} or later` : `Registered ${check.max} or earlier`;
    case "mileage":
      return `Up to ${formatKm(check.limit)}`;
    case "spec":
      return `${check.name}: ${check.wanted.map((v) => (v === "yes" ? "Yes" : v === "no" ? "No" : v)).join(" or ")}`;
  }
}

// "No PDLS+" for a yes/no spec, "Manual (Gearbox)" for a choice.
export function dealBreakerLabel(
  breaker: { specId: string; name: string; value: string },
  specs: { id: string; kind: "check" | "choice" }[],
) {
  const kind = specs.find((s) => s.id === breaker.specId)?.kind;
  if (kind === "check") return breaker.value === "yes" ? breaker.name : `No ${breaker.name}`;
  return `${breaker.value} (${breaker.name})`;
}

export const formatKm = (km: number) => `${km.toLocaleString("en-IE")} km`;

// Listings give power in kW and hp; hp is what people compare by.
export const formatPower = (kw: number) => `${Math.round(kw * 1.35962)} hp`;

export function formatRegistration(yyyyMm: string | undefined) {
  if (!yyyyMm) return "New";
  const [year, month] = yyyyMm.split("-");
  return `${month}/${year}`;
}

const fuelLabels: Record<Specs["fuel"], string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  electric: "Electric",
  hybrid: "Hybrid",
  plugin_hybrid: "Plug-in hybrid",
  lpg: "LPG",
  cng: "CNG",
  hydrogen: "Hydrogen",
  other: "Other fuel",
};

const gearboxLabels: Record<Specs["gearbox"], string> = {
  manual: "manual",
  automatic: "automatic",
  semi_automatic: "semi-automatic",
};

export const formatDrivetrain = (specs: Pick<Specs, "fuel" | "gearbox">) =>
  `${fuelLabels[specs.fuel]}, ${gearboxLabels[specs.gearbox]}`;

export function formatAge(timestamp: number) {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Re-checks can land on the same day, so history rows carry the time as well.
export const formatDateTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
