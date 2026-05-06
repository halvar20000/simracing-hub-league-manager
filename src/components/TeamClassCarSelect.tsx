"use client";

import { useState } from "react";

type Car = { id: string; name: string };

type CarClass = {
  id: string;
  name: string;
  shortCode: string;
  isLocked: boolean;
  cars: Car[];
};

export default function TeamClassCarSelect({
  carClasses,
  defaultClassId,
  defaultCarId,
}: {
  carClasses: CarClass[];
  defaultClassId?: string;
  defaultCarId?: string;
}) {
  const [classId, setClassId] = useState<string>(defaultClassId ?? "");
  const [carId, setCarId] = useState<string>(defaultCarId ?? "");

  const selectedClass = carClasses.find((c) => c.id === classId);
  const availableCars = selectedClass?.cars ?? [];
  const isAutoCar = availableCars.length === 1;
  const autoCarId = isAutoCar ? availableCars[0]!.id : "";

  const onClassChange = (newClassId: string) => {
    setClassId(newClassId);
    const newClass = carClasses.find((c) => c.id === newClassId);
    if (!newClass) {
      setCarId("");
      return;
    }
    if (newClass.cars.length === 1) {
      setCarId(newClass.cars[0]!.id);
    } else if (!newClass.cars.find((c) => c.id === carId)) {
      // Current car doesn't belong to the newly selected class — clear it
      setCarId("");
    }
  };

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">
          Class <span className="text-orange-400">*</span>
        </span>
        <select
          name="carClassId"
          required
          value={classId}
          onChange={(e) => onClassChange(e.target.value)}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          <option value="">Select class…</option>
          {carClasses.map((c) => (
            <option key={c.id} value={c.id} disabled={c.isLocked}>
              {c.name}
              {c.isLocked ? " — locked (full)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">
          Car <span className="text-orange-400">*</span>
        </span>
        {isAutoCar ? (
          <>
            <input type="hidden" name="carId" value={autoCarId} />
            <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
              <span>{availableCars[0]!.name}</span>
              <span className="text-xs text-zinc-500">
                (only car in this class — auto-selected)
              </span>
            </div>
          </>
        ) : (
          <select
            name="carId"
            required
            value={carId}
            onChange={(e) => setCarId(e.target.value)}
            disabled={!classId}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
          >
            <option value="">
              {classId ? "Select car…" : "Pick a class first"}
            </option>
            {availableCars.map((car) => (
              <option key={car.id} value={car.id}>
                {car.name}
              </option>
            ))}
          </select>
        )}
        <span className="mt-1 block text-xs text-zinc-500">
          All teammates drive the same car.
        </span>
      </label>
    </>
  );
}
