import Link from "next/link";
import { redirect } from "next/navigation";

import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { getCountryPack } from "@/lib/i18n/country-packs";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { SIGNUP_COUNTRIES, type SignupCountry } from "@/lib/validation/auth-rules";
import { WAITLIST_MODE, waitlistVertical } from "@/lib/waitlist/mode";

export const generateMetadata = () => pageMetadata("waitlist", "/waitlist");

/**
 * The early-access beta form, while sign-up is closed (NEXT_PUBLIC_WAITLIST_MODE).
 * ?vertical= (shop, restaurant, school) comes pre-selected. With the
 * waitlist off, it's the normal sign-up again (the vertical comes along).
 */
export default async function WaitlistPage({ searchParams }: PageProps<"/[lang]/waitlist">) {
  const [locale, t, sp] = await Promise.all([getLocale(), getMessages(), searchParams]);
  const vertical = waitlistVertical(sp.vertical) ?? waitlistVertical(sp.type);
  if (!WAITLIST_MODE) redirect(localizePath(locale, vertical ? `/register?vertical=${vertical}` : "/register"));
  const w = t.waitlist;
  const phoneExamples = Object.fromEntries(SIGNUP_COUNTRIES.map((c) => [c, getCountryPack(c).phoneExample])) as Record<SignupCountry, string>;
  return (
    <section className="container-page flex justify-center py-12 sm:py-16">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-white p-6 shadow-card sm:p-8">
        <h1 className="type-h2 text-2xl sm:text-3xl">{w.title}</h1>
        <p className="mt-3 text-slate">{w.description}</p>
        <div className="mt-6">
          <WaitlistForm text={w} vertical={vertical} phoneExamples={phoneExamples} />
        </div>
        <p className="mt-6 text-center text-sm text-slate">
          {w.haveAccount}{" "}
          <Link href={localizePath(locale, "/login")} className="font-semibold text-waza-700 hover:underline">
            {w.login}
          </Link>
        </p>
      </div>
    </section>
  );
}
