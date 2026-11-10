import type { AuthConfig } from "convex/server";

// Clerk signs the web app's session tokens. Each deployment names its own Clerk
// instance: development for dev and previews, production for prod.
export default {
  providers: [{ domain: process.env.CLERK_FRONTEND_API_URL!, applicationID: "convex" }],
} satisfies AuthConfig;
