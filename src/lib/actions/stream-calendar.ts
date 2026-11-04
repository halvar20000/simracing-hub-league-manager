"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { STREAM_VALUES, isStreamKey } from "@/lib/stream-calendar";

export async function setStreamerAction(
  key: string,
  streamer: string
): Promise<void> {
  await requireAdmin();
  if (!isStreamKey(key) || !STREAM_VALUES.includes(streamer)) {
    throw new Error("Invalid stream assignment");
  }
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: streamer },
    update: { value: streamer },
  });
  revalidatePath("/admin/stream-calendar");
}
