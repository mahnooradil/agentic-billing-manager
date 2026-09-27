/**
 * PremiumBackground — the app-wide ambient background.
 *
 * Simplified for the black/white/accent redesign: the previous version
 * animated a breathing mesh and three drifting aurora blobs tinted with the
 * brand color — decorative motion that worked against "minimal, avoid
 * unnecessary decorations." What's left is just texture, not color or
 * motion: a whisper of grain so flat surfaces don't look sterile, and a
 * top sheen for a touch of depth. Both are neutral (no `--brand-*`
 * reference), static, and aria-hidden.
 */
export function PremiumBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Fine grain — texture so surfaces never read as flat. */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay dark:opacity-[0.06]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: "160px 160px",
        }}
      />

      {/* Top sheen — subtle light from above for dimensionality. */}
      <div
        className="absolute inset-x-0 top-0 h-72"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in oklch, var(--foreground) 4%, transparent), transparent)",
        }}
      />
    </div>
  );
}
