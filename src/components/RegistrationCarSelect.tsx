"use client";

import { updateRegistrationCar } from "@/lib/actions/admin-registrations";

export default function RegistrationCarSelect({
  registrationId,
  currentCarId,
  cars,
  teamId,
}: {
  registrationId: string;
  /** Set for a row of an EXTRA team: the car is saved for that team only. */
  teamId?: string;
  currentCarId: string | null;
  cars: { id: string; name: string }[];
}) {
  return (
    <form action={updateRegistrationCar}>
      <input type="hidden" name="registrationId" value={registrationId} />
      {teamId && <input type="hidden" name="teamId" value={teamId} />}
      <select
        key={currentCarId ?? "none"}
        name="carId"
        defaultValue={currentCarId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="block w-full min-w-[14rem] rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
      >
        <option value="">— none —</option>
        {cars.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </form>
  );
}
