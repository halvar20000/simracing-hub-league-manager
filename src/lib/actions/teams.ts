"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { uploadLogoIfProvided, isOwnedBlobUrl } from "@/lib/logo-upload";
import { slugify } from "@/lib/slug";

export async function createTeam(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const shortName = String(formData.get("shortName") ?? "").trim() || null;
  const logoUrlText = String(formData.get("logoUrl") ?? "").trim() || null;

  if (!name) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams/new?error=Name+is+required`
    );
  }

  const existing = await prisma.team.findUnique({
    where: { seasonId_name: { seasonId, name } },
  });
  if (existing) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams/new?error=A+team+with+that+name+already+exists`
    );
  }

  // An uploaded file wins over a pasted URL; fall back to the URL text field.
  const upload = await uploadLogoIfProvided(
    formData,
    `team-logos/${seasonId}-${slugify(name)}`
  );
  if (upload.error) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams/new?error=${encodeURIComponent(
        upload.error
      )}`
    );
  }
  const logoUrl = upload.url ?? logoUrlText;

  await prisma.team.create({
    data: { seasonId, name, shortName, logoUrl },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
}

export async function updateTeam(
  leagueSlug: string,
  seasonId: string,
  teamId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const shortName = String(formData.get("shortName") ?? "").trim() || null;
  const logoUrlText = String(formData.get("logoUrl") ?? "").trim() || null;
  const removeLogo = formData.get("removeLogo") === "1";

  const editPath = `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams/${teamId}/edit`;

  if (!name) {
    redirect(`${editPath}?error=Name+is+required`);
  }

  const existing = await prisma.team.findUnique({
    where: { id: teamId },
    select: { logoUrl: true },
  });

  const upload = await uploadLogoIfProvided(formData, `team-logos/${teamId}`);
  if (upload.error) {
    redirect(`${editPath}?error=${encodeURIComponent(upload.error)}`);
  }

  // Resolve the final logo: a newly uploaded file wins; then an explicit
  // remove; otherwise whatever is in the URL text field (which is pre-filled
  // with the current value, so leaving it alone keeps the logo).
  let logoUrl: string | null;
  if (upload.url) {
    logoUrl = upload.url;
    // Best-effort cleanup of the previous blob (only if it was ours).
    if (isOwnedBlobUrl(existing?.logoUrl) && existing?.logoUrl !== upload.url) {
      try {
        await del(existing!.logoUrl!);
      } catch {
        /* best-effort */
      }
    }
  } else if (removeLogo) {
    logoUrl = null;
    if (isOwnedBlobUrl(existing?.logoUrl)) {
      try {
        await del(existing!.logoUrl!);
      } catch {
        /* best-effort */
      }
    }
  } else {
    logoUrl = logoUrlText;
  }

  await prisma.team.update({
    where: { id: teamId },
    data: { name, shortName, logoUrl },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
  revalidatePath(`/teams`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
}

export async function deleteTeam(
  leagueSlug: string,
  seasonId: string,
  teamId: string
) {
  await requireAdmin();

  // First detach registrations from this team
  await prisma.registration.updateMany({
    where: { teamId },
    data: { teamId: null },
  });

  await prisma.team.delete({ where: { id: teamId } });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
}
