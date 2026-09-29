"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { WazaBoltLogo } from "@/components/brand/logo";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Messages } from "@/messages/en";

export function MobileNav({ footer, labels }: { footer: React.ReactNode; labels: Messages["dashboard"]["nav"] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={labels.open}
          className="grid size-10 place-items-center rounded-xl text-deep hover:bg-surface lg:hidden"
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="overflow-y-auto border-r-0 bg-deep p-5 text-cream [&>button]:text-cream [&>button:hover]:bg-cream/10">
        <SheetTitle className="sr-only">{labels.navigation}</SheetTitle>
        <SheetDescription className="sr-only">{labels.sections}</SheetDescription>
        <WazaBoltLogo tone="dark" size="sm" />
        <div className="mt-6 flex-1">
          <SidebarNav labels={labels} onNavigate={() => setOpen(false)} />
        </div>
        {footer}
      </SheetContent>
    </Sheet>
  );
}
