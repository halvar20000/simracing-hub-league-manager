/**
 * Discord DMs for the iRacing league invitation.
 *
 * Invite flips to Sent -> the driver is told to accept it in iRacing. Accepted
 * still not set 48 h later -> one reminder, sent by the sweep in /api/cron/push.
 *
 * State lives in `AppSetting` (`iracing-invite:<registrationId>`), so no schema
 * change. A row exists only for an invite marked Sent after this shipped: older
 * "Sent" drivers have none and can never get a surprise reminder.
 *
 * Accepted is set by hand in the roster; CLS cannot see iRacing. The reminder
 * text therefore allows for a driver who already accepted.
 *
 * Not a "use server" module.
 */
import { sendDirectMessage } from "@/lib/discord-bot";
import { prisma } from "@/lib/prisma";
import { discordIdForUser } from "@/lib/waitlist";

export const INVITE_REMINDER_AFTER_MS = 48 * 60 * 60 * 1000;

const KEY_PREFIX = "iracing-invite:";
/** Each DM is a couple of Discord calls and the cron route has 60 s. */
const MAX_REMINDERS_PER_RUN = 25;

export type InviteNoticeState = {
  sentAt: string;
  /** null while the DM is on its way. */
  noticeError: string | null;
  reminderAt: string | null;
  reminderError: string | null;
};

const keyOf = (registrationId: string) => `${KEY_PREFIX}${registrationId}`;

export function parseInviteNotice(value: string): InviteNoticeState | null {
  try {
    const s = JSON.parse(value) as Partial<InviteNoticeState>;
    if (typeof s.sentAt !== "string") return null;
    return {
      sentAt: s.sentAt,
      noticeError: s.noticeError ?? null,
      reminderAt: s.reminderAt ?? null,
      reminderError: s.reminderError ?? null,
    };
  } catch {
    return null;
  }
}

export function isInviteReminderDue(s: InviteNoticeState, now: Date): boolean {
  return (
    s.reminderAt == null &&
    now.getTime() - new Date(s.sentAt).getTime() >= INVITE_REMINDER_AFTER_MS
  );
}

type NoticeRegistration = {
  status: string;
  isTeamManager: boolean;
  retiredAt: Date | null;
  iracingInvitationSent: string;
  iracingInvitationAccepted: string;
  season: { status: string; isArchived: boolean };
};

/** Should this driver be messaged about the invitation at all right now? */
export function canNotifyInvite(r: NoticeRegistration): boolean {
  return (
    r.iracingInvitationSent === "YES" &&
    r.iracingInvitationAccepted !== "YES" &&
    !r.isTeamManager &&
    r.retiredAt == null &&
    (r.status === "PENDING" || r.status === "APPROVED") &&
    !r.season.isArchived &&
    (r.season.status === "OPEN_REGISTRATION" || r.season.status === "ACTIVE")
  );
}

export function inviteNoticeText(leagueName: string, seasonName: string): string {
  return (
    `**${leagueName}, ${seasonName}**\n` +
    "Your iRacing league invitation has been sent. " +
    "Please open iRacing and accept the invitation so you can join the league sessions."
  );
}

export function inviteReminderText(leagueName: string, seasonName: string): string {
  return (
    `**${leagueName}, ${seasonName}**\n` +
    "Reminder: your iRacing league invitation is not marked as accepted yet. " +
    "Please open iRacing and accept it. " +
    "If you already did, you can ignore this message."
  );
}

/** Never throws. Returns the reason on failure, null when delivered. */
async function dmDriver(userId: string, content: string): Promise<string | null> {
  try {
    const discordId = await discordIdForUser(userId);
    if (!discordId) return "No Discord account linked";
    const res = await sendDirectMessage(discordId, {
      content,
      allowed_mentions: { parse: [] },
    });
    return res.ok ? null : "Discord refused the DM (DMs closed or not on the server?)";
  } catch {
    return "Discord could not be reached";
  }
}

const select = {
  userId: true,
  status: true,
  isTeamManager: true,
  retiredAt: true,
  iracingInvitationSent: true,
  iracingInvitationAccepted: true,
  season: {
    select: {
      name: true,
      status: true,
      isArchived: true,
      league: { select: { name: true } },
    },
  },
} as const;

/** Call only when Invite really changed to Sent (the action checks atomically). */
export async function notifyInvitationSent(registrationId: string): Promise<void> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select,
  });
  if (!reg || !canNotifyInvite(reg)) return;

  const state: InviteNoticeState = {
    sentAt: new Date().toISOString(),
    noticeError: null,
    reminderAt: null,
    reminderError: null,
  };
  state.noticeError = await dmDriver(
    reg.userId,
    inviteNoticeText(reg.season.league.name, reg.season.name)
  );
  const key = keyOf(registrationId);
  const value = JSON.stringify(state);
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** Invite is no longer Sent: forget it, so a later Sent starts over. */
export async function clearInvitationNotice(registrationId: string): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: keyOf(registrationId) } });
}

/** Roster display: registrationId -> state. */
export async function loadInviteNotices(
  registrationIds: string[]
): Promise<Map<string, InviteNoticeState>> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: registrationIds.map(keyOf) } },
  });
  const out = new Map<string, InviteNoticeState>();
  for (const row of rows) {
    const state = parseInviteNotice(row.value);
    if (state) out.set(row.key.slice(KEY_PREFIX.length), state);
  }
  return out;
}

/** Sweep: one reminder per invitation still open after 48 h. Idempotent. */
export async function sendInvitationReminders(now: Date = new Date()): Promise<number> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: KEY_PREFIX } },
  });
  let sent = 0;
  for (const row of rows) {
    if (sent >= MAX_REMINDERS_PER_RUN) break;
    const state = parseInviteNotice(row.value);
    if (!state || !isInviteReminderDue(state, now)) continue;

    const registrationId = row.key.slice(KEY_PREFIX.length);
    const reg = await prisma.registration.findUnique({
      where: { id: registrationId },
      select,
    });
    if (!reg) {
      await prisma.appSetting.deleteMany({ where: { key: row.key } });
      continue;
    }
    // Accepted, retired, paused ...: not now, but it is looked at again.
    if (!canNotifyInvite(reg)) continue;

    // Compare-and-set on the old value, so the host crontab and the GitHub
    // backup running at once cannot both send it.
    const claimed = { ...state, reminderAt: now.toISOString() };
    const claim = await prisma.appSetting.updateMany({
      where: { key: row.key, value: row.value },
      data: { value: JSON.stringify(claimed) },
    });
    if (claim.count === 0) continue;

    const error = await dmDriver(
      reg.userId,
      inviteReminderText(reg.season.league.name, reg.season.name)
    );
    if (error) {
      await prisma.appSetting.update({
        where: { key: row.key },
        data: { value: JSON.stringify({ ...claimed, reminderError: error }) },
      });
    } else {
      sent++;
    }
  }
  return sent;
}
