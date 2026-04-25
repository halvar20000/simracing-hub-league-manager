"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { slugify } from "@/lib/slug";

export async function createLeague(formData: FormData) {
  const admin = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) {
    redirect("/admin/leagues/new?error=Name+is+required");
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.league.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  await prisma.league.create({
    data: { name, slug, description, createdById: admin.id },
  });

  revalidatePath("/admin/leagues");
  revalidatePath("/leagues");
  redirect(`/admin/leagues/${slug}`);
}

export async function updateLeague(id: string, formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) {
    redirect(`/admin/leagues/${id}/edit?error=Name+is+required`);
  }

  const updated = await prisma.league.update({
    where: { id },
    data: { name, description },
  });

  revalidatePath("/admin/leagues");
  revalidatePath("/leagues");
  redirect(`/admin/leagues/${updated.slug}`);
}

export async function deleteLeague(id: string) {
  await requireAdmin();
  await prisma.league.delete({ where: { id } });
  revalidatePath("/admin/leagues");
  revalidatePath("/leagues");
  redirect("/admin/leagues");
}
