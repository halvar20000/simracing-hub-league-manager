import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendDeveloperMessage } from "@/lib/actions/contact";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

export const metadata: Metadata = pageMetadata({
  title: "Contact the developer",
  description:
    "Report a bug, request a change, or ask a question about the CLS website.",
  url: "/contact",
});

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { success, error } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Contact the developer</h1>
        <p className="text-zinc-400">
          Found a bug, or have an idea for the site? Sign in with Discord to
          send a message directly to the developer.
        </p>
        <Link
          href={`/api/auth/signin?callbackUrl=${encodeURIComponent("/contact")}`}
          className="inline-block rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-indigo-500"
        >
          Sign in with Discord
        </Link>
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { firstName: true, lastName: true },
  });
  const senderName =
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "you";

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contact the developer</h1>
        <p className="mt-1 text-sm text-zinc-400">
          For everything about the CLS website itself — bugs, things that
          don&apos;t work, change requests, ideas. Your message goes straight
          to the developer by email. (Race incidents belong in the{" "}
          <Link href="/incidents" className="text-orange-400 hover:underline">
            incident reporting
          </Link>{" "}
          flow, not here.)
        </p>
      </div>

      {success && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Message sent — thank you! The developer will get back to you if
          needed.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <p className="text-zinc-400">Sending as:</p>
        <p className="mt-1 font-semibold text-zinc-200">{senderName}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Your name and account details are attached automatically.
        </p>
      </div>

      <form action={sendDeveloperMessage} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Category <span className="text-orange-400">*</span>
          </span>
          <select
            name="category"
            required
            defaultValue=""
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="" disabled>
              Select…
            </option>
            <option>Bug / something is not working</option>
            <option>Change request / idea</option>
            <option>Question</option>
            <option>Other</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Which page is it about? (optional)
          </span>
          <input
            name="pageUrl"
            maxLength={300}
            placeholder="e.g. /leagues/cas-gt3-wct/… or a short description"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Message <span className="text-orange-400">*</span>
          </span>
          <textarea
            name="message"
            required
            rows={6}
            maxLength={4000}
            placeholder="Describe the problem or your idea. For bugs: what did you do, what happened, what did you expect?"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <SubmitWithSpinner
          label="Send message"
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        />
      </form>
    </div>
  );
}
