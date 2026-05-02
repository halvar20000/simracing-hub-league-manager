"use client";
import { useState } from "react";

export default function CopyTextButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700 ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch (e) {
          console.error("Copy failed", e);
        }
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
