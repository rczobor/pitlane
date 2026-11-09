import { ConvexError } from "convex/values";

// Errors the HTTP layer turns into 4xx responses; anything else is a 500.
export type AppErrorData = { code: "invalid" | "not_found"; message: string };

export const appError = (code: AppErrorData["code"], message: string) =>
  new ConvexError<AppErrorData>({ code, message });
