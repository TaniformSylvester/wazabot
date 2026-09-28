import Link from "next/link";
import { Construction } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Honest placeholder for pages whose content hasn't been written yet. */
export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="container-page flex max-w-xl flex-col items-center py-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-bolt-100 text-bolt-800">
        <Construction className="size-7" aria-hidden />
      </span>
      <h1 className="type-h1 mt-6">{title}</h1>
      <p className="type-lead mt-3 text-stone">{note}</p>
      <Button asChild className="mt-8">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
