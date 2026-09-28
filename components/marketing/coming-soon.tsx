import Link from "next/link";
import { Construction } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Honest placeholder for pages whose content hasn't been written yet. */
export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="container-page flex max-w-xl flex-col items-center py-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-gold-100 text-[#8a6100]">
        <Construction className="size-7" aria-hidden />
      </span>
      <h1 className="mt-6 text-4xl font-extrabold">{title}</h1>
      <p className="mt-3 text-lg text-slate-waza">{note}</p>
      <Button asChild className="mt-8">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
