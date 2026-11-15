/*
 * The owner's trial banner can be hidden for a day ("Hide"); it comes back
 * the next day, and can't be hidden in the trial's last days. Kept per
 * business in one cookie: "<business id>~<hidden until, ms>" entries, dot-separated.
 */
export const TRIAL_BANNER_COOKIE = "wb_trial_hidden";
/** In the trial's last days the banner always shows (with how to pay). */
export const TRIAL_BANNER_ALWAYS_DAYS = 3;
export const TRIAL_BANNER_HIDE_MS = 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function entries(value: string | undefined, now: number): [string, number][] {
  return (value ?? "")
    .split(".")
    .map((e) => e.split("~"))
    .filter(([id, until]) => UUID.test(id ?? "") && Number(until) > now)
    .map(([id, until]) => [id, Number(until)]);
}

/** Can the banner be hidden with this many days left? */
export const trialBannerDismissible = (daysLeft: number) => daysLeft > TRIAL_BANNER_ALWAYS_DAYS;

/** Is the banner hidden for this business right now (and still allowed to be)? */
export function trialBannerHidden(value: string | undefined, businessId: string, daysLeft: number, now = Date.now()): boolean {
  return trialBannerDismissible(daysLeft) && entries(value, now).some(([id]) => id === businessId);
}

/** The cookie value after hiding the banner for this business for a day. */
export function hideTrialBanner(value: string | undefined, businessId: string, now = Date.now()): string {
  const rest = entries(value, now).filter(([id]) => id !== businessId);
  return [[businessId, now + TRIAL_BANNER_HIDE_MS] as [string, number], ...rest]
    .slice(0, 20)
    .map(([id, until]) => `${id}~${until}`)
    .join(".");
}
