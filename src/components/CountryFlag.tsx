import React from "react";

function emojiFor(code: string): string {
  if (!code || code.length !== 2) return "";
  const upper = code.toUpperCase();
  const cps = [...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  if (cps.some((cp) => cp < 0x1f1e6 || cp > 0x1f1ff)) return "";
  return String.fromCodePoint(...cps);
}

export function CountryFlag({
  code,
  className,
}: {
  code: string | null | undefined;
  className?: string;
}) {
  if (!code) return null;
  const emoji = emojiFor(code);
  if (!emoji) return null;
  return (
    <span
      title={code.toUpperCase()}
      aria-label={code.toUpperCase()}
      className={className ?? "mr-1.5 inline-block align-[-2px] text-[14px] leading-none"}
    >
      {emoji}
    </span>
  );
}
