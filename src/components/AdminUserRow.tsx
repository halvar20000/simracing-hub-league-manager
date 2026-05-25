"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { formatDate } from "@/lib/date";
import {
  setUserRole,
  setUserActive,
  updateUserProfile,
} from "@/lib/actions/admin-users";

/**
 * One editable row of the admin Users table.
 *
 * Display mode shows the driver's data plus Edit / role / Delete controls.
 * Edit mode swaps the name / email / iRacing ID / country cells for inputs
 * and shows Save / Cancel. "Delete" is a soft delete — it flips
 * `isActive` to false (reversible with "Restore"); no row is ever removed.
 */

export type AdminUserRowData = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  iracingMemberId: string | null;
  discordId: string | null;
  countryCode: string | null;
  role: Role;
  isActive: boolean;
  iratingSportsCar: number | null;
  safetyRatingSportsCar: number | null;
  licenseClassSportsCar: string | null;
  iratingFormulaCar: number | null;
  iratingOval: number | null;
  iracingLastSyncedAt: Date | string | null;
  createdAt: Date | string;
};

const ROLES: Role[] = ["ADMIN", "STEWARD", "DRIVER"];
/** Keep in sync with the <thead> in users/page.tsx. */
const COL_COUNT = 15;

const inputCls =
  "rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-sm text-zinc-100";

export default function AdminUserRow({
  user,
  isSelf,
  accountDiscordId,
}: {
  user: AdminUserRowData;
  isSelf: boolean;
  /**
   * Discord ID from the OAuth Account (set when the driver signed in to the
   * website with Discord). Distinct from the admin-set `User.discordId` — a
   * driver linked this way has a working link even with no `discordId`.
   */
  accountDiscordId: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Local copy of the editable fields. The display cells read from `fields`
  // so a successful save shows immediately; `draft` holds in-progress edits.
  const [fields, setFields] = useState({
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    email: user.email ?? "",
    iracingMemberId: user.iracingMemberId ?? "",
    discordId: user.discordId ?? "",
    countryCode: user.countryCode ?? "",
  });
  const [draft, setDraft] = useState(fields);

  function startEdit() {
    setDraft(fields);
    setError(null);
    setConfirmDelete(false);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateUserProfile(user.id, draft);
      if (res.ok) {
        setFields({
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          email: draft.email.trim(),
          iracingMemberId: draft.iracingMemberId.trim(),
          discordId: draft.discordId.trim(),
          countryCode: draft.countryCode.trim().toUpperCase(),
        });
        setEditing(false);
      } else {
        setError(res.error);
      }
    });
  }

  function changeRole(role: Role) {
    if (role === user.role) return;
    startTransition(async () => {
      await setUserRole(user.id, role);
    });
  }

  function softDelete() {
    startTransition(async () => {
      await setUserActive(user.id, false);
      setConfirmDelete(false);
    });
  }

  function restore() {
    startTransition(async () => {
      await setUserActive(user.id, true);
    });
  }

  const displayName =
    `${fields.firstName} ${fields.lastName}`.trim() || user.name || "—";

  const filterText = [
    fields.firstName,
    fields.lastName,
    user.name,
    fields.email,
    fields.iracingMemberId,
    fields.discordId,
    accountDiscordId,
    fields.countryCode,
    user.role,
    user.isActive ? "active" : "inactive",
    user.iratingSportsCar,
    user.licenseClassSportsCar,
  ]
    .filter((x) => x != null && x !== "")
    .join(" ")
    .toLowerCase();

  return (
    <>
      <tr
        data-filter={filterText}
        className={`border-t border-zinc-800 hover:bg-zinc-900 ${
          user.isActive ? "" : "opacity-50"
        }`}
      >
        {/* Name */}
        <td className="px-3 py-2 font-medium">
          {editing ? (
            <div className="flex gap-1">
              <input
                aria-label="First name"
                value={draft.firstName}
                onChange={(e) =>
                  setDraft({ ...draft, firstName: e.target.value })
                }
                placeholder="First"
                disabled={pending}
                className={`${inputCls} w-20`}
              />
              <input
                aria-label="Last name"
                value={draft.lastName}
                onChange={(e) =>
                  setDraft({ ...draft, lastName: e.target.value })
                }
                placeholder="Last"
                disabled={pending}
                className={`${inputCls} w-24`}
              />
            </div>
          ) : (
            displayName
          )}
        </td>

        {/* Email */}
        <td className="px-3 py-2 text-zinc-400">
          {editing ? (
            <input
              aria-label="Email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="email@example.com"
              disabled={pending}
              className={`${inputCls} w-48`}
            />
          ) : (
            fields.email || "—"
          )}
        </td>

        {/* iRacing ID */}
        <td className="px-3 py-2 text-zinc-400 tabular-nums">
          {editing ? (
            <input
              aria-label="iRacing member ID"
              inputMode="numeric"
              value={draft.iracingMemberId}
              onChange={(e) =>
                setDraft({ ...draft, iracingMemberId: e.target.value })
              }
              placeholder="123456"
              disabled={pending}
              className={`${inputCls} w-24`}
            />
          ) : (
            fields.iracingMemberId || "—"
          )}
        </td>

        {/* Discord ID — the admin-set User.discordId, or the ID from the
            driver's Discord login if they have no admin-set value. */}
        <td className="px-3 py-2 text-zinc-400 tabular-nums">
          {editing ? (
            <div className="space-y-1">
              <input
                aria-label="Discord ID"
                inputMode="numeric"
                value={draft.discordId}
                onChange={(e) =>
                  setDraft({ ...draft, discordId: e.target.value })
                }
                placeholder="Discord user ID"
                disabled={pending}
                className={`${inputCls} w-40`}
              />
              {accountDiscordId && (
                <div className="text-[11px] text-zinc-500">
                  Linked via Discord login: {accountDiscordId}
                </div>
              )}
            </div>
          ) : fields.discordId ? (
            fields.discordId
          ) : accountDiscordId ? (
            <span>
              {accountDiscordId}{" "}
              <span className="text-[11px] text-zinc-600">· login</span>
            </span>
          ) : (
            "—"
          )}
        </td>

        {/* Country */}
        <td className="px-3 py-2 text-zinc-400">
          {editing ? (
            <input
              aria-label="Country code"
              value={draft.countryCode}
              onChange={(e) =>
                setDraft({ ...draft, countryCode: e.target.value })
              }
              placeholder="DE"
              maxLength={3}
              disabled={pending}
              className={`${inputCls} w-14 uppercase`}
            />
          ) : (
            fields.countryCode || "—"
          )}
        </td>

        {/* iRacing stats — read-only (managed by the iRacing sync) */}
        <td className="px-3 py-2 text-zinc-200 tabular-nums">
          {user.iratingSportsCar ?? "—"}
        </td>
        <td className="px-3 py-2 text-zinc-400 tabular-nums">
          {user.safetyRatingSportsCar != null
            ? user.safetyRatingSportsCar.toFixed(2)
            : "—"}
        </td>
        <td className="px-3 py-2 text-xs">
          <LicenseBadge cls={user.licenseClassSportsCar} />
        </td>
        <td className="px-3 py-2 text-zinc-400 tabular-nums">
          {user.iratingFormulaCar ?? "—"}
        </td>
        <td className="px-3 py-2 text-zinc-400 tabular-nums">
          {user.iratingOval ?? "—"}
        </td>
        <td
          className="px-3 py-2 text-[11px] text-zinc-500 whitespace-nowrap"
          title={user.iracingLastSyncedAt ? undefined : "Never synced"}
        >
          {user.iracingLastSyncedAt
            ? formatDate(user.iracingLastSyncedAt)
            : "—"}
        </td>

        {/* Role */}
        <td className="px-3 py-2">
          <RoleBadge role={user.role} />
        </td>

        {/* Status */}
        <td className="px-3 py-2">
          <StatusBadge active={user.isActive} />
        </td>

        {/* Joined */}
        <td className="px-3 py-2 text-xs text-zinc-500 whitespace-nowrap">
          {formatDate(user.createdAt)}
        </td>

        {/* Actions */}
        <td className="px-3 py-2">
          {editing ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded bg-orange-500 px-2 py-1 text-xs font-medium text-zinc-950 hover:bg-orange-400 disabled:cursor-wait disabled:opacity-70"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={startEdit}
                disabled={pending}
                className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
              >
                Edit
              </button>

              {isSelf ? (
                <span className="px-1 text-xs text-zinc-500">(you)</span>
              ) : (
                <>
                  {ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => changeRole(role)}
                      disabled={pending || user.role === role}
                      className={`rounded px-2 py-1 text-xs ${
                        user.role === role
                          ? "cursor-default bg-zinc-800 text-zinc-500"
                          : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {role.charAt(0) + role.slice(1).toLowerCase()}
                    </button>
                  ))}

                  {!user.isActive ? (
                    <button
                      type="button"
                      onClick={restore}
                      disabled={pending}
                      className="rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-60"
                    >
                      Restore
                    </button>
                  ) : confirmDelete ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={softDelete}
                        disabled={pending}
                        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:cursor-wait disabled:opacity-70"
                      >
                        {pending ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        disabled={pending}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      disabled={pending}
                      title="Soft delete — deactivates the account (reversible)"
                      className="rounded border border-red-800 px-2 py-1 text-xs text-red-300 hover:bg-red-900/40 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </td>
      </tr>

      {error && (
        <tr data-filter={filterText}>
          <td colSpan={COL_COUNT} className="px-3 pb-2 text-xs text-red-400">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Small coloured pill for the iRacing Sports Car license class. Empty
 * (or Rookie) gets a muted style so the column still scans cleanly when
 * a driver hasn't raced Sports Car yet.
 */
function LicenseBadge({ cls }: { cls: string | null }) {
  if (!cls) return <span className="text-zinc-600">—</span>;
  const styles: Record<string, string> = {
    "Class A": "bg-emerald-900/40 text-emerald-200 border-emerald-700/50",
    "Class B": "bg-blue-900/40 text-blue-200 border-blue-700/50",
    "Class C": "bg-amber-900/40 text-amber-200 border-amber-700/50",
    "Class D": "bg-orange-900/40 text-orange-200 border-orange-700/50",
    Rookie: "bg-zinc-800 text-zinc-400 border-zinc-700",
    Pro: "bg-fuchsia-900/40 text-fuchsia-200 border-fuchsia-700/50",
  };
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] ${
        styles[cls] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"
      }`}
    >
      {cls}
    </span>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<string, string> = {
    ADMIN: "bg-orange-900 text-orange-200",
    STEWARD: "bg-blue-900 text-blue-200",
    DRIVER: "bg-zinc-800 text-zinc-400",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        styles[role] ?? ""
      }`}
    >
      {role}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        active
          ? "bg-emerald-900/50 text-emerald-200"
          : "bg-red-900/50 text-red-300"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
