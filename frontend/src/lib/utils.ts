/**
 * Shared low-level utilities and third-party client setup.
 *
 * `cn` merges Tailwind classes safely and is the standard helper used by
 * shadcn/ui components.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
