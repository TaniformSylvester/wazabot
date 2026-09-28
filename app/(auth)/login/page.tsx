import type { Metadata } from "next";
import Link from "next/link";
import { Construction } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Login" };

// Placeholder until Phase 2 (Supabase Auth).
export default function LoginPage() {
  return (
    <div className="w-full max-w-md rounded-3xl border border-border bg-white p-8 text-center shadow-float">
      <h1 className="text-3xl font-extrabold">Welcome back</h1>
      <p className="mt-2 text-slate-waza">Log in to manage your AI receptionist.</p>
      <div className="mt-8 flex items-start gap-3 rounded-2xl bg-gold-100 p-4 text-left text-sm text-deep">
        <Construction className="mt-0.5 size-5 shrink-0 text-[#8a6100]" aria-hidden />
        <p>Accounts are not open yet. Sign-up and login are coming in the next build phase.</p>
      </div>
      <Button asChild variant="outline" className="mt-6 w-full">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
