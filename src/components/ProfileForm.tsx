"use client";

import { useEffect, useState } from "react";
import {
  updateProfile,
  lookupIracingId,
  type IracingLookupResult,
} from "@/lib/actions/profile";

type Initial = {
  firstName: string;
  lastName: string;
  email: string;
  iracingMemberId: string;
};

/**
 * Profile form with live iRacing-ID recognition.
 *
 * The iRacing ID is the first field — it is the driver's stable identity.
 * As it is typed, a debounced lookup checks whether an account already holds
 * it. On a match the driver's name is pulled in and shown locked, with a
 * "welcome back" banner; the actual account merge still happens server-side
 * in updateProfile() on save.
 */
export default function ProfileForm({ initial }: { initial: Initial }) {
  const [iracingId, setIracingId] = useState(initial.iracingMemberId);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [email, setEmail] = useState(initial.email);
  const [lookup, setLookup] = useState<IracingLookupResult>({
    status: initial.iracingMemberId ? "self" : "new",
  });
  const [checking, setChecking] = useState(false);

  // Live, debounced lookup as the driver types the iRacing ID. The cancelled
  // flag drops a stale in-flight response if the field changes again.
  useEffect(() => {
    const id = iracingId.trim();
    if (!/^\d+$/.test(id)) {
      setLookup({ status: "new" });
      setChecking(false);
      return;
    }
    setChecking(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await lookupIracingId(id);
        if (cancelled) return;
        setLookup(res);
        if (res.status === "orphan" || res.status === "conflict") {
          setFirstName(res.firstName);
          setLastName(res.lastName);
        }
      } catch {
        if (!cancelled) setLookup({ status: "new" });
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [iracingId]);

  const matchInfo =
    lookup.status === "orphan" || lookup.status === "conflict" ? lookup : null;
  // When the ID matches an existing account, that account's name is
  // authoritative — show it locked. A field is only locked if the matched
  // account actually has that name, so a sparse record can still be filled.
  const firstNameLocked = matchInfo !== null && matchInfo.firstName.trim() !== "";
  const lastNameLocked = matchInfo !== null && matchInfo.lastName.trim() !== "";
  const blocked = lookup.status === "conflict";

  return (
    <form action={updateProfile} className="space-y-4">
      <Field
        label="iRacing member ID"
        name="iracingMemberId"
        required
        inputMode="numeric"
        value={iracingId}
        onChange={setIracingId}
        help="Numeric ID. Find it on iracing.com → My Account → Member ID."
      />

      {checking && (
        <p className="text-xs text-zinc-500">Checking iRacing ID…</p>
      )}

      {!checking && lookup.status === "orphan" && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Welcome back, {lookup.firstName} {lookup.lastName} — we found your
          existing profile. Your earlier registrations will be linked to this
          account when you save.
        </div>
      )}

      {!checking && lookup.status === "conflict" && (
        <div className="rounded border border-amber-800 bg-amber-950 p-3 text-sm text-amber-200">
          iRacing ID {iracingId.trim()} is already linked to{" "}
          {lookup.firstName} {lookup.lastName}&apos;s account, which has its
          own login. If that is you, please contact a league admin — it
          can&apos;t be merged here automatically.
        </div>
      )}

      <Field
        label="First name"
        name="firstName"
        required
        value={firstName}
        onChange={setFirstName}
        readOnly={firstNameLocked}
        help={firstNameLocked ? "From your existing profile." : undefined}
      />
      <Field
        label="Last name"
        name="lastName"
        required
        value={lastName}
        onChange={setLastName}
        readOnly={lastNameLocked}
        help={lastNameLocked ? "From your existing profile." : undefined}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
      />

      <div>
        <button
          type="submit"
          disabled={blocked}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save changes
        </button>
        {blocked && (
          <p className="mt-2 text-xs text-amber-300">
            Saving is disabled until the iRacing ID conflict is resolved with
            an admin.
          </p>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  value,
  onChange,
  readOnly,
  help,
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  help?: string;
  inputMode?: "numeric" | "text";
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
        value={value}
        readOnly={readOnly}
        inputMode={inputMode}
        onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
        className={
          readOnly
            ? "w-full cursor-not-allowed rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-400"
            : "w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
        }
      />
      {help && <span className="mt-1 block text-xs text-zinc-500">{help}</span>}
    </label>
  );
}
