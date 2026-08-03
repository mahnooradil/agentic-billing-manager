/**
 * The single, shared formatting layer (Phase F7).
 *
 * Every money/date/time value rendered anywhere in the app goes through these
 * pure functions so formatting is consistent and driven by the user's General
 * preferences (currency, date format, timezone). There is no other formatting
 * logic in the codebase — components import from here, never re-implement it.
 *
 * Locale note: UI-language localization is intentionally not implemented, so
 * there is no user "language" setting. Dates use a locale derived from the
 * chosen date format (deterministic); money/long dates use the environment
 * locale for digit grouping and month names. The explicit controls the user
 * DOES have — currency, date format, timezone — do the meaningful work.
 */
import type { GeneralSettings } from "@/services/types/settings";

/** Formats an amount in a currency, honoring the user's default currency when
 *  the datum has none. The datum's own currency (e.g. an invoice's) always wins
 *  so multi-currency data stays correct. */
export function formatMoney(
  amount: number,
  currency: string | undefined,
  general: Pick<GeneralSettings, "currency">
): string {
  const code = currency || general.currency;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      // Plain "$"/"€" instead of the disambiguated "US$"/"CA$" form Intl falls
      // back to outside an explicit en-US-style locale.
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

/**
 * Locale-aware plain number with two decimals and NO currency symbol. Used for
 * cross-currency totals (e.g. billing "Total Revenue") where a single currency
 * symbol would misrepresent a sum of mixed currencies.
 */
export function formatNumber(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Safe Intl.DateTimeFormat that retries without the timezone if it's invalid. */
function safeDateFormat(
  iso: string,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
  timeZone: string
): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
  } catch {
    try {
      return new Intl.DateTimeFormat(locale, options).format(date);
    } catch {
      return null;
    }
  }
}

/**
 * Formats an ISO date per the user's chosen format + timezone:
 *   ISO  -> 2026-07-22
 *   US   -> 07/22/2026
 *   EU   -> 22/07/2026
 *   LONG -> Jul 22, 2026
 */
export function formatDate(iso: string, general: GeneralSettings): string {
  const { dateFormat, timezone } = general;

  const result = (() => {
    switch (dateFormat) {
      case "US":
        return safeDateFormat(
          iso,
          "en-US",
          { year: "numeric", month: "2-digit", day: "2-digit" },
          timezone
        );
      case "EU":
        return safeDateFormat(
          iso,
          "en-GB",
          { year: "numeric", month: "2-digit", day: "2-digit" },
          timezone
        );
      case "LONG":
        return safeDateFormat(
          iso,
          undefined,
          { year: "numeric", month: "short", day: "numeric" },
          timezone
        );
      case "ISO":
      default:
        // en-CA yields YYYY-MM-DD, honoring the chosen timezone.
        return safeDateFormat(
          iso,
          "en-CA",
          { year: "numeric", month: "2-digit", day: "2-digit" },
          timezone
        );
    }
  })();

  return result ?? iso;
}

/** Localized date + time (for tooltips), honoring the user's timezone. */
export function formatDateTime(iso: string, general: GeneralSettings): string {
  return (
    safeDateFormat(
      iso,
      undefined,
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
      general.timezone
    ) ?? iso
  );
}

/**
 * Formats a "YYYY-MM" month key (or an ISO date) as a short "Mon YYYY" label.
 * Month labels are calendar buckets, so they are not timezone-shifted.
 */
export function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    }).format(new Date(year, m - 1, 1));
  } catch {
    return month;
  }
}

/**
 * Short relative time: "Just now", "2 min ago", "1 hour ago", "Yesterday",
 * "3 days ago", then falls back to an absolute date in the user's format.
 */
export function formatRelativeTime(iso: string, general: GeneralSettings): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 45) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return formatDate(iso, general);
}
