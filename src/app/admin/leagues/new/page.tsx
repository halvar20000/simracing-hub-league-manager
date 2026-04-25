import Link from "next/link";
import { createLeague } from "@/lib/actions/leagues";

export default async function NewLeaguePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/leagues"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to leagues
        </Link>
        <h1 className="mt-2 text-2xl font-bold">New League</h1>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form action={createLeague} className="max-w-xl space-y-4">
        <Field label="Name" name="name" required placeholder="CAS Combined Cup" />
        <Field
          label="Description"
          name="description"
          textarea
          placeholder="Optional description shown on the public league page"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Create League
          </button>
          <Link
            href="/admin/leagues"
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
  textarea,
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  textarea?: boolean;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">{label}</span>
      {textarea ? (
        <textarea
          name={name}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          rows={4}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
        />
      ) : (
        <input
          name={name}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
        />
      )}
    </label>
  );
}
