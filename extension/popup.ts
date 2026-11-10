import "./jitless.ts";
import { type SnapshotInput, fuelTypes, gearboxTypes, listingData } from "../shared/listing.ts";
import { fullSizePhotoUrl, resolveListingUrl } from "../shared/sources.ts";
import { api, convex, errorText, signIn } from "./api.ts";
import { type PageDraft, extract } from "./extract.ts";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const form = $<HTMLFormElement>("#listing");
const status = $("#status");
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const fuelLabels: Record<(typeof fuelTypes)[number], string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  electric: "Electric",
  hybrid: "Hybrid",
  plugin_hybrid: "Plug-in hybrid",
  lpg: "LPG",
  cng: "CNG",
  hydrogen: "Hydrogen",
  other: "Other",
};
const gearboxLabels: Record<(typeof gearboxTypes)[number], string> = {
  manual: "Manual",
  automatic: "Automatic",
  semi_automatic: "Semi-automatic",
};

function show(id: "connect" | "idle" | "listing") {
  $("#loading").hidden = true;
  for (const section of ["connect", "idle", "listing"]) $(`#${section}`).hidden = section !== id;
}

const say = (text: string, error = false) => {
  status.textContent = text;
  status.className = error ? "error" : "";
};

async function start() {
  let signedIn: boolean;
  try {
    signedIn = await signIn();
  } catch (error) {
    signedIn = false;
    $("#connect-status").textContent = error instanceof Error ? error.message : String(error);
  }
  if (!signedIn) {
    $("#open-app").addEventListener("click", () => void chrome.tabs.create({ url: PITLANE.appUrl }));
    return show("connect");
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const listing = tab?.url ? resolveListingUrl(tab.url) : null;
  if (!tab?.id || !tab.url || !listing) return showIdle();

  let draft: PageDraft = { options: [], photoUrls: [] };
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extract });
    draft = injection.result as PageDraft;
  } catch (error) {
    say(`Could not read the page (${error instanceof Error ? error.message : error}). Fill in the details by hand.`, true);
  }
  // A re-check starts from the saved listing, so values typed in by hand on an earlier
  // save survive when the page does not show them. What the page shows wins.
  setUpSelects();
  const saved = await savedListing(listing.canonicalUrl);
  if (saved) fill(saved);
  fill(draft);
  if (!field("currency").value) field("currency").value = "EUR";
  showPhotos(draft.photoUrls, listing.source);
  show("listing");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void save(tab.url!);
  });
  setUpRemoved(tab.url);
}

async function showIdle() {
  show("idle");
  let due;
  try {
    due = await convex.query(api.extension.due, { now: Date.now() });
  } catch (error) {
    $("#idle-status").textContent = errorText(error);
    return;
  }
  if (!due) {
    $("#idle-status").textContent = "Open Pitlane once in this browser to set up your board.";
    return;
  }
  if (due.length === 0) return;
  $("#due-box").hidden = false;
  $("#due").replaceChildren(
    ...due.map((item) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.title;
      button.addEventListener("click", () => void chrome.tabs.create({ url: item.url }));
      li.append(button);
      return li;
    }),
  );
}

// The listing as saved on the board, or null when it is new (or cannot be read).
async function savedListing(canonicalUrl: string): Promise<Partial<PageDraft> | null> {
  const saved = await convex.query(api.extension.saved, { url: canonicalUrl }).catch(() => null);
  if (!saved) return null;
  const { title, price, seller, details, description } = saved;
  return {
    title,
    price: price.amount,
    currency: price.currency,
    vatDeductible: price.vatDeductible,
    netPrice: price.netAmount,
    sellerType: seller.type,
    sellerName: seller.name,
    location: seller.location,
    ...details,
    description,
  };
}

function setUpSelects() {
  const options = (select: string, labels: Record<string, string>) =>
    (field(select) as HTMLSelectElement).replaceChildren(
      new Option("Choose…", ""),
      ...Object.entries(labels).map(([value, label]) => new Option(label, value)),
    );
  options("fuel", fuelLabels);
  options("gearbox", gearboxLabels);
}

// Writes the values it has and leaves the other fields as they are, so a later call
// only overrides what it knows.
function fill(draft: Partial<PageDraft>) {
  const set = (name: string, value: string | number | undefined) => {
    if (value !== undefined) field(name).value = String(value);
  };
  set("title", draft.title);
  set("price", draft.price);
  set("currency", draft.currency);
  set("vatDeductible", draft.vatDeductible === undefined ? undefined : draft.vatDeductible ? "yes" : "no");
  set("netPrice", draft.netPrice);
  set("make", draft.make);
  set("model", draft.model);
  set("firstRegistration", draft.firstRegistration);
  set("mileageKm", draft.mileageKm);
  set("fuel", draft.fuel);
  set("gearbox", draft.gearbox);
  set("powerKw", draft.powerKw);
  set("previousOwners", draft.previousOwners);
  set("bodyType", draft.bodyType);
  set("color", draft.color);
  if (draft.options?.length) set("options", draft.options.join("\n"));
  set("sellerType", draft.sellerType);
  set("sellerName", draft.sellerName);
  set("location", draft.location);
  set("description", draft.description);
}

function showPhotos(photoUrls: string[], source: string) {
  // Only the listing site's own photo host is accepted by Pitlane; same photo, largest size.
  const photos = [...new Set(photoUrls.flatMap((url) => fullSizePhotoUrl(source, url) ?? []))].slice(0, 60);
  $("#no-photos").hidden = photos.length > 0;
  $("#photos").replaceChildren(
    ...photos.map((url, index) => {
      const label = document.createElement("label");
      const box = Object.assign(document.createElement("input"), { type: "checkbox", name: "photo", value: url, checked: true });
      box.setAttribute("aria-label", `Photo ${index + 1}`);
      const img = Object.assign(document.createElement("img"), { src: url, alt: "", loading: "lazy" });
      label.append(box, img);
      return label;
    }),
  );
}

// Form values as the API's listing shape. Empty optional fields are left out.
function readForm() {
  const text = (name: string) => field(name).value.trim() || undefined;
  // The first number, cents dropped: a pasted "119.950,00 €" is 119950, not 11995000.
  const number = (name: string) => {
    const digits = text(name)
      ?.match(/\d[\d.,\s]*/)?.[0]
      .trim()
      .replace(/[.,]\d{1,2}$/, "")
      .replace(/\D/g, "");
    return digits ? Number(digits) : undefined;
  };
  const vat = text("vatDeductible");
  return {
    title: text("title") ?? "",
    price: {
      amount: number("price") ?? 0,
      currency: (text("currency") ?? "").toUpperCase(),
      ...(vat && { vatDeductible: vat === "yes" }),
      ...(number("netPrice") !== undefined && { netAmount: number("netPrice") }),
    },
    seller: { type: text("sellerType") ?? "dealer", name: text("sellerName"), location: text("location") },
    details: {
      category: "car",
      make: text("make") ?? "",
      model: text("model") ?? "",
      firstRegistration: text("firstRegistration"),
      mileageKm: number("mileageKm") ?? -1,
      fuel: text("fuel") ?? "",
      gearbox: text("gearbox") ?? "",
      powerKw: number("powerKw"),
      bodyType: text("bodyType"),
      color: text("color"),
      previousOwners: number("previousOwners"),
      options: (text("options") ?? "").split("\n").flatMap((line) => line.trim() || []),
    },
    description: text("description"),
    photoUrls: [...form.querySelectorAll<HTMLInputElement>('input[name="photo"]:checked')].map((box) => box.value),
  };
}

// Where each contract path is edited in the form.
const fieldFor: Record<string, string> = {
  "price.amount": "price",
  "price.currency": "currency",
  "price.netAmount": "netPrice",
  "seller.type": "sellerType",
  "seller.name": "sellerName",
  "seller.location": "location",
};

function markInvalid(issues: { path: PropertyKey[]; message: string }[]) {
  for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
  for (const el of form.querySelectorAll(".field-error")) el.remove();
  let first: HTMLElement | null = null;
  for (const issue of issues) {
    const path = issue.path.join(".");
    const name = fieldFor[path] ?? (path.startsWith("details.") ? path.split(".")[1] : path.split(".")[0]);
    const el = form.elements.namedItem(name);
    if (!(el instanceof HTMLElement) || el.hasAttribute("aria-invalid")) continue;
    el.setAttribute("aria-invalid", "true");
    const message = Object.assign(document.createElement("span"), { className: "field-error", textContent: issue.message });
    message.id = `${name}-error`;
    el.setAttribute("aria-describedby", message.id);
    el.after(message);
    first ??= el;
  }
  first?.focus();
}

async function save(url: string) {
  const parsed = listingData.safeParse(readForm());
  if (!parsed.success) {
    markInvalid(parsed.error.issues);
    return say("Some fields need a look before saving.", true);
  }
  markInvalid([]);
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  say("Saving…");
  const result = await send({ status: "available", url, ...parsed.data });
  button.disabled = false;
  if (!result.ok) {
    const issues = (result.body as { issues?: { path: string; message: string }[] } | undefined)?.issues;
    if (issues) markInvalid(issues.map((i) => ({ path: i.path.split("."), message: i.message })));
    return say(result.message, true);
  }
  const body = result.body as {
    created: boolean;
    changed: boolean;
    priceChange?: { from: { amount: number; currency: string }; to: { amount: number; currency: string } };
  };
  const money = (p: { amount: number; currency: string }) =>
    new Intl.NumberFormat("en-IE", { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(p.amount);
  say(
    body.created
      ? "Saved to Watching."
      : body.priceChange
        ? `Re-checked: the price changed from ${money(body.priceChange.from)} to ${money(body.priceChange.to)}.`
        : body.changed
          ? "Re-checked: the details changed and are updated."
          : "Re-checked: nothing changed.",
  );
}

// Two clicks, since a removed ad drops out of re-checks.
function setUpRemoved(url: string) {
  const button = $<HTMLButtonElement>("#removed");
  let armed = false;
  button.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      button.textContent = "Confirm: ad is gone";
      return;
    }
    button.disabled = true;
    const result = await send({ status: "removed", url });
    button.disabled = false;
    armed = false;
    button.textContent = "Ad is gone";
    say(
      result.ok ? "Marked as removed." : result.status === 404 ? "This listing is not on your board." : result.message,
      !result.ok,
    );
  });
}

type SendResult = { ok: true; body: unknown } | { ok: false; status: number; message: string; body?: unknown };

// Saves through the same intake as the MCP tools, so the result is HTTP-style.
async function send(snapshot: SnapshotInput): Promise<SendResult> {
  try {
    if (!(await signIn())) return { ok: false, status: 401, message: "Sign in to Pitlane in this browser, then try again." };
    const { status, body } = await convex.action(api.extension.save, { snapshot });
    if (status < 400) return { ok: true, body };
    const message =
      typeof body === "object" && body !== null && "error" in body ? String(body.error) : `Pitlane answered ${status}.`;
    return { ok: false, status, message, body };
  } catch (error) {
    return { ok: false, status: 0, message: errorText(error) };
  }
}

void start();
