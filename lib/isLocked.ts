/**
 * Returns true when the app is running in "locked" (shared/member) mode.
 * In locked mode, the server's PROVIDER_API_KEY is always used and
 * API key settings are hidden from the UI.
 *
 * Set NEXT_PUBLIC_LOCKED=true in .env.local to enable.
 */
export const IS_LOCKED =
  typeof process !== "undefined" &&
  process.env?.NEXT_PUBLIC_LOCKED === "true";
