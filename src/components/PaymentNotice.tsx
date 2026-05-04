import type { PaymentInfo } from "@/lib/payment";

export default function PaymentNotice({
  payment,
  paid,
  driverName,
  variant = "pending",
}: {
  payment: PaymentInfo;
  paid?: boolean;
  driverName?: string | null;
  variant?: "preview" | "pending";
}) {
  if (paid) {
    return (
      <div className="rounded border border-emerald-700/50 bg-emerald-950/30 p-3 text-sm text-emerald-200">
        Registration fee paid: {payment.amount} {payment.currency} ✓
      </div>
    );
  }

  if (variant === "preview") {
    return (
      <div className="rounded border border-amber-700/50 bg-amber-950/30 p-3 text-sm">
        <p className="font-semibold text-amber-100">
          Registration fee: {payment.amount} {payment.currency}
        </p>
        <p className="mt-1 text-xs text-amber-200">
          After registering, you&apos;ll see a PayPal link with payment
          instructions. Send as <strong>Friends &amp; Family</strong> with your
          real name in the message field.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-amber-700/50 bg-amber-950/30 p-3 space-y-2">
      <p className="font-semibold text-amber-100">
        Registration fee pending: {payment.amount} {payment.currency}
      </p>
      <ul className="list-disc pl-5 text-xs text-amber-200 space-y-1">
        <li>
          Send via PayPal as <strong>Friends &amp; Family</strong> (so no fees
          are deducted).
        </li>
        <li>
          Add your real name
          {driverName ? <> (<strong>{driverName}</strong>)</> : null} in the
          message field as reference, so the admin can match the payment to
          your registration.
        </li>
      </ul>
      {payment.paypalUrl ? (
        <a
          href={payment.paypalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
        >
          Pay {payment.amount} {payment.currency} via PayPal →
        </a>
      ) : (
        <p className="text-xs text-amber-300">
          PayPal link not configured for this league. Ask the admin for
          payment instructions.
        </p>
      )}
    </div>
  );
}
