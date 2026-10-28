export const metadata = { title: "Offline — CLS" };

/** Shown by the service worker when a page can't be loaded (no connection). */
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="font-display text-2xl font-bold">You are offline</h1>
      <p className="mt-3 text-zinc-400">
        CLS needs a connection for standings, results and RSVP. Check your
        network and try again.
      </p>
      <a
        href="/"
        className="mt-6 inline-block rounded bg-[#ff6b35] px-4 py-2 font-semibold text-zinc-950"
      >
        Retry
      </a>
    </div>
  );
}
