import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

// The service worker serves the app from its cache, so a deploy reaches an open app only
// when it reloads. Reloading on its own could drop a note mid-edit, so the user picks the moment.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // An installed app can stay open for days; look for a new version every hour.
    onRegisteredSW: (_url, registration) => {
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-lg bg-slab py-2 pr-2 pl-4 text-sm text-slab-foreground shadow-lg"
    >
      A new version of Pitlane is ready.
      <Button size="sm" variant="secondary" onClick={() => void updateServiceWorker()}>
        Reload
      </Button>
    </div>
  );
}
