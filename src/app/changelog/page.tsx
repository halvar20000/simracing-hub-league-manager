import { CHANGELOG, CURRENT_VERSION } from "@/lib/changelog";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

export const metadata: Metadata = pageMetadata({
  title: "Changelog",
  description: "What changed on CLS — version history of the site.",
  url: "/changelog",
});

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ChangelogPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Changelog</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Every user-visible change to the site, newest first. Current
          version:{" "}
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-orange-300">
            v{CURRENT_VERSION}
          </span>
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-medium">Version</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Date</th>
              <th className="px-4 py-3 font-medium">Changes</th>
            </tr>
          </thead>
          <tbody>
            {CHANGELOG.map((entry) => (
              <tr
                key={entry.version}
                className="border-t border-zinc-800 align-top hover:bg-zinc-900/60"
              >
                <td className="px-4 py-3 font-mono text-orange-300 whitespace-nowrap">
                  v{entry.version}
                </td>
                <td className="px-4 py-3 text-zinc-400 whitespace-nowrap tabular-nums">
                  {formatDate(entry.date)}
                </td>
                <td className="px-4 py-3 text-zinc-300">
                  <ul className="list-disc space-y-1.5 pl-4 marker:text-zinc-600">
                    {entry.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Something missing or broken? Use the{" "}
        <a href="/contact" className="text-orange-400 hover:underline">
          contact form
        </a>{" "}
        to tell the developer.
      </p>
    </div>
  );
}
