import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-xl border border-input bg-card px-4 text-base text-ink shadow-[inset_0_1px_2px_rgb(21_18_14/0.04)] transition-[border-color,box-shadow] outline-none placeholder:text-stone/60 sm:text-[0.9375rem]",
        "focus-visible:border-volt-500 focus-visible:ring-4 focus-visible:ring-volt-500/15",
        "aria-invalid:border-ember-600 aria-invalid:ring-ember-600/15 aria-invalid:focus-visible:ring-4",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
