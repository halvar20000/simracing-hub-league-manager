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
  copyClassesAndCarsFromPreviousSeason,
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
          _count: {
            select: {
              cars: true,
              registrations: true,
              teamResults: true,
            },
          },
        },
      },
    },
  });

  if (!season || season.league.slug !== slug) notFound();

  // Season-wide shared cars (carClassId is NULL). These are selectable from
  // any driver class — typically used on PRO/AM leagues where both tiers
  // race the same cars, so we don't have to add them twice.
  const sharedCars = await prisma.car.findMany({
    where: { seasonId, carClassId: null },
    orderBy: { displayOrder: "asc" },
  });

  // Most recent prior season in the same league — used to label / enable
  // the "Copy from previous season" button.
  const previousSeason = await prisma.season.findFirst({
    where: {
      leagueId: season.leagueId,
      id: { not: season.id },
      createdAt: { lt: season.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      year: true,
      _count: { select: { carClasses: true } },
    },
  });

  // GT3 WCT uses "classes" for Pro/Am splits, not actual car classes. Tailor
  // the form labels and example placeholders accordingly.
  const isProAmLeague = slug === "cas-gt3-wct";
  const classHeading = isProAmLeague
    ? "Add driver class (PRO, AM)"
    : "Add a car class";
  const classNamePlaceholder = isProAmLeague ? "PRO" : "GT4";
  const classShortPlaceholder = isProAmLeague ? "PRO" : "GT4";

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
          Manage the list of cars drivers can pick when registering. Most
          leagues only need the <span className="text-zinc-200">Shared
          cars</span> list below — those cars are selectable from every
          driver class. Use a class-specific car list only when a car is
          restricted to one class.
        </p>
      </div>

      {previousSeason && previousSeason._count.carClasses > 0 && (
        <section className="rounded border border-zinc-800 bg-zinc-900 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Copy from previous season</h2>
            <p className="text-xs text-zinc-400">
              Copies every class and car from{" "}
              <span className="text-zinc-200">
                {previousSeason.name} ({previousSeason.year})
              </span>
              {" "}into this season. Existing classes (matched by short code)
              and existing cars (matched by name) are skipped, so it&apos;s
              safe to run more than once.
            </p>
          </div>
          <form action={copyClassesAndCarsFromPreviousSeason}>
            <input type="hidden" name="seasonId" value={seasonId} />
            <button
              type="submit"
              className="rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold hover:bg-orange-500"
            >
              Copy from {previousSeason.name}
            </button>
          </form>
        </section>
      )}

            <section className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <h2 className="text-lg font-semibold">{classHeading}</h2>
        <form action={addCarClass} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="seasonId" value={seasonId} />
          <div>
            <label className="block text-xs text-zinc-400">Name</label>
            <input
              type="text"
              name="name"
              required
              placeholder={classNamePlaceholder}
              className="w-32 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Short code</label>
            <input
              type="text"
              name="shortCode"
              required
              placeholder={classShortPlaceholder}
              className="w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            />
          </div>
          {!isProAmLeague && (
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
          )}
          <button
            type="submit"
            className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600"
          >
            Add class
          </button>
        </form>
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">
            Shared cars (any class){" "}
            <span className="text-sm text-zinc-500">
              ({sharedCars.length} car{sharedCars.length === 1 ? "" : "s"})
            </span>
          </h2>
          <p className="text-xs text-zinc-400">
            Cars listed here are season-wide and selectable from every driver
            class. Use this for PRO/AM leagues where both tiers race the same
            roster of cars — no need to add the cars under each class.
          </p>
        </div>

        {sharedCars.length > 0 && (
          <ul className="space-y-2">
            {sharedCars.map((car) => (
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
        )}

        <form action={addCarsBulk} className="space-y-2">
          <input type="hidden" name="seasonId" value={seasonId} />
          {/* No carClassId on purpose — creates shared (carClassId=null) cars. */}
          <label className="block text-sm text-zinc-300">
            Add shared cars (one per line, optional iRacing ID after a comma)
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
            Add shared cars
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
            <details className="ml-auto">
              <summary className="cursor-pointer rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
                Danger zone
              </summary>
              <form action={deleteCarClass} className="mt-2">
                <input type="hidden" name="carClassId" value={cc.id} />
                <button
                  type="submit"
                  disabled={
                    cc._count.registrations > 0 || cc._count.teamResults > 0
                  }
                  title={
                    cc._count.registrations > 0 || cc._count.teamResults > 0
                      ? "Cannot delete: this class has registrations or race results."
                      : "Deletes the class and all its cars."
                  }
                  className="rounded border border-red-900/40 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Delete class
                </button>
                {(cc._count.registrations > 0 ||
                  cc._count.teamResults > 0) && (
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Has {cc._count.registrations} registration
                    {cc._count.registrations === 1 ? "" : "s"} /{" "}
                    {cc._count.teamResults} result
                    {cc._count.teamResults === 1 ? "" : "s"} — clear those first.
                  </p>
                )}
              </form>
            </details>
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
          ) : sharedCars.length > 0 ? (
            <p className="rounded border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
              Drivers in <span className="font-semibold">{cc.name}</span> can
              already pick any of the {sharedCars.length} shared car
              {sharedCars.length === 1 ? "" : "s"} above — no need to add them
              again here.
            </p>
          ) : (
            <p className="text-sm text-zinc-500">No cars yet for this class.</p>
          )}

          {sharedCars.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                Advanced: add a car that belongs only to {cc.name}
              </summary>
              <form action={addCarsBulk} className="mt-3 space-y-2">
                <input type="hidden" name="carClassId" value={cc.id} />
                <p className="text-xs text-zinc-500">
                  Only needed when a car must be exclusive to this class (e.g.
                  a BoP-restricted variant). For the normal case use the
                  shared-cars list above instead.
                </p>
                <textarea
                  name="lines"
                  rows={3}
                  placeholder={"Class-only car name, 999"}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs"
                />
                <button
                  type="submit"
                  className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600"
                >
                  Add to {cc.name} only
                </button>
              </form>
            </details>
          ) : (
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
          )}
        </section>
      ))}
    </div>
  );
}
