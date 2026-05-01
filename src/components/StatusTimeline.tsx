type Status = "SUBMITTED" | "UNDER_REVIEW" | "DECIDED" | "DISMISSED" | "WITHDRAWN";

const FLOW: Status[] = ["SUBMITTED", "UNDER_REVIEW", "DECIDED"];

export function StatusTimeline({ status }: { status: Status }) {
  // Branch end-states: DISMISSED and WITHDRAWN don't follow the linear path.
  if (status === "DISMISSED" || status === "WITHDRAWN") {
    const label =
      status === "DISMISSED" ? "Dismissed by stewards" : "Withdrawn by reporter";
    const tone =
      status === "DISMISSED"
        ? "border-zinc-700 bg-zinc-900 text-zinc-300"
        : "border-zinc-700 bg-zinc-900 text-zinc-400";
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
            Submitted
          </span>
          <span className="text-zinc-600">→</span>
          <span className={`rounded border px-2 py-0.5 ${tone}`}>{label}</span>
        </div>
      </div>
    );
  }

  const idx = FLOW.indexOf(status);
  return (
    <div className="flex items-center gap-2 text-xs">
      {FLOW.map((step, i) => {
        const reached = i <= idx;
        const styles = reached
          ? i === idx
            ? "border-orange-500 bg-orange-500/15 text-orange-200"
            : "border-emerald-700 bg-emerald-900/30 text-emerald-200"
          : "border-zinc-700 bg-zinc-900/40 text-zinc-500";
        const label =
          step === "SUBMITTED"
            ? "Submitted"
            : step === "UNDER_REVIEW"
            ? "Under review"
            : "Decided";
        return (
          <span key={step} className="flex items-center gap-2">
            <span className={`rounded border px-2 py-0.5 ${styles}`}>{label}</span>
            {i < FLOW.length - 1 && <span className="text-zinc-600">→</span>}
          </span>
        );
      })}
    </div>
  );
}
