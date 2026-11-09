import type { FunctionReturnType } from "convex/server";
import type { api } from "../convex/_generated/api";

export type BoardListing = NonNullable<FunctionReturnType<typeof api.board.get>>["listings"][number];
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

export const formatKm = (km: number) => `${km.toLocaleString("en-IE")} km`;

// mobile.de shows power in kW and hp; hp is what people compare by.
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
