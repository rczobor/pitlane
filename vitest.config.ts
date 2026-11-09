import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // convex-test runs functions in the same edge runtime Convex uses.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    // .design/ links back to the code for the fixture deployment.
    exclude: ["**/node_modules/**", ".design/**", "dist/**"],
  },
});
