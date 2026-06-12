import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-zinc-800 bg-[#0a0a0f]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-xs text-zinc-500">
          Independent. No ads. No tracking. No affiliate links.
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-3 text-xs">
          <Link
            href="/contact"
            className="inline-flex items-center gap-1.5 rounded border border-[#ff6b35] px-3 py-1.5 font-medium text-[#ff6b35] hover:bg-[#ff6b35]/10"
          >
            <span aria-hidden>🛠️</span> Report an issue / Contact developer
          </Link>
          <a
            href="https://docs.google.com/document/d/1-PSzsVuO72ibGj0ioXDoHIMyehA5lOsn9LVuo5vI2M8/edit?tab=t.os392vq0z8ib"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-[#ff6b35]"
          >
            CAS Regulations ↗
          </a>
        </nav>
      </div>
    </footer>
  );
}
