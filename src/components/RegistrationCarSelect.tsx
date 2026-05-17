"use client";

import { updateRegistrationCar } from "@/lib/actions/admin-registrations";

export default function RegistrationCarSelect({
  registrationId,
  currentCarId,
  cars,
}: {
  registrationId: string;
  currentCarId: string | null;
  cars: { id: string; name: string }[];
}) {
  return (
    <form action={updateRegistrationCar}>
      <input type="hidden" name="registrationId" value={registrationId} />
      <select
        name="carId"
        defaultValue={currentCarId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full max-w-[16rem] rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
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
