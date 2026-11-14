/** The businesses whose sample-data banner this browser has dismissed (ids, dot-separated). */
export const SAMPLE_BANNER_COOKIE = "wb_sample_hidden";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hiddenSampleBanners(value: string | undefined): string[] {
  return (value ?? "").split(".").filter((id) => UUID.test(id));
}
