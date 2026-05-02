import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addCarsBulk,
  deleteCar,
  updateCarIracingId,
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

      {season.carClasses.length === 0 && (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-zinc-400">
          This season has no car classes yet. Add at least one car class on the
          season page before managing cars.
        </p>
      )}

      {season.carClasses.map((cc) => (
        <section
          key={cc.id}
          className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {cc.name}{" "}
              <span className="text-sm text-zinc-500">
                ({cc._count.cars} car{cc._count.cars === 1 ? "" : "s"})
              </span>
            </h2>
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
