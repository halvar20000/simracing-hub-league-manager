"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { sendResendEmail } from "@/lib/resend-email";

const CATEGORIES = [
  "Bug / something is not working",
  "Change request / idea",
  "Question",
  "Other",
] as const;

/**
 * Message to the site developer (software issues, change requests). Signed-in
 * users only — the sender's identity is taken from the session, never from
 * the form. Delivered via Resend to DEVELOPER_CONTACT_EMAIL.
 */
export async function sendDeveloperMessage(formData: FormData) {
  const sessionUser = await requireAuth();

  const category = String(formData.get("category") ?? "").trim();
  const pageUrl = String(formData.get("pageUrl") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const fail = (msg: string): never =>
    redirect(`/contact?error=${encodeURIComponent(msg)}`);

  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    fail("Please pick a category");
  }
  if (!message) fail("Message is required");
  if (message.length > 4000) {
    fail("Message is too long (max 4000 characters)");
  }
  if (pageUrl.length > 300) fail("Page reference is too long");

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      iracingMemberId: true,
      discordId: true,
    },
  });
  const senderName =
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "Unknown";

  const to =
    process.env.DEVELOPER_CONTACT_EMAIL ?? "thomas.herbrig@gmail.com";

  const escape = (v: string | number | null | undefined) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const subject = `🛠️ CLS contact — ${category} — ${senderName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #18181b;">
      <h2 style="margin: 0 0 8px 0; color: #ff6b35;">🛠️ Message to the developer</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #71717a; width: 110px;">From</td><td>${escape(senderName)}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Email</td><td>${escape(user?.email ?? "—")}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">iRacing ID</td><td>${escape(user?.iracingMemberId ?? "—")}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Category</td><td>${escape(category)}</td></tr>
        ${pageUrl ? `<tr><td style="padding: 6px 0; color: #71717a;">Page</td><td>${escape(pageUrl)}</td></tr>` : ""}
      </table>
      <div style="margin-top: 16px; padding: 12px; background: #f4f4f5; border-radius: 6px; white-space: pre-wrap; font-size: 14px;">${escape(message)}</div>
      <p style="margin-top: 24px; color: #a1a1aa; font-size: 12px;">CLS — CAS League Scoring · /contact form</p>
    </div>
  `;

  const text = [
    "Message to the developer",
    "",
    `From: ${senderName}`,
    `Email: ${user?.email ?? "—"}`,
    `iRacing ID: ${user?.iracingMemberId ?? "—"}`,
    `Category: ${category}`,
    pageUrl ? `Page: ${pageUrl}` : null,
    "",
    message,
  ]
    .filter((x): x is string => x !== null)
    .join("\n");

  const result = await sendResendEmail({ to, subject, html, text });
  if (!result.ok) {
    fail(
      "Sorry, the message could not be sent right now. Please try again later."
    );
  }

  redirect("/contact?success=1");
}
