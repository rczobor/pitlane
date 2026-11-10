import { createClerkClient } from "@clerk/chrome-extension/client";

// The popup asks here for a Clerk session token. Only Clerk's background client shares
// the sign-in from the web app (its sync host), so the extension never signs in itself.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message !== "token") return false;
  createClerkClient({ publishableKey: PITLANE.publishableKey, syncHost: PITLANE.syncHost, background: true })
    .then((clerk) => clerk.session?.getToken())
    .then(
      (token) => sendResponse({ token: token ?? null }),
      (error: unknown) => sendResponse({ token: null, error: error instanceof Error ? error.message : String(error) }),
    );
  return true; // Answers asynchronously.
});
