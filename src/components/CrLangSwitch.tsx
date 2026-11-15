"use client";

import { useRouter } from "next/navigation";
import { CR_LANG_COOKIE, type CrLang } from "@/lib/i18n/cas-rating";

/** DE / EN switch for the CAS Rating pages (cookie, one year). */
export default function CrLangSwitch({ lang }: { lang: CrLang }) {
  const router = useRouter();
  const set = (l: CrLang) => {
    document.cookie = `${CR_LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    // A direct link (?lang=en) overrides the cookie, so switch the URL too.
    const u = new URL(window.location.href);
    if (u.searchParams.has("lang")) {
      u.searchParams.set("lang", l);
      router.replace(u.pathname + u.search + u.hash);
    } else router.refresh();
  };
  const btn = (l: CrLang, label: string) => (
    <button
      type="button"
      onClick={() => set(l)}
      aria-pressed={lang === l}
      className={`px-2.5 py-1 text-xs font-semibold ${
        lang === l ? "bg-[#ff6b35] text-zinc-950" : "tab-off"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex overflow-hidden rounded border border-zinc-700" role="group" aria-label="Language">
      {btn("de", "DE")}
      {btn("en", "EN")}
    </div>
  );
}
