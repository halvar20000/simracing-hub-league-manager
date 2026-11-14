"use client";

import { useEffect, useState } from "react";

/**
 * Discord refuses to show its login inside a frame, and the CLS session
 * cookie (SameSite=Lax) is not sent to a page framed by another site (the CAS
 * homepage embeds CLS) — so inside a frame nobody can sign in. When framed,
 * replace the sign-in form with a link that opens `path` in a new tab, where
 * the login works; otherwise render the normal form unchanged.
 */
export default function FrameAwareSignIn({
  children,
  path,
  label,
  className,
}: {
  children: React.ReactNode;
  /** Page to open in the new tab; default = the current page. */
  path?: string;
  label: string;
  className?: string;
}) {
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      setFramed(true); // cross-origin parent: access throws -> framed
    }
  }, []);
  if (!framed) return <>{children}</>;
  const href = new URL(path ?? window.location.pathname + window.location.search, window.location.origin).toString();
  return (
    <a href={href} target="_blank" rel="noopener" className={className}>
      {label} ↗
    </a>
  );
}
