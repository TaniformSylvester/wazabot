import Link from "next/link";
import { Construction } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getLocale, getMessages } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/paths";

/** Honest placeholder for pages whose content hasn't been written yet. */
export async function ComingSoon({ title, note }: { title: string; note?: string }) {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <div className="container-page flex max-w-xl flex-col items-center py-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-waza-100 text-waza-800">
        <Construction className="size-7" aria-hidden />
      </span>
      <h1 className="type-h1 mt-6">{title}</h1>
      <p className="type-lead mt-3 text-slate">{note ?? t.pages.comingSoon.note}</p>
      <Button asChild className="mt-8">
        <Link href={localizePath(locale, "/")}>{t.common.nav.backToHome}</Link>
      </Button>
    </div>
  );
}
