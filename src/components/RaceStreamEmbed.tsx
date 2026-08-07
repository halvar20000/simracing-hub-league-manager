"use client";

import { useState } from "react";

/**
 * Consent-gated race replay player.
 *
 * A YouTube or Twitch iframe contacts Google / Amazon servers the moment the
 * page renders — before the visitor has asked to watch anything. That is a
 * third-party transfer with no legal basis, so nothing is embedded until the
 * visitor clicks. Only then is the iframe mounted.
 *
 * YouTube is loaded from youtube-nocookie.com, which skips the ad-personalisation
 * cookies but still logs the request; the click is what makes it lawful, not the
 * domain. The choice is deliberately NOT remembered: no cookie, no storage, and
 * the gate returns on the next round page.
 *
 * See /datenschutz section 10.
 */
export function RaceStreamEmbed({
  youtubeVideoId,
  twitchVideoId,
  twitchParent,
}: {
  youtubeVideoId: string | null;
  twitchVideoId: string | null;
  twitchParent: string;
}) {
  const [loaded, setLoaded] = useState(false);

  const isYoutube = Boolean(youtubeVideoId);
  const provider = isYoutube ? "YouTube" : "Twitch";
  const operator = isYoutube ? "Google" : "Twitch (Amazon)";
  const externalUrl = isYoutube
    ? `https://www.youtube.com/watch?v=${youtubeVideoId}`
    : `https://www.twitch.tv/videos/${twitchVideoId}`;

  if (!youtubeVideoId && !twitchVideoId) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-zinc-800 bg-black pt-[56.25%]">
      {loaded ? (
        isYoutube ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?autoplay=1`}
            title="Race stream replay"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://player.twitch.tv/?video=${twitchVideoId}&parent=${twitchParent}&autoplay=true`}
            title="Race stream replay (Twitch)"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        )
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-zinc-900 to-black px-6 text-center">
          <button
            type="button"
            onClick={() => setLoaded(true)}
            aria-label={`Load the ${provider} player and start the replay`}
            className="group flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#ff6b35] text-[#ff6b35] transition hover:bg-[#ff6b35] hover:text-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="ml-1 h-7 w-7"
              aria-hidden
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setLoaded(true)}
            className="text-sm font-semibold text-zinc-100 hover:text-[#ff6b35]"
          >
            Load the {provider} player
          </button>
          <p className="max-w-md text-xs leading-relaxed text-zinc-500">
            Nothing is loaded from {provider} until you click. Starting the
            player connects your browser to {operator}, which then receives your
            IP address and may set its own cookies.{" "}
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-300"
            >
              Open on {provider} instead ↗
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
