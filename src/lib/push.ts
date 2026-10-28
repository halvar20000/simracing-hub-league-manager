/**
 * Web Push for the installed CLS app (Android + iOS 16.4+ home-screen app,
 * plus any desktop browser that allows notifications).
 *
 * Pure helpers — NOT a "use server" module; imported by the push server
 * actions, the /api/push routes and the /api/cron/push sweep.
 *
 * VAPID keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars win when set.
 * Otherwise a key pair is generated once and kept in AppSetting, so a deploy
 * needs no extra configuration. Never rotate it casually: every existing
 * subscription is bound to the public key it was created with.
 */

import webpush from "web-push";
import { prisma } from "@/lib/prisma";

export const PUSH_TOPICS = [
  "race-soon",
  "rsvp",
  "results",
  "reporting",
  "results-all",
] as const;
export type PushTopic = (typeof PUSH_TOPICS)[number];

export const PUSH_TOPIC_LABEL: Record<PushTopic, string> = {
  "race-soon": "Race starts in about an hour (my races)",
  rsvp: "RSVP is open for my next race",
  results: "Results published (my seasons)",
  reporting: "Incident reporting window opened (races I drove)",
  "results-all": "Results published in every CAS league",
};

export const DEFAULT_PUSH_TOPICS: PushTopic[] = [
  "race-soon",
  "rsvp",
  "results",
  "reporting",
];

export function isPushTopic(t: string): t is PushTopic {
  return (PUSH_TOPICS as readonly string[]).includes(t);
}

export type PushPayload = {
  title: string;
  body: string;
  /** Site-relative path opened when the notification is tapped. */
  url: string;
  /** Same tag replaces an older notification instead of stacking. */
  tag?: string;
};

const SUBJECT =
  process.env.VAPID_SUBJECT ?? "https://league.simracing-hub.com/contact";

let cachedKeys: { publicKey: string; privateKey: string } | null = null;

export async function getVapidKeys(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  if (cachedKeys) return cachedKeys;
  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) {
    cachedKeys = { publicKey: envPub, privateKey: envPriv };
    return cachedKeys;
  }
  const row = await prisma.appSetting.findUnique({ where: { key: "vapid" } });
  if (row) {
    cachedKeys = JSON.parse(row.value);
    return cachedKeys!;
  }
  const fresh = webpush.generateVAPIDKeys();
  // createMany + skipDuplicates: two instances racing on first use both end
  // up reading the same winner below.
  await prisma.appSetting.createMany({
    data: [{ key: "vapid", value: JSON.stringify(fresh) }],
    skipDuplicates: true,
  });
  const stored = await prisma.appSetting.findUniqueOrThrow({
    where: { key: "vapid" },
  });
  cachedKeys = JSON.parse(stored.value);
  return cachedKeys!;
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

/** Send one payload to one subscription; prunes it when the browser dropped it. */
async function sendOne(sub: Sub, body: string): Promise<boolean> {
  const keys = await getVapidKeys();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
      {
        vapidDetails: {
          subject: SUBJECT,
          publicKey: keys.publicKey,
          privateKey: keys.privateKey,
        },
        TTL: 6 * 3600,
        timeout: 10_000,
      }
    );
    await prisma.pushSubscription.update({
      where: { id: sub.id },
      data: { lastSuccessAt: new Date(), failCount: 0 },
    });
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
    } else {
      // Transient (5xx, network). Give up on a device after 10 straight fails.
      const updated = await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { failCount: { increment: 1 } },
      });
      if (updated.failCount >= 10) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      }
    }
    return false;
  }
}

/**
 * Push to every device of `userIds` that subscribed to `topic`. When
 * `alsoTopic` is given, devices subscribed to that topic get it too, whoever
 * they belong to (used for "results-all"). Returns the number delivered.
 */
export async function pushToUsers(
  userIds: string[],
  topic: PushTopic,
  payload: PushPayload,
  alsoTopic?: PushTopic
): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({
    where: {
      OR: [
        { userId: { in: userIds }, topics: { has: topic } },
        ...(alsoTopic ? [{ topics: { has: alsoTopic } }] : []),
      ],
    },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return 0;
  const body = JSON.stringify(payload);
  let sent = 0;
  // Small batches — push services are fast, but a league-wide results push
  // should not open hundreds of sockets at once.
  for (let i = 0; i < subs.length; i += 20) {
    const results = await Promise.all(
      subs.slice(i, i + 20).map((s) => sendOne(s, body))
    );
    sent += results.filter(Boolean).length;
  }
  return sent;
}

/** Test push to all devices of one user, regardless of topics. */
export async function pushTestToUser(userId: string): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  const body = JSON.stringify({
    title: "CLS notifications work",
    body: "You will get race, RSVP and results updates on this device.",
    url: "/profile#notifications",
    tag: "cls-test",
  } satisfies PushPayload);
  const results = await Promise.all(subs.map((s) => sendOne(s, body)));
  return results.filter(Boolean).length;
}
