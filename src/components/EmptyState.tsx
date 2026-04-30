import Link from "next/link";
import React from "react";

export function EmptyState({
  icon,
  title,
  description,
  cta,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
      {icon ? (
        <div className="mx-auto mb-3 inline-block text-zinc-500">{icon}</div>
      ) : null}
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
          {description}
        </p>
      ) : null}
      {cta ? (
        <Link
          href={cta.href}
          className="mt-4 inline-block rounded bg-[#ff6b35] px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-[#ff8550]"
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

export function ChartIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

export function FlagIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 22V4" />
      <path d="M4 4h13l-2 5 2 5H4" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export function UsersIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
