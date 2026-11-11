import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

// The service worker serves the app from its cache, so a deploy reaches an open app only
// when it reloads. Reloading on its own could drop a note mid-edit, so the user picks the
// moment. Other open tabs of the app reload with it, since they all switch to the new worker.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
  } = useRegisterSW({
    // An installed app can stay open for days; look for a new version every hour.
    onRegisteredSW: (_url, registration) => {
      if (registration) setInterval(() => void registration.update().catch(() => {}), 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
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
      // Reloading before activation loads the old version again, but a dead button is
      // worse: give up after a few seconds, and the prompt returns if it is still waiting.
      setTimeout(resolve, 3000);
      waiting.postMessage({ type: "SKIP_WAITING" });
    });
  }
  location.reload();
}
