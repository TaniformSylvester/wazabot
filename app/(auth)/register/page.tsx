import type { Metadata } from "next";
import Link from "next/link";
import { Construction } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Get Started", robots: { index: false } };

// Placeholder until Phase 2 (Supabase Auth).
export default function RegisterPage() {
  return (
    <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-float">
      <LogoMark className="mx-auto size-12" />
      <h1 className="type-h2 mt-5">Get started with WazaBolt</h1>
      <p className="mt-2 text-stone">Start free — 50 AI conversations every month.</p>
      <div className="mt-8 flex items-start gap-3 rounded-2xl bg-bolt-100 p-4 text-left text-sm text-ink">
        <Construction className="mt-0.5 size-5 shrink-0 text-bolt-800" aria-hidden />
        <p>Accounts are not open yet. Sign-up and login are coming in the next build phase.</p>
      </div>
      <Button asChild variant="outline" className="mt-6 w-full">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
