import type { AuthConfig } from "convex/server";

// Clerk signs both kinds of token. Each deployment names its own Clerk instance:
// development for dev and previews, production for prod.
const clerk = process.env.CLERK_FRONTEND_API_URL!;

export default {
  providers: [
    // The web app's session tokens.
    { domain: clerk, applicationID: "convex" },
    // OAuth access tokens Clerk issues to MCP clients such as Claude. The audience is
    // this deployment's /mcp URL, so another server's token is refused. Same issuer and
    // subject as the session, so both map to the same Pitlane user. Convex would accept
    // either kind anywhere; `viewerAccess` keeps each to its own side.
    {
      type: "customJwt",
      issuer: clerk,
      jwks: `${clerk}/.well-known/jwks.json`,
      algorithm: "RS256",
      applicationID: `${process.env.CONVEX_SITE_URL}/mcp`,
    },
  ],
} satisfies AuthConfig;
