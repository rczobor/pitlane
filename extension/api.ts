// The panel's one way to Pitlane: Convex over HTTP, with the web app's Clerk session.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

export { api };
export const convex = new ConvexHttpClient(PITLANE.convexUrl);

type TokenReply = { token: string | null; error?: string };

// Run before each call: session tokens last a minute, and the form can stay open longer.
// False when this browser is not signed in to Pitlane.
export async function signIn(): Promise<boolean> {
  const reply: TokenReply | undefined = await chrome.runtime.sendMessage("token");
  if (reply?.error) throw new Error(`Could not check the sign-in (${reply.error}).`);
  if (!reply?.token) {
    convex.clearAuth();
    return false;
  }
  convex.setAuth(reply.token);
  return true;
}

export const errorText = (error: unknown) =>
  `Could not reach Pitlane (${error instanceof Error ? error.message : String(error)}).`;
