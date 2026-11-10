// @vitest-environment happy-dom
import { beforeEach, expect, test } from "vitest";
import { extract as original } from "./extract.ts";

// Chrome runs the function from its source text in the page, so the tests do too: any
// reference to something outside the function fails here as it would there.
const extract = new Function(`return (${original.toString()})`)() as typeof original;

// Imaginary listings; the markup only mimics the shapes listing pages use.
beforeEach(() => {
  history.replaceState(null, "", "/cars/details.html?id=10000000000003");
  document.head.innerHTML = "";
});

test("reads structured data first", () => {
  document.head.innerHTML = `
    <meta property="og:image" content="https://img.example.test/og.jpg">
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "BreadcrumbList" },
        {
          "@type": ["Product", "Car"],
          name: "Porsche 911 GT3 Touring",
          brand: { "@type": "Brand", name: "Porsche" },
          model: "911",
          fuelType: "Benzin",
          vehicleTransmission: "Schaltgetriebe",
          mileageFromOdometer: { value: 21500, unitCode: "KMT" },
          dateVehicleFirstRegistered: "2019-04",
          color: "Chalk",
          image: ["https://img.example.test/1.jpg", { url: "https://img.example.test/2.jpg" }],
          offers: {
            price: 172900,
            priceCurrency: "EUR",
            seller: { "@type": "AutoDealer", name: "Sportwagen Beispiel", address: { postalCode: "70173", addressLocality: "Stuttgart" } },
          },
        },
      ],
    })}</script>`;
  document.body.innerHTML = "<h1>Ignored when structured data has a name</h1>";

  expect(extract()).toMatchObject({
    title: "Porsche 911 GT3 Touring",
    price: 172_900,
    currency: "EUR",
    make: "Porsche",
    model: "911",
    fuel: "petrol",
    gearbox: "manual",
    mileageKm: 21_500,
    firstRegistration: "2019-04",
    color: "Chalk",
    sellerType: "dealer",
    sellerName: "Sportwagen Beispiel",
    location: "70173 Stuttgart",
    photoUrls: ["https://img.example.test/1.jpg", "https://img.example.test/2.jpg", "https://img.example.test/og.jpg"],
  });
});

test("falls back to label/value pairs, in German or English", () => {
  document.body.innerHTML = `
    <h1>Porsche 718 Cayman GT4 PDK</h1>
    <dl>
      <dt>Kilometerstand</dt><dd>12.400 km</dd>
      <dt>Erstzulassung</dt><dd>03/2021</dd>
      <dt>Leistung</dt><dd>309 kW (420 PS)</dd>
      <dt>Kraftstoffart</dt><dd>Benzin</dd>
      <dt>Getriebe</dt><dd>Automatik</dd>
      <dt>Anzahl der Fahrzeughalter</dt><dd>1</dd>
    </dl>
    <table><tr><td>Price</td><td>119.950,00 €</td></tr></table>
    <p>Privatanbieter</p>
    <p>MwSt. ausweisbar</p>
    <h2>Ausstattung</h2>
    <ul><li>Sport Chrono</li><li>Clubsport package</li><li>Sport Chrono</li></ul>
    <h2>Fahrzeugbeschreibung</h2>
    <div>Garage kept.</div>`;

  expect(extract()).toMatchObject({
    title: "Porsche 718 Cayman GT4 PDK",
    mileageKm: 12_400,
    firstRegistration: "2021-03",
    powerKw: 309,
    fuel: "petrol",
    gearbox: "automatic",
    previousOwners: 1,
    price: 119_950,
    currency: "EUR",
    sellerType: "private",
    vatDeductible: true,
    options: ["Sport Chrono", "Clubsport package"],
    description: "Garage kept.",
  });
});

test("leaves out what the page does not say, and skips other cars' photos", () => {
  document.body.innerHTML = `
    <h1>Some car</h1>
    <img src="https://img.example.test/this-car.jpg">
    <a href="/cars/details.html?id=10000000000004"><img src="https://img.example.test/other-car.jpg"></a>`;

  const draft = extract();
  expect(draft.price).toBeUndefined();
  expect(draft.fuel).toBeUndefined();
  expect(draft.vatDeductible).toBeUndefined();
  expect(draft.options).toEqual([]);
  expect(draft.photoUrls).toEqual(["https://img.example.test/this-car.jpg"]);
});
