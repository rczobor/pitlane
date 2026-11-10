import { httpRouter } from "convex/server";
import * as mcp from "./mcp";

const http = httpRouter();

// The MCP server for Claude and other MCP clients, signed in with OAuth.
for (const method of ["POST", "GET", "DELETE"] as const) http.route({ path: "/mcp", method, handler: mcp.handle });
http.route({ path: "/.well-known/oauth-protected-resource/mcp", method: "GET", handler: mcp.protectedResource });

export default http;
