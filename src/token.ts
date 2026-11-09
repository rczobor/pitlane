import { createContext, useContext, useState } from "react";

// The API token stays in this browser only; storage can be unavailable (private windows).
const key = "pitlane.token";

function read() {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useToken() {
  const [token, setToken] = useState(read);
  const save = (next: string | null) => {
    try {
      if (next) localStorage.setItem(key, next);
      else localStorage.removeItem(key);
    } catch {
      // Still works for this session.
    }
    setToken(next);
  };
  return [token, save] as const;
}

export const TokenContext = createContext<string | null>(null);

// Only rendered below the root's token gate, so a token is always present.
export const useBoardToken = () => useContext(TokenContext)!;
