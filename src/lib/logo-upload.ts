/**
 * Shared logo-upload helper for League and Team logos.
 *
 * NOTE: this is a plain util — do NOT add "use server". It is imported by
 * "use server" action files (leagues.ts, teams.ts); keeping it non-server
 * avoids the "API route silently dropped" gotcha and lets it be reused freely.
 *
 * Validates an uploaded image (if any), uploads it to Vercel Blob and returns
 * the public URL. Returns:
 *   - { url: string }    when a file was uploaded successfully
 *   - { url: null }      when no file was provided (caller keeps existing logo)
 *   - { error: string }  when validation / upload failed (caller redirects)
 */
import { put } from "@vercel/blob";

const LOGO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — logos are small.
const LOGO_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
];
/**
 * @param pathPrefix blob key prefix WITHOUT extension, e.g.
 *   "league-logos/cas-iec" or "team-logos/<teamId>". The final key is
 *   `<pathPrefix>.<timestamp>.<ext>` so old logos can be cleaned up / listed.
 * @param fieldName the FormData field carrying the file (default "logoFile").
 */
export async function uploadLogoIfProvided(
  formData: FormData,
  pathPrefix: string,
  fieldName = "logoFile"
): Promise<{ url: string | null; error?: string }> {
  const file = formData.get(fieldName);
  if (!(file instanceof File) || file.size === 0) {
    return { url: null };
  }
  if (!LOGO_ACCEPT.includes(file.type)) {
    return { url: null, error: "Logo must be PNG / JPG / WebP / SVG / GIF" };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return {
      url: null,
      error: `Logo is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 5 MB. Compress or use SVG.`,
    };
  }
  const ext =
    file.type === "image/svg+xml"
      ? "svg"
      : file.name.split(".").pop()?.toLowerCase() || "png";
  const filename = `${pathPrefix}.${Date.now()}.${ext}`;
  try {
    const blob = await put(filename, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });
    return { url: blob.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown blob upload error";
    const hint = /BLOB_READ_WRITE_TOKEN|No token|Forbidden|401/i.test(msg)
      ? "Vercel Blob store not configured. Create one in Vercel → Storage; BLOB_READ_WRITE_TOKEN is auto-injected."
      : msg;
    return { url: null, error: hint };
  }
}

/**
 * True when a stored logoUrl points at our own Vercel Blob store, i.e. we own
 * it and may safely del() it when replacing. External / pasted URLs return
 * false so we never try to delete something that isn't ours.
 */
export function isOwnedBlobUrl(url: string | null | undefined): boolean {
  return !!url && /\.blob\.vercel-storage\.com\//i.test(url);
}
