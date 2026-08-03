import type { PlatformSpend } from "@/services/types/analytics";

function formatAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.map((p) => p[0]).join("");
  return (letters || name.trim()).slice(0, 2).toUpperCase() || "?";
}

interface PlatformSpendChartProps {
  data: PlatformSpend[];
  currency: string;
}

/**
 * Spend by platform — an elegant ranked list rather than a bar-chart widget:
 * avatar, name, amount, a slim proportion bar, and a share percentage. Uses
 * only the theme's existing primary/muted tokens — no new palette.
 */
export function PlatformSpendChart({ data, currency }: PlatformSpendChartProps) {
  const total = data.reduce((sum, row) => sum + row.total, 0);

  return (
    <div className="flex flex-col gap-4">
      {data.map((row) => {
        const share = total > 0 ? Math.round((row.total / total) * 100) : 0;
        return (
          <div
            key={row.platformId}
            className="group hover-lift relative flex items-center gap-3 rounded-lg bg-card p-2"
          >
            {/* Hover tooltip — same look as the chart tooltip above. */}
            <div className="pointer-events-none absolute bottom-full left-2 z-10 mb-2 rounded-lg border bg-popover px-3 py-2 text-xs whitespace-nowrap opacity-0 shadow-e1 transition-opacity group-hover:opacity-100">
              <p className="font-medium text-foreground">{row.name}</p>
              <p className="text-muted-foreground">
                {row.total.toLocaleString()} {currency} · {row.count} invoice
                {row.count === 1 ? "" : "s"}
              </p>
            </div>

            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {initialsOf(row.name)}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium text-foreground">
                  {row.name}
                </p>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {formatAmount(row.total)} {currency}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${share}%` }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {share}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
