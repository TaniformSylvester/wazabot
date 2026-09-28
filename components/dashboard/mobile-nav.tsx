"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MobileNav({ footer }: { footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="grid size-10 place-items-center rounded-xl text-ink hover:bg-sand-100 lg:hidden"
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="overflow-y-auto border-r-0 bg-ink p-5 text-sand [&>button]:text-sand [&>button:hover]:bg-sand/10">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Dashboard sections</SheetDescription>
        <Logo tone="dark" size="sm" />
        <div className="mt-6 flex-1">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
        {footer}
      </SheetContent>
    </Sheet>
  );
}
