import Link from "next/link";
import { auth } from "@/auth";
import { pageMetadata } from "@/lib/og";
import InstallApp from "@/components/InstallApp";
import PushSettings from "@/components/PushSettings";
import {
  DEFAULT_PUSH_TOPICS,
  getVapidKeys,
  PUSH_TOPICS,
  PUSH_TOPIC_LABEL,
} from "@/lib/push";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageMetadata({
    title: "CAS League app",
    description:
      "CAS League on your phone: standings, results, RSVP and a push notification before every race. Android and iPhone.",
    url: "/app",
  });
}

const FEATURES = [
  ["Race reminders", "A notification about an hour before each of your races."],
  ["RSVP in one tap", "Told when the RSVP opens, answered straight from the notification."],
  ["Results first", "Know the result as soon as the stewards publish it."],
  ["Incident reports", "A heads-up when the reporting window opens after your race."],
  ["Every league", "GT3 WCT, IEC, PCCD, SFL Cup, Combined Cup and Fun League standings."],
  ["Streams", "Every race broadcast, one tap away."],
];

export default async function AppPage() {
  const session = await auth();
  const { publicKey } = await getVapidKeys();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="flex items-center gap-4">
        <img
          src="/icons/icon-192.png"
          alt=""
          width={72}
          height={72}
          className="h-[72px] w-[72px] rounded-2xl border border-zinc-800"
        />
        <div>
          <h1 className="font-display text-3xl font-bold">CAS League app</h1>
          <p className="text-sm text-zinc-400">
            For Android and iPhone — free, no app store needed.
          </p>
        </div>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {FEATURES.map(([title, text]) => (
          <li key={title} className="rounded border border-zinc-800 bg-zinc-900 p-3">
            <div className="text-sm font-semibold text-zinc-100">{title}</div>
            <div className="mt-0.5 text-sm text-zinc-400">{text}</div>
          </li>
        ))}
      </ul>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 font-semibold">1. Install</h2>
        <InstallApp />
      </section>

      <section id="notifications" className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 font-semibold">2. Notifications</h2>
        {session?.user ? (
          <PushSettings
            publicKey={publicKey}
            topics={PUSH_TOPICS.map((k) => ({ key: k, label: PUSH_TOPIC_LABEL[k] }))}
            defaultTopics={DEFAULT_PUSH_TOPICS}
          />
        ) : (
          <p className="text-sm text-zinc-400">
            <Link href="/dashboard" className="text-[#ff6b35] hover:underline">
              Sign in with Discord
            </Link>{" "}
            to get reminders for your own races. New to CAS? Browse the{" "}
            <Link href="/leagues" className="text-[#ff6b35] hover:underline">
              leagues
            </Link>{" "}
            and join one that is open for registration.
          </p>
        )}
      </section>
    </div>
  );
}
