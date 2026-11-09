// The listing contract shared by every capture route (REST, MCP, the browser
// extension). The descriptions double as extraction instructions for agents.
import { z } from "zod";
import { resolveListingUrl } from "./sources.ts";

const text = (max: number) => z.string().trim().min(1).max(max);

export const fuelTypes = [
  "petrol",
  "diesel",
  "electric",
  "hybrid",
  "plugin_hybrid",
  "lpg",
  "cng",
  "hydrogen",
  "other",
] as const;

export const gearboxTypes = ["manual", "automatic", "semi_automatic"] as const;

export const carDetails = z.object({
  category: z.literal("car"),
  make: text(80).describe('Manufacturer, e.g. "BMW".'),
  model: text(120).describe('Model as listed, e.g. "320d Touring".'),
  firstRegistration: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM")
    .optional()
    .describe("First registration as YYYY-MM. Omit only for new cars."),
  mileageKm: z.number().int().min(0).max(2_000_000).describe("Odometer reading in km."),
  fuel: z.enum(fuelTypes),
  gearbox: z.enum(gearboxTypes),
  powerKw: z.number().int().positive().max(2_000).optional().describe("Engine power in kW (not hp)."),
  bodyType: text(60).optional().describe('e.g. "Estate", "Saloon", "SUV".'),
  color: text(60).optional(),
  previousOwners: z.number().int().min(0).max(50).optional(),
  options: z
    .array(text(120))
    .max(300)
    .describe("Equipment and options exactly as the listing names them."),
});

// One member today; other listing categories become further union members.
export const listingDetails = z.discriminatedUnion("category", [carDetails]);

export const listingData = z.object({
  title: text(300).describe("Listing headline as shown."),
  price: z.object({
    amount: z.number().int().positive().max(100_000_000).describe("Asking price, whole units."),
    currency: z.string().regex(/^[A-Z]{3}$/).describe('ISO 4217 code, e.g. "EUR".'),
  }),
  seller: z.object({
    type: z.enum(["dealer", "private"]),
    name: text(200).optional(),
    location: text(200).optional().describe('City or postcode and city, e.g. "10115 Berlin".'),
  }),
  details: listingDetails,
  description: z.string().max(20_000).optional().describe("Seller's free-text description."),
  photoUrls: z
    .array(z.url({ protocol: /^https$/ }).max(2_000))
    .max(60)
    .describe("Every photo in listing order, each at the largest size the page offers."),
});

export type ListingData = z.infer<typeof listingData>;

export const listingUrl = z
  .url()
  .max(2_000)
  .refine((url) => resolveListingUrl(url) !== null, "Not a supported listing URL (mobile.de vehicle listings only)")
  .describe("The listing page URL.");

export const snapshotInput = z.discriminatedUnion("status", [
  listingData.extend({ status: z.literal("available"), url: listingUrl }),
  z.object({ status: z.literal("removed"), url: listingUrl }),
]);

export type SnapshotInput = z.infer<typeof snapshotInput>;
