import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addCarsBulk,
  deleteCar,
  updateCarIracingId,
  addCarClass,
  deleteCarClass,
  toggleCarClassLock,
} from "@/lib/actions/cars";

export default async function AdminSeasonCars({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: true,
      carClasses: {
        orderBy: { displayOrder: "asc" },
        include: {
          cars: { orderBy: { displayOrder: "asc" } },
          _count: { select: { cars: true } },
        },
      },
    },
  });

  if (!season || season.league.slug !== slug) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to season
        </Link>
        <h1 className="text-2xl font-bold">
          Cars — {season.name} {season.year}
        </h1>
        <p className="text-sm text-zinc-400">
          Manage the list of cars drivers can pick when registering. Cars are
          grouped by car class. Format: one car per line, optional iRacing ID
          after a comma.
        </p>
      </div>

            <section className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Add a car class</h2>
        <form action={addCarClass} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="seasonId" value={seasonId} />
          <div>
            <label className="block text-xs text-zinc-400">Name</label>
            <input
              type="text"
              name="name"
              required
              placeholder="GT4"
              className="w-32 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Short code</label>
            <input
              type="text"
              name="shortCode"
              required
              placeholder="GT4"
              className="w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">
              iRacing class id(s) — optional, comma-separated
            </label>
            <input
              type="text"
              name="iracingCarClassIds"
              placeholder="74, 84"
              className="w-40 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600"
          >
            Add class
          </button>
        </form>
      </section>

      {season.carClasses.length === 0 && (
        <p className="text-sm text-zinc-500">
          No car classes yet for this season — add one above to get started.
        </p>
      )}

      {season.carClasses.map((cc) => (
        <section
          key={cc.id}
          className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {cc.name}{" "}
              <span className="text-sm text-zinc-500">
                ({cc._count.cars} car{cc._count.cars === 1 ? "" : "s"})
              </span>
            </h2>
            <form action={toggleCarClassLock} className="mr-2">
              <input type="hidden" name="carClassId" value={cc.id} />
              <button
                type="submit"
                className={`rounded border px-2 py-1 text-xs ${
                  cc.isLocked
                    ? "border-amber-700/50 bg-amber-950/40 text-amber-200"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
                title="Locked classes cannot accept new registrations. Existing teams stay."
              >
                {cc.isLocked ? "🔒 Locked" : "Lock class"}
              </button>
            </form>
            {cc._count.cars === 0 && (
              <form action={deleteCarClass}>
                <input type="hidden" name="carClassId" value={cc.id} />
                <button
                  type="submit"
                  className="rounded border border-red-900/40 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30"
                >
                  Delete class
                </button>
              </form>
            )}
          </div>

          {cc.cars.length > 0 ? (
            <ul className="space-y-2">
              {cc.cars.map((car) => (
                <li
                  key={car.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950 px-3 py-2"
                >
                  <span className="flex-1">{car.name}</span>
                  <form
                    action={updateCarIracingId}
                    className="flex items-center gap-1"
                  >
                    <input type="hidden" name="carId" value={car.id} />
                    <label className="text-xs text-zinc-500">iR id</label>
                    <input
                      type="text"
                      name="iracingCarId"
                      defaultValue={car.iracingCarId ?? ""}
                      placeholder="—"
                      className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
                    >
                      Save
                    </button>
                  </form>
                  <form action={deleteCar}>
                    <input type="hidden" name="carId" value={car.id} />
                    <button
                      type="submit"
                      className="rounded border border-red-900/40 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30"
                    >
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No cars yet for this class.</p>
          )}

          <form action={addCarsBulk} className="space-y-2">
            <input type="hidden" name="carClassId" value={cc.id} />
            <label className="block text-sm text-zinc-300">
              Add cars (one per line, optional iRacing ID after a comma)
            </label>
            <textarea
              name="lines"
              rows={5}
              placeholder={"Ferrari 296 GT3, 132\nPorsche 911 GT3 R (992), 173\nBMW M4 EVO GT3"}
              className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs"
            />
            <button
              type="submit"
              className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600"
            >
              Add to {cc.name}
            </button>
          </form>
        </section>
      ))}
    </div>
  );
}
