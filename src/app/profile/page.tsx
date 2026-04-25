import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateProfile } from "@/lib/actions/profile";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/profile");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) redirect("/api/auth/signin");

  const { error, success } = await searchParams;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Required before you can register for a season.
        </p>
      </div>

      {success && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Profile saved.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form action={updateProfile} className="space-y-4">
        <Field
          label="First name"
          name="firstName"
          required
          defaultValue={user.firstName ?? ""}
        />
        <Field
          label="Last name"
          name="lastName"
          required
          defaultValue={user.lastName ?? ""}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={user.email ?? ""}
        />
        <Field
          label="iRacing member ID"
          name="iracingMemberId"
          required
          defaultValue={user.iracingMemberId ?? ""}
          help="Numeric ID. Find it on iracing.com → My Account → Member ID."
        />

        <button
          type="submit"
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  help?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">
        {label} {required && <span className="text-orange-400">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
      />
      {help && <span className="mt-1 block text-xs text-zinc-500">{help}</span>}
    </label>
  );
}
