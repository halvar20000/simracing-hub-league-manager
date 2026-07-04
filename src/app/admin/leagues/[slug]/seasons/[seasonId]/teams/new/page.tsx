import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createTeam } from "@/lib/actions/teams";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";

export default async function NewTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId } = await params;
  const { error } = await searchParams;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  const create = createTeam.bind(null, slug, seasonId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/teams`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to teams
        </Link>
        <h1 className="mt-2 text-2xl font-bold">New Team</h1>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form
        action={create}
        encType="multipart/form-data"
        className="max-w-xl space-y-4"
      >
        <Field
          label="Team name"
          name="name"
          required
          placeholder="Project AGM"
        />
        <Field
          label="Short name (optional)"
          name="shortName"
          placeholder="PAGM"
        />

        <div className="space-y-2">
          <span className="mb-1 block text-sm text-zinc-300">
            Logo (optional)
          </span>
          <input
            type="file"
            name="logoFile"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:text-zinc-200 hover:file:bg-zinc-700"
          />
          <p className="text-xs text-zinc-500">
            PNG, JPG, WebP, SVG or GIF, up to 5 MB. Or paste an image URL
            below.
          </p>
          <input
            name="logoUrl"
            placeholder="https://… (optional)"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <SubmitWithSpinner label="Create Team" pendingLabel="Creating…" />
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/teams`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">{label}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
      />
    </label>
  );
}
