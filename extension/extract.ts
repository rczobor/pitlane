// Reads a listing from the open page. Chrome serialises this function into the tab
// (chrome.scripting.executeScript), so it must stay self-contained: no imports or
// module-level helpers at runtime, only what is defined inside it.
//
// Sources, most trusted first: structured data (JSON-LD), then label/value pairs as the
// page shows them (German and English labels), then the page title and OpenGraph tags.
// The price notes (net price, VAT) and the private-seller hint come from the page text.
// Whatever it cannot find stays empty for the user to fill in; it never guesses values.

export type PageDraft = {
  title?: string;
  price?: number;
  currency?: string;
  vatDeductible?: boolean;
  netPrice?: number;
  sellerType?: "dealer" | "private";
  sellerName?: string;
  location?: string;
  make?: string;
  model?: string;
  firstRegistration?: string;
  mileageKm?: number;
  fuel?: string;
  gearbox?: string;
  powerKw?: number;
  bodyType?: string;
  color?: string;
  previousOwners?: number;
  options: string[];
  description?: string;
  /** Every candidate photo URL, unfiltered; the panel keeps the image host's. */
  photoUrls: string[];
};

export function extract(): PageDraft {
  type Json = Record<string, unknown>;
  const clean = (value: unknown) =>
    typeof value === "string" || typeof value === "number" ? String(value).replace(/\s+/g, " ").trim() || undefined : undefined;
  // Whole numbers only: "39.500 km", "159,999 €" and "39 500" all read as one number,
  // and cents ("119.950,00 €") are dropped.
  const whole = (value: unknown) => {
    const digits = clean(value)
      ?.match(/\d[\d.,\s]*/)?.[0]
      .trim()
      .replace(/[.,]\d{1,2}$/, "")
      .replace(/\D/g, "");
    return digits ? Number(digits) : undefined;
  };
  const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null;
  const types = (node: Json) => [node["@type"]].flat().map(String);

  // --- Structured data
  const nodes: Json[] = [];
  const collect = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (isObject(value)) {
      nodes.push(value);
      if (value["@graph"]) collect(value["@graph"]);
    }
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      collect(JSON.parse(script.textContent ?? ""));
    } catch {
      // A malformed block is skipped; the rest of the page still counts.
    }
  }
  const vehicle = nodes.find((n) => types(n).some((t) => ["Car", "Vehicle", "MotorVehicle"].includes(t)));
  const product = vehicle ?? nodes.find((n) => types(n).includes("Product"));
  const offer = [product?.offers].flat().find(isObject);
  const name = (value: unknown) => (isObject(value) ? clean(value.name) : clean(value));

  // --- Label/value pairs: <dt>/<dd>, table rows, and a label element followed by its value.
  const pairs = new Map<string, string>();
  const add = (label: Element | null | undefined, value: Element | null | undefined) => {
    const key = clean(label?.textContent)?.replace(/:$/, "").toLowerCase();
    const text = clean(value?.textContent);
    if (key && text && key.length < 60 && !pairs.has(key)) pairs.set(key, text);
  };
  for (const dt of document.querySelectorAll("dt")) add(dt, dt.nextElementSibling);
  for (const row of document.querySelectorAll("tr")) add(row.children[0], row.children[1]);
  for (const el of document.querySelectorAll("[class*='label'], [class*='Label'], [data-testid*='label']")) add(el, el.nextElementSibling);
  const field = (...labels: string[]) => {
    for (const label of labels) {
      const value = pairs.get(label);
      if (value) return value;
    }
  };

  const fuelText = clean(vehicle?.fuelType) ?? field("kraftstoffart", "kraftstoff", "fuel", "fuel type");
  const fuels: [RegExp, string][] = [
    [/plug-?in/i, "plugin_hybrid"],
    [/hybrid/i, "hybrid"],
    [/elektr|electric/i, "electric"],
    [/diesel/i, "diesel"],
    [/benzin|petrol|gasoline|super/i, "petrol"],
    [/autogas|lpg/i, "lpg"],
    [/erdgas|cng/i, "cng"],
    [/wasserstoff|hydrogen/i, "hydrogen"],
  ];
  const gearboxText = clean(vehicle?.vehicleTransmission) ?? field("getriebe", "getriebeart", "transmission", "gearbox");
  const gearboxes: [RegExp, string][] = [
    [/halbautomat|semi-?auto/i, "semi_automatic"],
    [/automat|pdk|dsg|tiptronic/i, "automatic"],
    [/schalt|manu/i, "manual"],
  ];
  const pick = (text: string | undefined, table: [RegExp, string][]) => text && table.find(([re]) => re.test(text))?.[1];

  // "03/2018" or "2018-03" as YYYY-MM.
  const registration = (text: string | undefined) => {
    const slash = text?.match(/(\d{1,2})\s*\/\s*(\d{4})/);
    if (slash) return `${slash[2]}-${slash[1].padStart(2, "0")}`;
    const iso = text?.match(/(\d{4})-(\d{2})/);
    return iso ? `${iso[1]}-${iso[2]}` : undefined;
  };
  const powerText = field("leistung", "power");
  const kw = powerText?.match(/(\d+)\s*kw/i)?.[1];
  const engine = [vehicle?.vehicleEngine].flat().find(isObject);
  const enginePower = isObject(engine?.enginePower) ? engine.enginePower : undefined;
  // Structured power counts only when its unit says kW; a bare number may be hp.
  const engineKw = enginePower?.unitCode === "KWT" ? whole(enginePower.value) : undefined;

  const mileage = isObject(vehicle?.mileageFromOdometer) ? vehicle.mileageFromOdometer.value : undefined;

  // --- Price: structured first, then the price label.
  const priceText = field("preis", "price", "brutto", "gross");
  // Visible text only: the JSON-LD scripts would otherwise match the text patterns below.
  const visible = document.body.cloneNode(true) as HTMLElement;
  for (const script of visible.querySelectorAll("script, style")) script.remove();
  const bodyText = clean(visible.textContent) ?? "";
  const net = bodyText.match(/([\d.,]+)\s*€\s*\(?\s*(netto|net)\b/i)?.[1] ?? bodyText.match(/€\s*([\d.,]+)\s*\(?\s*(netto|net)\b/i)?.[1];
  // Listing pages show a net price ("€176,378 Net, 19% VAT") only when the VAT is shown
  // separately, i.e. reclaimable, so a net price counts unless the page says otherwise.
  const vatDeductible = /mwst\.?\s*ausweisbar|vat\s*(deductible|reclaimable)/i.test(bodyText)
    ? true
    : /mwst\.?\s*nicht\s*ausweisbar|vat\s*(is\s*)?not\s*(deductible|reclaimable)/i.test(bodyText)
      ? false
      : net
        ? true
        : undefined;

  // --- Options: the list under an equipment heading.
  const headings = [...document.querySelectorAll("h1, h2, h3, h4")];
  const section = (pattern: RegExp) => {
    const heading = headings.find((h) => pattern.test(clean(h.textContent) ?? ""));
    if (!heading) return undefined;
    // The content is in the siblings after the heading, up to the next heading.
    let next = heading.nextElementSibling;
    while (next && !/^H[1-4]$/.test(next.tagName)) {
      if (next.matches("ul, ol, p, div")) return next;
      next = next.nextElementSibling;
    }
    return undefined;
  };
  const optionsBox = section(/^(ausstattung|features|equipment)$/i);
  const options = [...new Set([...(optionsBox?.querySelectorAll("li") ?? [])].flatMap((li) => clean(li.textContent) ?? []))];
  const descriptionBox = section(/^(fahrzeugbeschreibung|vehicle description|beschreibung|description)$/i);
  // The description keeps its line breaks; innerText renders <br> as one.
  const paragraphs = (el: Element | undefined) => {
    const text = el instanceof HTMLElement ? (el.innerText ?? el.textContent) : el?.textContent;
    return text?.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*/g, "\n\n").trim() || undefined;
  };

  // --- Photos: structured data and OpenGraph, then the listing's own gallery. Without a
  // gallery, every image on the page except those inside links to other pages, which are
  // usually other cars' thumbnails. The gallery keeps out ads and badges on the same host.
  const here = location.href.split("#")[0];
  const gallery = document.querySelector('[data-testid="gallery-main-focus-container"], [data-testid="image-gallery"]') ?? document;
  const photoUrls = [
    ...[product?.image].flat().flatMap((image) => (isObject(image) ? clean(image.url ?? image.contentUrl) : clean(image)) ?? []),
    ...[...document.querySelectorAll('meta[property="og:image"]')].flatMap((m) => m.getAttribute("content") ?? []),
    ...[...gallery.querySelectorAll("img")].flatMap((img) => {
      const link = img.closest("a[href]") as HTMLAnchorElement | null;
      if (link && link.href.split("#")[0] !== here) return [];
      const srcset = img.getAttribute("srcset")?.split(",").at(-1)?.trim().split(/\s+/)[0];
      return [srcset, img.getAttribute("data-src"), img.getAttribute("src")].flatMap((u) => {
        // One malformed address must not cost the rest of the page.
        try {
          return u ? [new URL(u, here).href] : [];
        } catch {
          return [];
        }
      });
    }),
  ];

  const seller = isObject(offer?.seller) ? offer.seller : undefined;
  const address = isObject(seller?.address) ? seller.address : undefined;
  const privateSeller = /privatanbieter|private seller|privatverkäufer/i.test(bodyText);
  const title =
    clean(product?.name) ??
    clean(document.querySelector("h1")?.textContent) ??
    clean(document.querySelector('meta[property="og:title"]')?.getAttribute("content"));
  const make = name(vehicle?.brand ?? product?.brand) ?? name(vehicle?.manufacturer);

  return {
    title,
    price: whole(offer?.price) ?? whole(priceText),
    currency: clean(offer?.priceCurrency) ?? (priceText?.includes("€") || bodyText.includes("€") ? "EUR" : undefined),
    vatDeductible,
    netPrice: whole(net),
    sellerType:
      seller && types(seller).includes("Person")
        ? "private"
        : seller && types(seller).some((t) => /dealer|organization/i.test(t))
          ? "dealer"
          : privateSeller
            ? "private"
            : undefined,
    sellerName: name(seller),
    location:
      [clean(address?.postalCode), clean(address?.addressLocality)].filter(Boolean).join(" ") ||
      field("standort", "location", "adresse", "address"),
    make,
    model: clean(vehicle?.model),
    firstRegistration: registration(clean(vehicle?.dateVehicleFirstRegistered) ?? field("erstzulassung", "first registration")),
    mileageKm: whole(mileage) ?? whole(field("kilometerstand", "mileage", "kilometres", "odometer")),
    fuel: pick(fuelText, fuels) || undefined,
    gearbox: pick(gearboxText, gearboxes) || undefined,
    powerKw: engineKw ?? (kw ? Number(kw) : undefined),
    bodyType: clean(vehicle?.bodyType) ?? field("kategorie", "category", "body type", "karosserieform"),
    color: clean(vehicle?.color) ?? field("farbe", "außenfarbe", "farbe (hersteller)", "colour", "color", "exterior colour"),
    previousOwners: whole(field("anzahl der fahrzeughalter", "fahrzeughalter", "number of vehicle owners", "previous owners")),
    options,
    description: paragraphs(descriptionBox) ?? clean(product?.description),
    photoUrls: [...new Set(photoUrls)],
  };
}
