/**
 * PremiumBackground — the app-wide ambient background system.
 *
 * A fixed, GPU-accelerated stack that sits behind all content: a slowly
 * breathing mesh gradient, three drifting aurora blobs, a whisper of grain for
 * texture, and a top sheen for depth. Everything animates transform/opacity
 * only (compositor-friendly, ~60fps) and freezes under prefers-reduced-motion
 * via the global rule in globals.css. Purely decorative — aria-hidden, no JS.
 */
export function PremiumBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Breathing mesh — two large, soft radial fields. */}
      <div
        className="animate-breathe absolute inset-0"
        style={{
          background:
            "radial-gradient(60rem 60rem at 80% -12%, color-mix(in oklch, var(--brand-1) 20%, transparent), transparent 60%)," +
            "radial-gradient(48rem 48rem at 6% 2%, color-mix(in oklch, var(--brand-3) 14%, transparent), transparent 58%)",
        }}
      />

      {/* Drifting aurora blobs. */}
      <div
        className="animate-drift absolute -top-32 -right-24 size-[38rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--brand-2) 28%, transparent), transparent 65%)",
        }}
      />
      <div
        className="animate-drift-slow absolute top-1/3 -left-40 size-[42rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--brand-1) 24%, transparent), transparent 65%)",
        }}
      />
      <div
        className="animate-aurora absolute right-1/4 -bottom-40 size-[34rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--brand-3) 22%, transparent), transparent 65%)",
        }}
      />

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
