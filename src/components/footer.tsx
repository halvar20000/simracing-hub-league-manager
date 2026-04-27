import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-zinc-800 bg-[#0a0a0f]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <img
            src="/logos/site-logo.svg"
            alt="Simracing-Hub"
            className="h-6 w-6 opacity-70"
          />
          <span>
            Powered by{" "}
            <Link
              href="https://simracing-hub.com"
              className="text-zinc-300 hover:text-[#ff6b35]"
              target="_blank"
              rel="noopener noreferrer"
            >
              Simracing-Hub
            </Link>
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          Independent. No ads. No tracking. No affiliate links.
        </p>
      </div>
    </footer>
  );
}
