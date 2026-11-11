import { type ResolvedListingUrl, resolveListingUrl } from "../shared/sources";

/**
 * The first supported listing link in shared text. Share sheets put the link in the URL,
 * the text ("Look at this car: https://…") or the title, depending on the app.
 */
export function findListingUrl(...texts: (string | undefined)[]): ResolvedListingUrl | null {
  for (const text of texts) {
    for (const link of text?.match(/https?:\/\/\S+/g) ?? []) {
      // Sentence punctuation right after a link is not part of it.
      const ref = resolveListingUrl(link.replace(/[.,;:!?)\]'"]+$/, ""));
      if (ref) return ref;
    }
  }
  return null;
}
