import { cookies } from "next/headers";
import { CR_DICTS, CR_LANG_COOKIE, parseCrLang, type CrDict, type CrLang } from "./cas-rating";

/** Server components only: the CAS Rating page language from the cookie. */
export async function getCrLang(): Promise<{ lang: CrLang; t: CrDict }> {
  const lang = parseCrLang((await cookies()).get(CR_LANG_COOKIE)?.value);
  return { lang, t: CR_DICTS[lang] };
}
