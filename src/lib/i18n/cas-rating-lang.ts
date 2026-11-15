import { cookies } from "next/headers";
import { CR_DICTS, CR_LANG_COOKIE, parseCrLang, type CrDict, type CrLang } from "./cas-rating";

/**
 * Server components only: the CAS Rating page language. A `?lang=en|de` in the
 * URL wins over the cookie, so a page can be linked directly in one language
 * (the CAS homepage embeds CLS in a frame, where the cookie is not sent).
 */
export async function getCrLang(param?: string | string[] | null): Promise<{ lang: CrLang; t: CrDict }> {
  const p = Array.isArray(param) ? param[0] : param;
  const lang = p === "en" || p === "de" ? p : parseCrLang((await cookies()).get(CR_LANG_COOKIE)?.value);
  return { lang, t: CR_DICTS[lang] };
}
