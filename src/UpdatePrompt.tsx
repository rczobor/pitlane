import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

// A deploy reaches an open app only when it reloads. Reloading on its own could drop a note
// mid-edit, so the user picks the moment. Other open tabs of the app reload with it, since
// they all switch to the new worker.
export function UpdatePrompt() {
  const [outdated, setOutdated] = useState(false);
  useRegisterSW({
    // An installed app can stay open for days; look for a new version every hour.
    onRegisteredSW: (_url, registration) => {
      if (registration) setInterval(() => void registration.update().catch(() => {}), 60 * 60 * 1000);
    },
    // The browser looks for a new worker on every page load, so the one it finds is often
    // the version this page already is: a reload fetches the page from the network.
    onNeedRefresh: () => void isOutdated().then(setOutdated),
  });
  if (!outdated) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-lg bg-slab py-2 pr-2 pl-4 text-sm text-slab-foreground shadow-lg"
    >
      A new version of Pitlane is ready.
      <Button size="sm" variant="secondary" onClick={() => void activateUpdateAndReload()}>
        Reload
      </Button>
    </div>
  );
}

// Not the plugin's updateServiceWorker(): it reloads only on a controller change seen by a
// page that a worker already controlled when it loaded (vite-plugin-pwa #789, fix pending in
// #931). An installed app's first launch has no controller, so the button did nothing, and
// WebKit can skip the controller change entirely (#937). Waiting on the new worker itself
// covers both; with no worker waiting (it already took over), a plain reload is the update.
async function activateUpdateAndReload() {
  const waiting = (await navigator.serviceWorker.getRegistration())?.waiting;
  if (waiting) {
    await new Promise<void>((resolve) => {
      waiting.addEventListener("statechange", () => {
        if (waiting.state === "activated" || waiting.state === "redundant") resolve();
      });
      // The reload loads the new page either way, but the worker should come along: give
      // it a few seconds, since a dead button is worse.
      setTimeout(resolve, 3000);
      waiting.postMessage({ type: "SKIP_WAITING" });
    });
  }
  location.reload();
}

// The worker script lists every file its version precaches, and hashed names change with
// their contents, so this page is older when a script or stylesheet it loaded is not
// listed. If the script cannot be read, show the prompt: a needless one beats a missed one.
async function isOutdated() {
  const files = [...document.querySelectorAll("script[src], link[rel=stylesheet], link[rel=modulepreload]")]
    .map((element) => new URL(element.getAttribute("src") ?? element.getAttribute("href") ?? "", location.href))
    .filter((url) => url.origin === location.origin && url.pathname.startsWith("/assets/"))
    .map((url) => url.pathname.slice(1));
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = registration?.waiting ?? registration?.active;
    if (!worker) return true;
    const script = await fetch(worker.scriptURL, { cache: "no-store" }).then((response) => response.text());
    return files.some((file) => !script.includes(file));
  } catch {
    return true;
  }
}
