"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PUSH_TOPICS,
  isPushTopic,
  pushTestToUser,
  type PushTopic,
} from "@/lib/push";

/**
 * Called from the client (PushSettings) with the browser's PushSubscription,
 * not used as a <form action>, so these may return values.
 */

type SubscriptionJSON = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

async function userId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

function cleanTopics(topics: string[] | undefined): PushTopic[] {
  if (!topics) return DEFAULT_PUSH_TOPICS;
  return [...new Set(topics.filter(isPushTopic))];
}

export async function savePushSubscription(
  sub: SubscriptionJSON,
  topics: string[] | undefined,
  userAgent: string
): Promise<{ ok: boolean; error?: string }> {
  const uid = await userId();
  if (!uid) return { ok: false, error: "Please sign in first." };
  const endpoint = sub.endpoint ?? "";
  const p256dh = sub.keys?.p256dh ?? "";
  const authKey = sub.keys?.auth ?? "";
  if (!/^https:\/\//.test(endpoint) || !p256dh || !authKey) {
    return { ok: false, error: "The browser returned an invalid subscription." };
  }
  // Upsert by endpoint: re-subscribing the same device (or a different user
  // signing in on it) moves the device instead of duplicating it.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: uid,
      endpoint,
      p256dh,
      auth: authKey,
      topics: cleanTopics(topics),
      userAgent: userAgent.slice(0, 300),
    },
    update: {
      userId: uid,
      p256dh,
      auth: authKey,
      topics: cleanTopics(topics),
      userAgent: userAgent.slice(0, 300),
      failCount: 0,
    },
  });
  return { ok: true };
}

export async function updatePushTopics(
  endpoint: string,
  topics: string[]
): Promise<{ ok: boolean }> {
  const uid = await userId();
  if (!uid) return { ok: false };
  const res = await prisma.pushSubscription.updateMany({
    where: { endpoint, userId: uid },
    data: { topics: cleanTopics(topics) },
  });
  return { ok: res.count > 0 };
}

export async function deletePushSubscription(
  endpoint: string
): Promise<{ ok: boolean }> {
  const uid = await userId();
  if (!uid) return { ok: false };
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: uid } });
  return { ok: true };
}

/** Topics stored for this device, or null when the server doesn't know it. */
export async function getPushTopics(
  endpoint: string
): Promise<string[] | null> {
  const uid = await userId();
  if (!uid) return null;
  const row = await prisma.pushSubscription.findFirst({
    where: { endpoint, userId: uid },
    select: { topics: true },
  });
  return row?.topics ?? null;
}

export async function sendTestPush(): Promise<{ sent: number }> {
  const uid = await userId();
  if (!uid) return { sent: 0 };
  return { sent: await pushTestToUser(uid) };
}
