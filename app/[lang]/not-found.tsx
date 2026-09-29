import Link from "next/link";

import { WazaBoltIcon } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

export default async function NotFound() {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <WazaBoltIcon className="size-16" />
      <p className="type-label mt-8 text-waza-700">{t.pages.notFound.label}</p>
      <h1 className="type-h1 mt-3">{t.pages.notFound.title}</h1>
      <p className="type-lead mt-3 text-slate">{t.pages.notFound.text}</p>
      <Button asChild className="mt-8">
        <Link href={localizePath(locale, "/")}>{t.common.nav.backToHome}</Link>
      </Button>
    </main>
  );
}
