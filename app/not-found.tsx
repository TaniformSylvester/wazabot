import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <LogoMark className="size-16" />
      <h1 className="mt-6 text-4xl font-extrabold">Page not found</h1>
      <p className="mt-3 text-slate-waza">We couldn&apos;t find that page.</p>
      <Button asChild className="mt-8">
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  );
}
