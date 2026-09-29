import Link from "next/link";

import { WazaBoltIcon } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <WazaBoltIcon className="size-16" />
      <p className="type-label mt-8 text-waza-700">Error 404</p>
      <h1 className="type-h1 mt-3">This page took a wrong turn</h1>
      <p className="type-lead mt-3 text-slate">We couldn&apos;t find the page you were looking for.</p>
      <Button asChild className="mt-8">
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  );
}
