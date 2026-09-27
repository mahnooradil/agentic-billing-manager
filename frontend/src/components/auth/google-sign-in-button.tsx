"use client";

import * as React from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;
/** Loads Google Identity Services' script once, shared across every mount. */
function loadGoogleScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google sign-in."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Google's own multi-color "G" glyph — same one every "Continue with
 *  Google" button in the wild uses. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09a7.14 7.14 0 0 1 0-4.18V7.07H2.18a11.9 11.9 0 0 0 0 9.86z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 3.02c.87-2.6 3.3-4.71 6.16-4.71z"
      />
    </svg>
  );
}

/** Google allows a `renderButton` width between 200 and 400px. */
function clampWidth(width: number): number {
  return Math.round(Math.min(400, Math.max(200, width)));
}

interface GoogleSignInButtonProps {
  /** Called with the raw ID-token JWT once the user completes Google's flow. */
  onCredential: (credential: string) => void;
}

/**
 * "Continue with Google" — visually matches this app's own outline button
 * (border/rounded/hover styling), not Google's default widget. Under the
 * hood, Google's REAL button is still rendered — just made invisible and
 * stretched to exactly cover the decorative one — so the user's click lands
 * on Google's own button for a genuine, trusted user gesture. A JS-simulated
 * `.click()` can't reach across the iframe boundary Google's button renders
 * in, so this overlay is the only way to both keep Google's real flow AND
 * control the button's appearance.
 *
 * Hidden entirely when no client id is configured, matching this app's
 * "unset = not configured, never faked" convention for every other
 * optional integration.
 */
export function GoogleSignInButton({ onCredential }: GoogleSignInButtonProps) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const realButtonRef = React.useRef<HTMLDivElement>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Read via a ref so re-rendering the real button never has to happen just
  // because the caller passed a fresh inline callback on every render.
  // Updated in its own effect (never during render — refs aren't render-safe
  // to write to there).
  const onCredentialRef = React.useRef(onCredential);
  React.useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  React.useEffect(() => {
    if (!clientId || !realButtonRef.current || !wrapperRef.current) return;
    let cancelled = false;
    let initialized = false;

    const renderAt = (width: number) => {
      if (cancelled || !realButtonRef.current || !window.google) return;
      // Re-rendering in place rather than appending — clear first.
      realButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(realButtonRef.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        width: clampWidth(width),
      });
    };

    void loadGoogleScript().then(() => {
      if (cancelled || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onCredentialRef.current(response.credential),
      });
      initialized = true;
      renderAt(wrapperRef.current?.getBoundingClientRect().width ?? 336);
    });

    // Keeps the invisible real button's width matching the decorative one
    // exactly, even if the card's width ever changes (e.g. a resize).
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && initialized) renderAt(width);
    });
    observer.observe(wrapperRef.current);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div ref={wrapperRef} className="group relative h-11 w-full">
      {/* Decorative — matches this app's own outline button exactly. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-lg border border-input bg-background text-sm font-medium text-foreground transition-colors group-hover:bg-accent"
      >
        <GoogleGlyph />
        Continue with Google
      </div>
      {/* Google's real button — invisible, sized to exactly cover the
          decorative one above, so every click is genuinely on Google's own
          button. */}
      <div ref={realButtonRef} className="absolute inset-0 overflow-hidden opacity-0" />
    </div>
  );
}
