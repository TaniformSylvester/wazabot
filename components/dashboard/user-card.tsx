import { LogOut } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";

export function initials(name: string, fallback: string) {
  const source = name.trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function UserCard({ name, email }: { name: string; email: string }) {
  return (
    <div className="rounded-2xl bg-cream/5 p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-waza-500 text-xs font-bold text-deep">
          {initials(name, email)}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-cream">{name || "Your account"}</p>
          <p className="truncate text-xs text-cream/60">{email}</p>
        </div>
      </div>
      <form action={signOut} className="mt-3">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-cream/15 px-3 py-2 text-sm font-medium text-cream/80 transition-colors hover:border-cream/40 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waza-400"
        >
          <LogOut className="size-4" aria-hidden /> Log out
        </button>
      </form>
    </div>
  );
}
