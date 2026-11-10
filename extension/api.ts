// Settings and the one way the extension talks to Pitlane: the same REST API agents use.

export type Settings = { apiUrl: string; token: string };

export async function loadSettings(): Promise<Settings | null> {
  const { apiUrl, token } = await chrome.storage.local.get(["apiUrl", "token"]);
  return typeof apiUrl === "string" && typeof token === "string" && apiUrl && token ? { apiUrl, token } : null;
}

export type ApiResult = { ok: true; body: unknown } | { ok: false; status: number; message: string; body?: unknown };

export async function callApi(settings: Settings, path: string, body?: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(new URL(path, settings.apiUrl), {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${settings.token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const json: unknown = await response.json().catch(() => undefined);
    if (response.ok) return { ok: true, body: json };
    const message =
      response.status === 401
        ? "Pitlane did not accept the token. Check it in the extension's options."
        : typeof json === "object" && json !== null && "error" in json
          ? String(json.error)
          : `Pitlane answered HTTP ${response.status}.`;
    return { ok: false, status: response.status, message, body: json };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, message: `Could not reach Pitlane (${reason}).` };
  }
}
