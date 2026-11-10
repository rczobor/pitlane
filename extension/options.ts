import { callApi, loadSettings } from "./api.ts";

const form = document.querySelector<HTMLFormElement>("#settings")!;
const status = document.querySelector<HTMLElement>("#status")!;
const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;

const saved = await loadSettings();
if (saved) {
  input("apiUrl").value = saved.apiUrl;
  input("token").value = saved.token;
}

const say = (text: string, error = false) => {
  status.textContent = text;
  status.className = error ? "wide error" : "wide";
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  let url: URL;
  try {
    url = new URL(input("apiUrl").value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    return say("Enter the API URL, e.g. https://your-deployment.convex.site", true);
  }
  const token = input("token").value.trim();
  if (!/^pit_[0-9a-f]{64}$/.test(token)) return say("The token starts with pit_ followed by 64 characters.", true);

  // Only the API's own origin, asked for while the click still counts as a user gesture.
  const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
  if (!granted) return say("Chrome did not allow the extension to reach that URL.", true);

  const settings = { apiUrl: url.origin, token };
  await chrome.storage.local.set(settings);
  say("Saved. Testing…");
  const result = await callApi(settings, "/api/rechecks");
  if (!result.ok) return say(`Saved, but the test failed: ${result.message}`, true);
  const due = (result.body as { due?: unknown[] }).due?.length ?? 0;
  say(`Connected. ${due === 1 ? "1 listing is" : `${due} listings are`} due for a re-check.`);
});
