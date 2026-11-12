// Every GitHub release in the repository is an extension release, tagged extension-v<version>.
export const releasesUrl = "https://github.com/rczobor/pitlane/releases/latest";

// The newest released version, or null when GitHub cannot say. GitHub's API allows
// cross-origin reads, so this needs no host permission.
export async function latestVersion(): Promise<string | null> {
  try {
    const response = await fetch("https://api.github.com/repos/rczobor/pitlane/releases/latest");
    if (!response.ok) return null;
    const { tag_name } = (await response.json()) as { tag_name?: unknown };
    return typeof tag_name === "string" ? (/^extension-v(\d+(?:\.\d+)*)$/.exec(tag_name)?.[1] ?? null) : null;
  } catch {
    return null;
  }
}

// Chrome versions are up to four dot-separated integers; a missing part counts as 0.
export function isNewer(candidate: string, installed: string): boolean {
  const a = candidate.split(".").map(Number);
  const b = installed.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
