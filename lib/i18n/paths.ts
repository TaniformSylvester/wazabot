import { isLocale, type Locale } from "./config";

/** "/fr/pricing" → { locale: "fr", path: "/pricing" }; "/pricing" → { locale: null, path: "/pricing" }. */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const [, first, ...rest] = pathname.split("/");
  if (isLocale(first)) return { locale: first, path: `/${rest.join("/")}` };
  return { locale: null, path: pathname || "/" };
}

/** Prefixes an app path with the locale: ("fr", "/pricing") → "/fr/pricing"; ("fr", "/") → "/fr". Keeps ?query and #hash. */
export function localizePath(locale: Locale, path: string): string {
  if (!path.startsWith("/")) return path; // external or relative links are left alone
  const { path: bare } = splitLocale(path);
  if (bare === "/" || bare === "") return `/${locale}`;
  if (bare.startsWith("/#") || bare.startsWith("/?")) return `/${locale}${bare.slice(1)}`;
  return `/${locale}${bare}`;
}

/** The same page in another locale: ("/fr/pricing", "en") → "/en/pricing". */
export function switchLocalePath(pathname: string, target: Locale): string {
  return localizePath(target, splitLocale(pathname).path);
}
