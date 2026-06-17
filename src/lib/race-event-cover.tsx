import { ImageResponse } from "next/og";

/**
 * Compose a Discord scheduled-event cover image (800×320) with the league logo
 * centred and padded on a dark background.
 *
 * Discord crops event covers to this wide banner ratio, so sending the raw
 * (usually square) logo makes Discord scale it up to fill the banner — it looks
 * zoomed/oversized. Pre-padding the logo into the correct ratio keeps it a
 * sensible size with margins around it.
 *
 * Uses `next/og` (bundled with Next, no extra dependency). The element has no
 * text, so no font is required. Returns a PNG data URI, or undefined on any
 * failure so the caller can fall back to the raw logo (or no image).
 */
export async function buildEventCoverDataUri(
  logoAbsUrl: string,
  background = "#0a0a0f"
): Promise<string | undefined> {
  try {
    const resp = new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            background,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoAbsUrl}
            style={{ width: "400px", height: "200px", objectFit: "contain" }}
          />
        </div>
      ),
      { width: 800, height: 320 }
    );
    const buf = Buffer.from(await resp.arrayBuffer());
    return buf.length > 0
      ? `data:image/png;base64,${buf.toString("base64")}`
      : undefined;
  } catch {
    return undefined;
  }
}
