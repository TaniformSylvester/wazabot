"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <p className="type-label text-ember-700">Something went wrong</p>
      <h1 className="type-h2 mt-3">We couldn&apos;t load this page</h1>
      <p className="type-body mt-2 text-stone">Please try again. If it keeps happening, log out and back in.</p>
      <Button onClick={reset} className="mt-8">
        <RotateCcw /> Try again
      </Button>
    </div>
  );
}
