// The listing contract shared by every capture route (Claude and the browser
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
  price: z
    .object({
      amount: z.number().int().positive().max(100_000_000).describe("Asking price incl. VAT, whole units."),
      currency: z.string().regex(/^[A-Z]{3}$/).describe('ISO 4217 code, e.g. "EUR".'),
      vatDeductible: z
        .boolean()
        .optional()
        .describe('true when the listing shows VAT as reclaimable (a net price, "19% VAT"); false when it says it is not.'),
      netAmount: z
        .number()
        .int()
        .positive()
        .max(100_000_000)
        .optional()
        .describe("Net price excl. VAT, only when the listing shows one."),
    })
    .refine((price) => price.netAmount === undefined || price.netAmount <= price.amount, {
      message: "netAmount cannot exceed the gross amount",
      path: ["netAmount"],
    }),
  seller: z.object({
    type: z.enum(["dealer", "private"]),
    name: text(200).optional(),
    location: text(200).optional().describe('City or postcode and city, e.g. "10115 Berlin".'),
    // Agents may send "de"; one optional field should not reject the whole capture.
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use a two-letter country code")
      .optional()
      .describe('The seller\'s country as an ISO 3166-1 alpha-2 code, e.g. "DE", when the page shows it.'),
  }),
  details: listingDetails,
  description: z.string().max(20_000).optional().describe("Seller's free-text description."),
  descriptionTranslation: z
    .object({
      from: z
        .string()
        .regex(/^[a-z]{2}$/)
        .describe('ISO 639-1 code of the language the description is written in, e.g. "de".'),
      text: text(30_000).describe(
        "The whole description in English, keeping its paragraphs. Translate meaning, not word for word, and spell out local terms and abbreviations a buyer from abroad would not know.",
      ),
    })
    .optional()
    .describe("English translation of the description. Omit when the description is already in English."),
  photoUrls: z
    .array(z.url({ protocol: /^https$/ }).max(2_000))
    .max(60)
    .describe("Every photo in listing order, each at the largest size the page offers."),
});

export type ListingData = z.infer<typeof listingData>;

export const listingUrl = z
  .url()
  .max(2_000)
  .refine((url) => resolveListingUrl(url) !== null, "Not a supported car listing URL")
  .describe("The listing page URL.");

export const snapshotInput = z.discriminatedUnion("status", [
  listingData.extend({ status: z.literal("available"), url: listingUrl }),
  z.object({ status: z.literal("removed"), url: listingUrl }),
  // A re-check that could not read the page: recorded and retried later, never "removed".
  z.object({
    status: z.literal("failed"),
    url: listingUrl,
    reason: z.string().max(200).optional().describe('What went wrong, e.g. "blocked", "timed out".'),
  }),
]);

export type SnapshotInput = z.infer<typeof snapshotInput>;
